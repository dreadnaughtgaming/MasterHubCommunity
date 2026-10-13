import sys
import argparse
import logging
from .constants import DEFAULT_BINARY_PATH, MAGIC_ELGATO
from .extractor import KeyExtractor
from .crypto import derive_key
from .archive import decrypt_manifest, process_plugin_package

def main():
    parser = argparse.ArgumentParser(description="Decrypt ELGATO-encrypted manifest files")
    parser.add_argument("input_path", help="Path to encrypted manifest.json or .streamDeckPlugin file")
    parser.add_argument("output_file", nargs="?", help="Optional output path (only for single manifest file)")
    parser.add_argument("--binary", default=DEFAULT_BINARY_PATH, help="Path to StreamDeck.exe for key extraction")
    args = parser.parse_args()

    # Determine mode based on file extension or magic
    input_path = args.input_path
    is_zip = False

    if input_path.endswith(".streamDeckPlugin") or input_path.endswith(".zip"):
        is_zip = True
    else:
        # Check magic bytes
        try:
            with open(input_path, "rb") as f:
                magic = f.read(4)
            if magic == b'PK\x03\x04':
                is_zip = True
        except FileNotFoundError:
            print(f"[-] Error: File not found: {input_path}")
            sys.exit(1)

    # Extract keys first
    print(f"[*] Extracting keys from: {args.binary}")
    extractor = KeyExtractor(args.binary)
    keys = extractor.extract()

    if not keys:
        print("[-] Fatal: Could not extract keys from binary.")
        sys.exit(1)

    v1_indices, v2_indices, v3_indices, xor_mask = keys

    print("Deriving keys from constants...")
    vault2_key = derive_key(v2_indices, xor_mask)
    vault3_key = derive_key(v3_indices, xor_mask)

    if is_zip:
        if args.output_file:
            print("[-] Output file argument is ignored for .streamDeckPlugin (in-place modification).")
        process_plugin_package(input_path, vault2_key, vault3_key)
    else:
        # Single file mode
        print(f"Reading: {input_path}")
        with open(input_path, "rb") as f:
            file_data = f.read()

        if file_data[:6] != MAGIC_ELGATO:
            print("File does not have ELGATO header - it may already be plaintext.")
            sys.exit(1)

        print(f"Decrypting ({len(file_data)} bytes)...")
        try:
            plaintext = decrypt_manifest(file_data, vault2_key, vault3_key)
        except Exception as e:
            print(f"[-] Decryption failed: {e}")
            sys.exit(1)

        if args.output_file:
            with open(args.output_file, "wb") as f:
                f.write(plaintext)
            print(f"Written to: {args.output_file}")
        else:
            try:
                print("\n--- Decrypted Content ---")
                print(plaintext.decode("utf-8"))
            except UnicodeDecodeError:
                print(f"\n[Binary output, {len(plaintext)} bytes - specify output file to save]")

if __name__ == "__main__":
    main()
