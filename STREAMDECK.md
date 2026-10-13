# Stream Deck compatibility — Community 0.2.3

Experimental support for part of Elgato's plugin protocol inside MasterHUB. This does not include Elgato's application or promise universal compatibility. Real third-party plugins have not yet been validated on Windows.

## Start with the included counter

1. Install using Apply.cmd, then open MasterHUB and its **Stream Deck** panel.
2. Choose Import and select the package's `examples/com.community.counter.sdPlugin` folder.
3. Enable **Community bridge test**. Refresh the panel to check Connected status.
4. Add a Counter action, then click Test. Its count should increase.
5. Click Configure, change the count, and Save.
6. Move the Stream Deck panel by its title bar and resize its bottom-right corner to expose the keypad. Drag the Counter instance name or image onto an empty key. A notification reports whether the profile saved. Copy URL and manual Website assignment remain available.
7. Press and release that key. Its count and button image should update.
8. Exit MasterHUB from the tray, reopen, and check automatic plugin startup and the saved counter.

Create a separate action instance for each key. Reusing one URL on multiple visible keys is unsupported. Test simulates a short press.

## Other plugins

Import a complete, extracted `.sdPlugin` folder containing manifest.json and its dependencies. Existing installed plugins commonly live under `%APPDATA%\Elgato\StreamDeck\Plugins`. Import copies the folder into MasterHUB's community data.

Use trusted plugins: EXE and Node plugins have normal desktop permissions. HTML pages use an Electron sandbox. Obtain plugins through their legitimate distribution channels. Marketplace downloading, package installation and account activation are not provided.

Node plugins require a separately installed Node.js major version matching their manifest (20 or 24). Select its node.exe using **Locate Node.js (optional)**. Both versions may be configured. Plugin dependencies must already be included. The HTML counter and Windows EXE plugins need no separate Node installation.

Enable is saved between app launches. Restart relaunches a plugin; Refresh updates status. Unexpected process exits currently require Restart; this version has no crash-restart supervisor.

## Compatibility scope

| Feature | Status |
|---|---|
| Windows EXE, external Node, legacy HTML entry points | Implemented; Windows launch unverified |
| Registration, key down/up, visible action lifecycle | Protocol tests pass |
| Action/global settings, inspector messages | Persistence and context isolation tested |
| HTML settings panels | Implemented; Electron UI unverified |
| Button images, titles, two-state switching, OK/alert | Implemented; physical rendering unverified |
| 15-key and 4-key modules, pages and folders | Mapping implemented; folder mapping tested |
| Enabled plugin startup | Implemented; Windows startup unverified |
| Marketplace installation and automatic updates | Not implemented |
| Stream Deck+ dials/touchscreen, profiles, multi-actions, app monitoring, deep links | Not implemented |
| Resource API | Empty resource set only |
| Exact typography, animation, title parameter fidelity | Not implemented |

The host advertises an emulated application version of 6.9.0 for registration, but implements only this subset. Unsupported commands appear in its log. A plugin can connect successfully and still require missing features.

Settings live in `%APPDATA%\MasterHub\community\streamdeck\state.json` with a previous valid backup. Stream Deck plugin settings are **plain JSON**, separate from the encrypted integration account vault. Do not share this file if plugins store tokens in it.

Close MasterHUB before manually replacing imported files. Open plugin folder locates these copies. Removing an action instance does not uninstall its plugin.

## Source and tests

The implementation is in src/streamdeck/. The counter speaks the WebSocket protocol directly and is an example for your own plugins. Community source is MIT-licensed; vendor software retains its existing ownership and license.

References:
- https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/
- https://docs.elgato.com/streamdeck/sdk/references/websocket/ui/
- https://docs.elgato.com/streamdeck/sdk/references/manifest/

Set MASTERHUB_WS_PATH to an installed ws module to enable the real loopback test when running `node --test tests/*.test.cjs`. Otherwise that one test is skipped.

An ELGATO-prefixed manifest triggers integrated preparation during Import. Install Python 3.10+ with its launcher and the official Stream Deck software first. The importer automatically creates a private Python environment and installs cryptography/cbor2 from PyPI on first use (internet required). It reads StreamDeck.exe at its standard location, or asks you to select it, then processes the manifest in a temporary copy. Validated output becomes the imported plugin folder. Failed imports are cleaned up, and originals and existing imports are preserved.

Progress appears live under Plugin messages. No separate preparer app is needed. Python is not Node.js: Python prepares manifests, while Node.js runs certain plugins. Actual binary extraction remains dependent on the upstream tool supporting your Stream Deck version. Other protected assets, integrity checks or missing host APIs may still block the plugin. No real protected plugin was available for end-to-end testing.

Upstream source: https://github.com/Tiebe/elgato-decrypter — commit 68ca6fb62b2e57e7f9834dd3b75cb99d75be96d8. Its six Python modules are bundled unmodified in src/streamdeck/decrypter, along with its MIT license. Source is copied out of the Electron archive before external Python is launched. Debug output is discarded because upstream prints cryptographic material. No extracted keys are persisted by the integration. Runtime dependencies are downloaded separately. Configuration and helper files live under the community streamdeck directory in AppData.
