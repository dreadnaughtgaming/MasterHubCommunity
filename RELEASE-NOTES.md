# 0.3.2 — Main/Beta switching and cleaner controls

- Both Main and Beta now include **Community → Updates** with a Main/Beta selector.
- Automatic update check 35 seconds after startup, then every six hours while running. Changing channel checks immediately; Check now is also available.
- One bottom-left Community menu groups Add-ons, Stream Deck and Updates.
- Clear installed version, channel, last-check time and pending restart status.
- Consistent panel styling, resizable/draggable windows and a collapsible activity log.
- Existing signed downloads, profile preservation and maximum two installed versions retained.

## Installation

**Main 0.3.1 and older require a one-time installer upgrade** because their bootstrap cannot switch channels. Download the source-installer ZIP, extract it, fully exit MasterHUB and MHDaemon, then run Apply.cmd as administrator using your normal Windows account. Python 3.10+ is required.

Existing 0.4.0-test.1 users can receive this Beta update automatically or switch to Main using their existing channel selector. After installation, open **Community → Updates**. Select Main or Beta; completely exit and reopen MasterHUB after the download. The updater never restarts the app during use.

Beta remains the existing `test` GitHub branch and `-test.N` prerelease series; Main uses stable releases. Video remains Beta-only. No Windows hardware or visual verification was performed for this release; automated tests and installer reconstruction passed.
