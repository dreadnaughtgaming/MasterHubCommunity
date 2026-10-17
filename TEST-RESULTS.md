# Verification

87 automated Node tests passed with the vendor WebSocket module available, no failures or skips. GitHub CI skips that one vendor integration test because vendor code is not redistributed.

Coverage includes updater signatures, channel switching and downgrade, rollback, two-slot retention, a 35-second startup check and six-hour interval, a single Community launcher, channel-error UI recovery, status polling cleanup, profiles and Stream Deck integration. Beta also tests video frame delivery and stop/restore behavior.

Both publisher-signed bundles verified against source. Real-bundle migration 0.3.1 → 0.3.2 → Beta → Main passed, including two-to-one cleanup and no video modules in Main. Patched archive reconstruction preserved 4,927 entries, modified two vendor files and added five bootstrap files. Both channels use the same bootstrap archive.

Windows execution, visual appearance in Electron and real hardware playback remain unverified here.
