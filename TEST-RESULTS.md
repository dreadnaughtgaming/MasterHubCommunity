# 0.4.0-test.1 verification

- 83 Node tests passed, no skips, with the installed vendor WebSocket module supplied via MASTERHUB_WS_PATH. On GitHub CI, the one vendor WebSocket integration test is skipped because vendor files are not redistributed.
- Tests cover video target isolation, empty keys, folder back keys, page/profile/disconnect changes, frame backpressure, overlapping start/stop, driver response errors/timeouts, JPEG validation, and button restoration callbacks.
- Updater tests cover signed metadata, tampering, interrupted activation, rollback, numeric prerelease ordering, channel isolation, intentional Test-to-older-Stable switching and two-slot retention.
- A mocked Electron test confirms the bootstrap tray can switch from old stable code back to Test independently of renderer controls.
- Real publisher-signed 0.3.1 and 0.4.0-test.1 bundles passed fresh installer seeding, installer upgrade staging, Test → Stable → Test activation, and two-to-one cleanup.
- Test bundle signature, compressed hash, file hashes and exact correspondence with src verified.
- Built the patched archive from the supported original 1.0.0.113 archive: 4,927 original entries unchanged, two modified vendor files and five bootstrap files added. Archive round-trip matched all expected files.
- Installer package contains the generated WebM sample and signed community bundle; no vendor ASAR or private signing key.

Not verified here: actual Windows installer execution, Electron window appearance, hardware video playback, achievable frame rate, codec availability, or Windows audio routing. These need testing on the user's machine. YouTube URL playback is not implemented.
