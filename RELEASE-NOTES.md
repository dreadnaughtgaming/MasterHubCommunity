# MasterHUB Community 0.3.1

Fixes the layout reverting to vertical after a restart.

- Saves Horizontal/Vertical immediately for each MasterHUB base device.
- Restores the choice before the interface mounts.
- Prevents startup and reconnect device-status reports from overwriting a saved preference.
- Keeps manual switching in either direction working.
- Stores the preference outside the update slots so future updates retain it.

**After updating, select your preferred layout once.** Earlier versions did not save this choice, so it cannot be recovered automatically.

Existing 0.3.0 users: open **Add-ons → Check for updates**, wait for 0.3.1 to download, then fully exit MasterHUB from the tray and reopen it. Wait at least 20 seconds for startup confirmation. No administrator reinstall is required.

New users: download the **source-installer.zip** release asset, extract it, close MasterHUB and MHDaemon, and run **Apply.cmd** as administrator. Requires the supported vendor build 1.0.0.113 and Python 3.10+.

Regression tests cover fresh-start restoration, delayed/repeated hardware reports, reconnects, both directions, separate devices, corrupt-file recovery, and write failures. Windows/device confirmation is still needed. Stream Deck compatibility and the earlier encrypted-plugin import issue are unchanged.
