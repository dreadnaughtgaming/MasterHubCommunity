# Verification — 0.3.0

Performed 2026-10-13 in Linux with Node 24 and Python 3.12. This is not a Windows or hardware acceptance test.

- **55 Node tests passed, 0 failed, 0 skipped** with the existing vendor WebSocket dependency supplied through `MASTERHUB_WS_PATH`.
- In the repository's dependency-free CI run, that one vendor-dependent WebSocket loopback test is intentionally skipped. The remaining 54 tests run without downloading packages.
- Update coverage includes numeric version ordering; signature, payload and compatibility rejection; unsafe paths and symlinks; staging and superseding a pending release; current + pending retention; activation; startup confirmation; rollback; failed-release suppression; recovery at five activation journal/rename boundaries; partial download cleanup; fixed download URLs; offline operation; invalid-download preservation; concurrent-check coalescing; bootstrap runtime path selection; duplicate-process exclusion; and main-module startup failure.
- Previous profile, account vault, connection, action binding, Stream Deck host and importer tests continue to pass.
- Rebuilt against the original vendor archive SHA-256 `a80844ac26e9478023213095006bf88db178712fb7a2e1be7b244d8445202f3f`. ASAR round-trip verified. Exactly two existing vendor files changed; 4 bootstrap files added; **4,927 existing entries unchanged**. No community `dng/` version is embedded in the bootstrap archive.
- Both modified vendor JavaScript bundles pass `node --check`.
- Generated signed 0.3.0 release and verified all installed file hashes after the Python installer seeding step. Full community download: **45,822 bytes**.
- Package contents are selected by an explicit allowlist. Publisher private key and vendor archives are excluded. The bundled upstream MIT license is retained.

Not yet verified: PowerShell execution on Windows, real Electron/device startup, GitHub Actions execution in the owner's repository, and a real download/activation from a published GitHub release. Run the Windows smoke checks in UPDATING.md before broad distribution. This version does not claim a new fix for the earlier encrypted-plugin import error.
