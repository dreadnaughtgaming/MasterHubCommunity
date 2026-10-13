import os
import mmap
import struct
from .constants import DEFAULT_BINARY_PATH

class KeyExtractor:
    def __init__(self, binary_path=None):
        self.binary_path = binary_path or DEFAULT_BINARY_PATH
        self.mm = None
        self.sections = []

    def _parse_pe_sections(self):
        """Minimal PE section parser to map RVA <-> File Offset."""
        try:
            # DOS Header
            e_magic = self.mm[0:2]
            if e_magic != b'MZ':
                raise ValueError("Not a valid PE file")

            e_lfanew = struct.unpack_from("<I", self.mm, 0x3C)[0]

            # PE Header
            pe_sig = self.mm[e_lfanew:e_lfanew+4]
            if pe_sig != b'PE\0\0':
                raise ValueError("Invalid PE signature")

            # File Header
            # Machine(2) + NumberOfSections(2) is at offset 4+2=6
            num_sections = struct.unpack_from("<H", self.mm, e_lfanew + 4 + 2)[0]
            # SizeOfOptionalHeader is at offset 4+16=20
            size_opt_header = struct.unpack_from("<H", self.mm, e_lfanew + 4 + 16)[0]

            # Section Table starts after Optional Header
            # Optional Header starts at e_lfanew + 4 + 20 = e_lfanew + 24
            section_table_offset = e_lfanew + 0x18 + size_opt_header

            self.sections = []
            for i in range(num_sections):
                entry_offset = section_table_offset + (i * 40)
                # Name (8)
                # VirtualSize (4) at +8
                # VirtualAddress (4) at +12
                # SizeOfRawData (4) at +16
                # PointerToRawData (4) at +20
                v_addr = struct.unpack_from("<I", self.mm, entry_offset + 12)[0]
                raw_size = struct.unpack_from("<I", self.mm, entry_offset + 16)[0]
                raw_ptr = struct.unpack_from("<I", self.mm, entry_offset + 20)[0]

                self.sections.append({
                    'v_addr': v_addr,
                    'raw_size': raw_size,
                    'raw_ptr': raw_ptr
                })

            return True
        except Exception as e:
            print(f"[-] PE parsing failed: {e}")
            return False

    def _offset_to_rva(self, offset):
        """Convert raw file offset to RVA."""
        for sec in self.sections:
            if sec['raw_ptr'] <= offset < sec['raw_ptr'] + sec['raw_size']:
                return sec['v_addr'] + (offset - sec['raw_ptr'])
        return None

    def _rva_to_offset(self, rva):
        """Convert RVA to raw file offset."""
        for sec in self.sections:
            if sec['v_addr'] <= rva < sec['v_addr'] + sec['raw_size']:
                return sec['raw_ptr'] + (rva - sec['v_addr'])
        return None

    def extract(self):
        """Extract keys from the binary. Returns (vault1, vault2, vault3, xor_mask) or None."""
        if not os.path.exists(self.binary_path):
            print(f"[-] Binary not found at {self.binary_path}. Cannot extract keys.")
            return None

        try:
            with open(self.binary_path, "rb") as f:
                self.mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)

                if not self._parse_pe_sections():
                    print("[-] Failed to parse PE sections.")
                    return None

                # Search for PCG seed: 0x02E1209782B72C06
                seed_bytes = bytes.fromhex("06 2C B7 82 97 20 E1 02")
                matches = []

                pos = 0
                while True:
                    pos = self.mm.find(seed_bytes, pos)
                    if pos == -1:
                        break
                    matches.append(pos)
                    pos += 1

                if len(matches) < 3:
                    print(f"[-] Found {len(matches)} PCG seed matches, expected 3.")
                    return None

                print(f"[+] Found {len(matches)} PCG seed matches. Extracting constants...")

                matches.sort()
                v3_offset = matches[0]
                v2_offset = matches[1]
                v1_offset = matches[2]

                try:
                    print("[*] Extracting Vault 3 (Public) indices...")
                    v3_indices = self._extract_indices(v3_offset)

                    print("[*] Extracting Vault 2 (Private) indices...")
                    v2_indices = self._extract_indices(v2_offset)

                    print("[*] Extracting Vault 1 (Signing) indices...")
                    v1_indices = self._extract_indices(v1_offset)

                    print("[*] Extracting XOR Mask...")
                    xor_mask = self._extract_xor_mask(v3_offset)

                    print("[+] Successfully extracted all constants from binary.")
                    return v1_indices, v2_indices, v3_indices, xor_mask

                except Exception as e:
                    print(f"[-] Error during extraction: {e}")
                    return None

        except Exception as e:
            print(f"[-] Extraction failed: {e}")
            return None
        finally:
            if self.mm:
                self.mm.close()

    def _extract_indices(self, seed_offset):
        """Scan backwards from seed for 7 movdqa instructions."""
        start_search = max(0, seed_offset - 300)
        chunk = self.mm[start_search:seed_offset]

        op_offset = 0
        movdqa_locs = []
        while True:
            op_offset = chunk.find(b'\x66\x0F\x6F', op_offset)
            if op_offset == -1:
                break

            if op_offset + 3 < len(chunk):
                modrm = chunk[op_offset + 3]
                if (modrm & 0xC7) == 0x05:
                    movdqa_locs.append(start_search + op_offset)

            op_offset += 1

        if len(movdqa_locs) < 7:
            raise ValueError(f"Found only {len(movdqa_locs)} movdqa instructions before seed")

        relevant_locs = movdqa_locs[-7:]
        indices = bytearray()

        for loc in relevant_locs:
            disp_offset = loc + 4
            disp_bytes = self.mm[disp_offset:disp_offset+4]
            disp = struct.unpack("<i", disp_bytes)[0]

            next_instr_offset = loc + 8
            next_instr_rva = self._offset_to_rva(next_instr_offset)
            if next_instr_rva is None:
                raise ValueError(f"Could not map instruction offset {next_instr_offset} to RVA")

            target_rva = next_instr_rva + disp
            target_offset = self._rva_to_offset(target_rva)
            if target_offset is None:
                 raise ValueError(f"Could not map Target RVA {target_rva} to offset")

            indices.extend(self.mm[target_offset:target_offset+16])

        return bytes(indices[:32])

    def _extract_xor_mask(self, seed_offset):
        """Scan forward from seed for LEA instruction loading the mask."""
        chunk = self.mm[seed_offset:seed_offset+400]
        pos = 0

        while True:
            pos = chunk.find(b'\x8D', pos)
            if pos == -1:
                raise ValueError("Could not find XOR mask LEA instruction")

            if pos > 0 and chunk[pos-1] in [0x48, 0x4C]:
                if pos + 1 < len(chunk):
                    modrm = chunk[pos+1]
                    if (modrm & 0xC7) == 0x05:
                        lea_start = seed_offset + pos - 1
                        disp_offset = lea_start + 3
                        disp_bytes = self.mm[disp_offset:disp_offset+4]
                        disp = struct.unpack("<i", disp_bytes)[0]

                        next_instr_offset = lea_start + 7
                        next_instr_rva = self._offset_to_rva(next_instr_offset)
                        if next_instr_rva is None:
                            continue

                        target_rva = next_instr_rva + disp
                        target_offset = self._rva_to_offset(target_rva)
                        if target_offset is None:
                            continue

                        return self.mm[target_offset:target_offset+32]
            pos += 1
