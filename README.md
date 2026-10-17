# MasterHUB Community

Version **0.4.0-test.2** (Beta), for Cooler Master MasterHUB **1.0.0.113** on Windows.

Community repairs, custom add-ons and a partial Stream Deck plugin host. This project contains community source and a patch builder, not Cooler Master's application archive, drivers or third-party plugins. It is not affiliated with Cooler Master or Elgato.

## Install

1. Install Python 3.10+ if needed.
2. Download the source-installer ZIP from a GitHub release and extract it. Do not use GitHub's generic Source code download.
3. Fully exit MasterHUB and MHDaemon.
4. Right-click Apply.cmd → Run as administrator, using your normal Windows account.
5. Start MasterHUB. Click **Community**, bottom left.

Main 0.3.1 and older need this one-time installer upgrade for channel switching. Existing Beta 0.4.0-test.1 installations already have the required bootstrap and can update automatically.

The installer accepts the supported vendor archive and recognized community installations with their original backup. Unknown versions are rejected. For another install location: `.\Install.ps1 -InstallPath 'D:\Apps\MasterHUB'`. Installation seeds only the account running the installer. Restore.cmd restores the original vendor application and preserves community data and profiles.

## Community menu

- **Add-ons**: manage custom actions, save profiles and view the collapsible activity log.
- **Stream Deck**: import and configure supported plugins.
- **Updates**: installed version, Main/Beta selector, last check and Check now.
- **Video · Beta**: play a local video on one empty key with audio on the normal Windows output. Start at 2 FPS and try examples/video-demo.webm. Keep the app window open. YouTube URLs are not implemented.

Panels can still be moved and resized independently so you can drag actions onto empty keys.

## Updates and channels

Choose **Community → Updates → Main or Beta**. Main selects the latest stable GitHub release. Beta selects the latest numbered `-test.N` prerelease from the existing test branch. Returning to Main can intentionally install a lower version. Your settings, accounts and profiles remain outside the version folders.

Checks run 35 seconds after startup and every six hours while the app runs. A channel switch checks immediately. Check now is limited to once per minute. The Updates panel refreshes displayed status every five seconds while open; this does not query GitHub.

Verified downloads activate only after fully exiting and reopening MasterHUB, including after a PC reboot. Closing to tray is insufficient. No forced restarts. At most two installed community versions are kept: current + pending, then current + previous until 20 seconds of healthy renderer startup. Confirmation deletes the previous version; an unconfirmed activation rolls back on next launch.

The separate **MasterHUB Community updates** tray menu also offers channel switching. Old bootstrap-2 installations may label Beta as Test; they mean the same channel.

The source stays fixed to dreadnaughtgaming/MasterHubCommunity. Ed25519 signatures and SHA-256 hashes verify updates. No source-URL setting is exposed. Full community bundles are downloaded, not binary deltas or vendor software. Network failures preserve the current version. Bootstrap or vendor-hook changes require an installer; source-module changes update automatically.

## Other features

Persistent horizontal/vertical layout choice, profile saving repairs, connection retries and encrypted account storage remain included. Choose orientation once to save it per base. Third-party add-ons execute desktop code and are not sandboxed. Stream Deck compatibility is partial; see [STREAMDECK.md](STREAMDECK.md) and [ADDON-API.md](ADDON-API.md).

See [UPDATING.md](UPDATING.md) for publishing and [TEST-RESULTS.md](TEST-RESULTS.md) for verification limits.

## License

Community source is MIT. Bundled Tiebe/elgato-decrypter retains its MIT notice in src/streamdeck/decrypter/LICENSE. Vendor software and imported plugins retain their own terms. Do not redistribute the vendor app.asar without permission.
