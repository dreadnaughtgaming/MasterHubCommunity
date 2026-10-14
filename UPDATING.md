# Experimental channel updates

This branch uses bootstrap ABI 2. Install the test source-installer once to migrate from ABI 1. The installer stages Test beside the current version and selects Test. On next launch it activates, retains the prior version until health confirmation, then deletes it.

Stable: GitHub releases/latest, non-prerelease only. Test: highest numeric X.Y.Z-test.N prerelease, searching up to 150 recent releases. Repository and Ed25519 public key remain pinned. Clients can select a channel, not a different repository.

Use Add-ons or the bootstrap-owned MasterHUB Community updates tray menu. The tray survives a downgrade to stable 0.3.1. A channel switch cancels an old pending download and permits a lower version from the other channel. Startup confirmation must finish before switching again. An unconfirmed activation rolls back and restores the prior channel.

Only current plus pending, or current plus previous during activation, are retained as installed community versions. Downloads are verified in memory. No delta patching is used. Activation happens on full application restart, including after a reboot; closing to tray is insufficient.

## Publishing

For Test, use package version X.Y.Z-test.N and channel test on the test branch. Commit source and matching signed-release assets, or configure the existing MHC_UPDATE_SIGNING_KEY Actions secret. Never commit the private key. Pushing a package version triggers the test workflow, which publishes a prerelease with latest=false. Do not merge this experimental workflow into main. Stable publishing remains on main.

Bootstrap changes need a new installer. Community src changes can update automatically. Bootstrap 2 accepts old ABI-1 stable bundles; ABI 1 rejects ABI-2 releases.
