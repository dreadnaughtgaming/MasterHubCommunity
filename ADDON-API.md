# MasterHUB Community add-on API v1

Add-on directory: `%APPDATA%\MasterHub\community\addons\<id>`.

Each add-on has `manifest.json` and `index.cjs`. IDs/action names accept lowercase letters, digits, hyphens and underscores, starting with a letter or digit. The manifest ID must match its folder name.

```json
{"id":"my-tools","name":"My tools","version":"1.0.0","apiVersion":1}
```

```javascript
exports.activate = api => {
  api.registerAction('hello', 'Say hello', async ({params, source}) => {
    api.notify(`Hello ${params.name || 'Reaper Crew'}!`);
  });

  api.registerAction('counter', 'Count presses', () => {
    const settings = api.getSettings();
    settings.count = (settings.count || 0) + 1;
    api.setSettings(settings);
    api.notify(`Count: ${settings.count}`);
  });

  // Return a synchronous cleanup function if you start timers or other resources.
  return () => {};
};
```

Assign a Website/Open website action to a keypad button and use:

```text
https://masterhub-addon.invalid/my-tools/hello?name=Reaper%20Crew
```

`mhaddon://my-tools/hello?name=Reaper%20Crew` is also recognised internally. The HTTPS form works with normal URL fields. This reserved `.invalid` URL is intercepted before the vendor's browser-opening code. Without this modification installed, it is not an add-on command.

| API | Behaviour |
|---|---|
| `registerAction(id, label, async callback)` | Adds a panel/button action. A given action has at most one in-flight invocation. |
| `getSettings()` | Reads your add-on's JSON settings; default `{}`. |
| `setSettings(value)` | Saves serialisable settings with file replacement and a backup. Do not put secrets here. |
| `notify(text)` | Shows an in-app message. |
| `log(text)` | Adds a message to the panel's bounded memory log. Never log passwords/tokens. |
| `openExternal(httpOrHttpsURL)` | Opens the default browser. Returns a promise. |
| `obsCall(requestType, data)` | Calls the current connected OBS WebSocket instance; rejects when disconnected. |
| `onInput(callback)` | Observes the raw channels listed below; returns an unsubscribe function. |

The action callback receives `{params, source}` plus `{serialNumber, buttonIndex}` for keypad activation. Query parameters are strings. The panel uses `source: 'panel'`; a key uses `source: 'keypad'`.

`activate(api)` itself must be synchronous. Start asynchronous work inside action callbacks. Return a function to stop timers, watchers or network clients. Node built-ins are available through `require()`; this is trusted local code with full user-level privileges.

## Raw input observations

```javascript
exports.activate = api => {
  const unsubscribe = api.onInput(event => {
    // event contains channel, serialNumber, result, data, and any other
    // fields from the vendor event. Confirm the packet format on your device.
    if (event.result !== 0) return;
    api.log(`${event.channel} ${event.serialNumber}: ${JSON.stringify(event.data)}`);
  });
  return unsubscribe;
};
```

Channels currently forwarded:

- `replyM4315IoStatus` — 15-key module
- `replyM3704IoStatus` — 4-key module
- `replyM002IoStatus` — rollers
- `replyM003IoStatus` — three-knob module
- `replyM131IoStatus` — dial encoder

These are observations, not exclusive ownership of the input: the original mapping still runs. Do not bind another action to every packet without decoding press/release semantics and checking module identity. Slider bindings, display drawing and a drag-and-drop add-on configuration UI are not exposed in API v1.

## Reloading

Click Reload add-ons after editing. The entry module is reloaded and registered subscriptions are removed first. Node dependencies imported by that module may remain cached; restart MasterHUB after changing a multi-file add-on's dependencies. Long-running actions must be designed to terminate cleanly on disable/reload.
