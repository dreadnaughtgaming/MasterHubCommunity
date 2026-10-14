# MasterHUB Community

Experimental community repairs and add-ons for Cooler Master MasterHUB **1.0.0.113** on Windows. Experimental community version **0.4.0-test.1** includes automatic, signed updates from **dreadnaughtgaming/MasterHubCommunity**.

This repository contains community source and a patch builder. It does not contain Cooler Master's application archive, firmware, drivers, or third-party Stream Deck plugins. It is not affiliated with Cooler Master or Elgato.

## Install this experimental build (including upgrades from 0.3.x)

1. Install Python **3.10+**, including the Python launcher, if not already installed.
2. Download the `MasterHUB-Community-…-source-installer.zip` **release asset**, and extract it. GitHub's generic “Source code” downloads do not contain the signed initial release and cannot be installed directly.
3. Fully exit MasterHUB through its tray icon. Close MHDaemon too if still running.
4. Right-click `Apply.cmd` → **Run as administrator**, using the same Windows account you normally use for MasterHUB. Do not elevate with a different user's credentials.
5. Start MasterHUB normally. Open **Add-ons**, bottom left, to see the community version and update status.

This test needs a one-time installer run to add bootstrap 2 and channel switching. It selects the Test channel. Future compatible updates install automatically.

The installer builds a small bootstrap patch locally from your original vendor archive. It accepts the exact previously tested 1.0.0.113 archive and known 0.1–0.2.3 community installations with their original backup. It refuses unknown vendor versions instead of guessing patch offsets. For a non-default installation folder, run elevated PowerShell:

```powershell
.\Install.ps1 -InstallPath 'D:\Apps\MasterHUB'
```

Installation affects the Windows account running the installer. Other Windows accounts need their own seeded community slot before running this patched app. Multi-user provisioning is not automated in this release.

`Restore.cmd` restores the original vendor application; it preserves profiles, accounts, add-ons, and community data. Your original vendor archive remains as `resources\app.asar.community-original`. This is a fixed restore baseline, not a retained community release.

## Local video experiment

1. Keep one key empty on the current page of a 15-key or 4-key module.
2. Click **Video • Test**, bottom left.
3. Choose `examples/video-demo.webm` from the extracted installer, or your own local video.
4. Select the empty key, leave the limit at **2 FPS**, and press Play in the preview.
5. Audio plays through the normal Windows output. Stop or close the panel to restore the key image.

This first prototype sends a small, letterboxed image to **one key**. It does not save a button action or change profiles. It stops when that key is no longer empty, the page/profile changes, or the device disconnects. It waits for each display reply; a driver timeout disables further video attempts until app restart.

Keep the app window open. Minimized playback and codec support depend on the installed Electron build. Try the included WebM first. Hardware playback and achievable frame rate still need user testing. **YouTube URLs and multi-button video are not implemented.** The sample is a generated five-second pattern with a quiet tone, not third-party content.

## Stable / Test switching

Open **Add-ons → Update channel** and choose Stable / main or Test / experimental. The updater downloads that channel's release; completely exit and reopen MasterHUB to activate it. Switching to Stable can intentionally install an older version.

The bootstrap also adds a Windows tray icon with the tooltip **MasterHUB Community updates**. Its menu provides both channels and update status. Use this menu to return to Test after switching to Stable 0.3.1, whose Add-ons panel has no channel selector.

Only releases from the fixed repository are accepted. Test uses signed `vX.Y.Z-test.N` GitHub prereleases; Stable uses the latest non-prerelease. This experiment is published on `test`; `main` remains stable.

## Automatic updates

- The fixed repository is https://github.com/dreadnaughtgaming/MasterHubCommunity. Stable uses releases/latest; Test checks prereleases.
- A background check runs about 35 seconds after startup, then every six hours. **Check for updates** in Add-ons also checks, limited to once per minute.
- Downloads contain the complete community code, not binary differences and not the vendor application. Ed25519 publisher signatures and SHA-256 file hashes are checked before staging and on startup.
- Downloads do not interrupt a running stream. Fully exit and reopen MasterHUB to activate, or let a reboot and subsequent launch do so. Closing the window to the tray is not a restart.
- At most **two installed community versions** are kept: current + pending, or new current + previous during first-start verification. The previous version is deleted after the new renderer reports ready and remains alive for 20 seconds. No downloaded update archive is kept.
- An unconfirmed startup rolls back on the next launch. That failed version is skipped until a newer release appears. Closing the app in the first 20 seconds also counts as unconfirmed. After health confirmation deletes the old version, automatic rollback to it is no longer possible.
- Network failures keep the existing version usable. Checks do not upload your profiles, credentials, or plugins.
- No client setting changes the update source. This is open-source software; someone modifying their local code can still change it.

The bootstrap and vendor integration hooks are deliberately fixed. Updates can change all community modules, including add-on and Stream Deck functionality. Changes to the bootstrap, publisher key, vendor hooks, or supported vendor version require a new installer; bootstrap 2 accepts both legacy stable bootstrap-1 bundles and bootstrap-2 bundles; bootstrap 1 cannot install this test automatically.

## Layout persistence in 0.3.1

Choose Horizontal or Vertical once after installing this update. That choice is saved immediately per base device and restored after restarts and reconnects. Startup hardware orientation reports no longer overwrite a saved choice. Preferences live in `%APPDATA%\MasterHub\community\orientation.json`, outside the update slots.

## Features carried forward

Profile-save repairs, connection retries, encrypted account persistence, draggable/resizable Add-ons and Stream Deck panels, custom JavaScript actions, and a partial Stream Deck protocol host with integrated elgato-decrypter. See [ADDON-API.md](ADDON-API.md) and [STREAMDECK.md](STREAMDECK.md). Third-party plugins are desktop code and are not sandboxed. Compatibility with every Stream Deck plugin is not promised. The previously reported encrypted-plugin import error still needs its actual error text to diagnose; this release does not claim to fix it.

## Publishing updates

See [UPDATING.md](UPDATING.md). On this branch use version `X.Y.Z-test.N` and channel `test`. Push the source and matching signed bundle to `test`; GitHub Actions publishes a prerelease without changing the latest stable release. Stable clients receive stable releases; Test clients receive test prereleases. Drafts are excluded.

## Verification

See [TEST-RESULTS.md](TEST-RESULTS.md). Automated tests and patch reconstruction ran in Linux. This new updater/installer has **not been run on a Windows MasterHUB device** yet. Test the initial install and one real GitHub update before wider distribution.

## License

Our source is MIT, as in [LICENSE](LICENSE). The bundled Tiebe/elgato-decrypter code retains its own MIT notice at `src/streamdeck/decrypter/LICENSE` (upstream commit `68ca6fb62b2e57e7f9834dd3b75cb99d75be96d8`). Third-party vendor software and imported plugins retain their own terms. Do not upload an entire modified vendor `app.asar` as a project release without the necessary redistribution rights.
