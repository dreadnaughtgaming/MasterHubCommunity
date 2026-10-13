import struct
import math
import cbor2
import hashlib
import zipfile
import shutil
import tempfile
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.hashes import SHA256

from .constants import MAGIC_ELGATO, MAGIC_INFO, MAGIC_META, MAGIC_DATA
from .crypto import pcg_xor_decrypt

def parse_header(data):
    """Parse the 32-byte ELGATO archive header."""
    if len(data) < 32:
        raise ValueError("File too small for ELGATO header")

    magic = data[0:6]
    if magic != MAGIC_ELGATO:
        raise ValueError(f"Invalid magic: {magic!r} (expected {MAGIC_ELGATO!r})")

    version = struct.unpack_from("<H", data, 6)[0]
    if version != 1:
        raise ValueError(f"Unsupported version: {version}")

    total_size, entries_end, xor_seed = struct.unpack_from("<QQQ", data, 8)
    return total_size, entries_end, xor_seed


def parse_entry_table(data):
    """Parse the entry table into a list of (magic, offset, size) tuples."""
    if len(data) % 32 != 0:
        raise ValueError(f"Entry table size {len(data)} is not 32-byte aligned")

    entries = []
    for i in range(0, len(data), 32):
        entry_magic = struct.unpack_from("<I", data, i)[0]
        offset = struct.unpack_from("<Q", data, i + 4)[0]
        size = struct.unpack_from("<Q", data, i + 12)[0]
        entries.append((entry_magic, offset, size))
    return entries


def find_entry(entries, magic):
    """Find an entry by its magic value."""
    for entry_magic, offset, size in entries:
        if entry_magic == magic:
            return offset, size
    raise ValueError(f"Entry 0x{magic:08X} not found")


def decrypt_manifest(file_data, vault2_key, vault3_key):
    """Decrypt an ELGATO-encrypted manifest file. Returns the plaintext bytes."""

    # 1. Parse header
    total_size, entries_end, xor_seed = parse_header(file_data)

    if total_size != len(file_data):
        raise ValueError(f"Header total_size ({total_size}) != file size ({len(file_data)})")

    print(f"  Header: total_size={total_size}, entries_end={entries_end}, xor_seed=0x{xor_seed:016X}")

    # 2. Read and decrypt entry table
    entry_table_raw = file_data[32:entries_end]
    entry_table_dec = pcg_xor_decrypt(entry_table_raw, xor_seed, 32)
    entries = parse_entry_table(entry_table_dec)

    print(f"  Entries ({len(entries)}):")
    for magic, offset, size in entries:
        name = struct.pack("<I", magic).decode("ascii", errors="replace")
        print(f"    {name} (0x{magic:08X}): offset={offset}, size={size}")

    # 3. Read and decrypt META entry
    meta_offset, meta_size = find_entry(entries, MAGIC_META)
    meta_file_pos = entries_end + meta_offset
    meta_raw = file_data[meta_file_pos:meta_file_pos + meta_size]
    meta_dec = pcg_xor_decrypt(meta_raw, xor_seed, meta_file_pos)

    # 4. Parse META (CBOR encoded)
    meta = cbor2.loads(meta_dec)

    data_size = meta["data_size"]
    block_size = meta["block_size"]
    eph_pk = bytes(meta["eph_pk"])
    app_pk_hash = bytes(meta["app_pk_hash"])
    salt = bytes(meta["salt"])
    ivs = [bytes(iv) for iv in meta["IVs"]]
    tags = [bytes(tag) for tag in meta["tags"]]

    num_blocks = math.ceil(data_size / block_size) if block_size > 0 else 0

    print(f"  META: data_size={data_size}, block_size={block_size}, num_blocks={num_blocks}")
    print(f"    eph_pk:      {eph_pk.hex()}")
    print(f"    salt:        {salt.hex()}")
    print(f"    app_pk_hash: {app_pk_hash.hex()}")
    print(f"    IVs count:   {len(ivs)}")
    print(f"    Tags count:  {len(tags)}")

    # 5. Verify app_pk_hash matches SHA-256(vault3_key)
    vault3_hash = hashlib.sha256(vault3_key).digest()
    if vault3_hash != app_pk_hash:
        raise ValueError(
            f"app_pk_hash mismatch!\n"
            f"  Expected (SHA256 of vault3): {vault3_hash.hex()}\n"
            f"  Got from META:               {app_pk_hash.hex()}"
        )
    print("  app_pk_hash verification: OK")

    # 6. Derive per-file AES key
    #    a. X25519 ECDH: shared_secret = X25519(vault2_private, eph_pk)
    private_key = X25519PrivateKey.from_private_bytes(vault2_key)
    public_key = X25519PublicKey.from_public_bytes(eph_pk)
    shared_secret = private_key.exchange(public_key)

    #    b. HKDF-SHA256: aes_key = HKDF(key=shared_secret, salt=salt, info=b"") -> 32 bytes
    hkdf = HKDF(algorithm=SHA256(), length=32, salt=salt, info=b"")
    aes_key = hkdf.derive(shared_secret)

    print(f"  Derived AES key: {aes_key.hex()}")

    # 7. Decrypt DATA blocks
    data_offset, data_entry_size = find_entry(entries, MAGIC_DATA)
    aesgcm = AESGCM(aes_key)

    plaintext_parts = []
    remaining = data_size

    for i in range(num_blocks):
        # Calculate block boundaries
        block_start = i * block_size
        this_block_size = min(block_size, remaining)

        # Read and XOR-decrypt the encrypted block from DATA
        block_file_pos = entries_end + data_offset + block_start
        block_raw = file_data[block_file_pos:block_file_pos + this_block_size]
        block_dec = pcg_xor_decrypt(block_raw, xor_seed, block_file_pos)

        # AES-256-GCM decrypt
        iv = ivs[i]
        tag = tags[i]
        # AESGCM expects ciphertext + tag concatenated
        ciphertext_with_tag = block_dec + tag
        plaintext_block = aesgcm.decrypt(iv, ciphertext_with_tag, None)

        plaintext_parts.append(plaintext_block)
        remaining -= len(plaintext_block)

        if (i + 1) % 10 == 0 or i == num_blocks - 1:
            print(f"  Decrypted block {i+1}/{num_blocks}")

    plaintext = b"".join(plaintext_parts)
    print(f"  Total decrypted size: {len(plaintext)} bytes")
    return plaintext


def process_plugin_package(plugin_path, vault2_key, vault3_key):
    """
    Process a .streamDeckPlugin file (ZIP), decrypting manifest.json in-place.
    """
    print(f"Processing plugin package: {plugin_path}")

    # Create a temporary file for the new zip
    fd, temp_zip_path = tempfile.mkstemp(suffix=".streamDeckPlugin")
    os.close(fd)

    manifest_decrypted = False

    try:
        with zipfile.ZipFile(plugin_path, 'r') as zin:
            with zipfile.ZipFile(temp_zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
                for item in zin.infolist():
                    data = zin.read(item.filename)

                    if item.filename.endswith("manifest.json"):
                        # Check if encrypted
                        if data.startswith(MAGIC_ELGATO):
                            print(f"Found encrypted manifest: {item.filename}")
                            try:
                                decrypted_data = decrypt_manifest(data, vault2_key, vault3_key)
                                print(f"  Decrypted successfully ({len(decrypted_data)} bytes)")
                                zout.writestr(item, decrypted_data)
                                manifest_decrypted = True
                                continue
                            except Exception as e:
                                print(f"  [-] Failed to decrypt {item.filename}: {e}")
                                # Fall through to write original data
                        else:
                            print(f"Manifest {item.filename} is not encrypted.")

                    # Copy original file
                    zout.writestr(item, data)

        if manifest_decrypted:
            # Replace original file with new zip
            shutil.move(temp_zip_path, plugin_path)
            print(f"[+] Successfully updated {plugin_path} with decrypted manifest.")
        else:
            print("[*] No encrypted manifest found or decryption failed. File unchanged.")
            os.remove(temp_zip_path)

    except Exception as e:
        print(f"[-] Error processing plugin package: {e}")
        if os.path.exists(temp_zip_path):
            os.remove(temp_zip_path)
