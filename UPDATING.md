# Current publishing workflow

Bumping `package.json` on `main` now triggers the release workflow automatically; matching version tags and the manual Run workflow button also work. Set release notes in `RELEASE-NOTES.md` before publishing.

When `MHC_UPDATE_SIGNING_KEY` is configured, GitHub signs the current source. Without it, publishing requires a matching maintainer-signed package in `signed-release/`. That package is verified against the pinned public key, version, and every source file before publication. It contains no private key. Source changes without a matching signature fail closed.

The initial 0.3.0 publication described below is already complete. Do not rerun the initial-release workflow. Published releases are never overwritten by the normal workflow.

# Owner setup and release publishing

Repository: **https://github.com/dreadnaughtgaming/MasterHubCommunity**. No private-repository token is embedded in the client. Keep the releases public.

## Initial 0.3.0 publication

The initial publisher workflow verifies the bundled pre-signed 0.3.0 package against the source and publishes it when these files first land on main. It needs no private signing key. This is only for the original release; do not reuse its tag or run it again after publication. For later versions, configure the secret below and use the normal version-tag workflow.

## Signing setup for later releases

1. Put this package's project files at your existing repository's root. Keep the existing `.git` directory and MIT license. Include the hidden `.github/workflows/release.yml` and `.gitignore` files. Do not add `release/`, `dist/`, a vendor `app.asar`, or publisher private files to git.
2. Open GitHub repository **Settings → Secrets and variables → Actions → New repository secret**.
3. Name it **MHC_UPDATE_SIGNING_KEY**. Paste the entire single-line contents of the separately supplied `MHC_UPDATE_SIGNING_KEY.txt` as its value. It is a base64-encoded Ed25519 private PEM. **Never upload that file, put it in a release, or paste it in an issue.** Keep an offline copy. Do not regenerate it for normal releases: installed clients pin the matching public key in `bootstrap/config.json`.
4. Commit and push the source. For the next version, increase `package.json` to `0.3.1` and push tag `v0.3.1`. The `Community release` workflow tests, signs, packages, and publishes it. Do not recreate the existing `v0.3.0` tag.

Example after copying the project into your local repository:

```sh
git add .
git diff --cached --stat
# Check that no private key or vendor archive appears in the staged files.
git commit -m "Add community updater and source-only installer"
git push origin main
git tag v0.3.1
git push origin v0.3.1
```

Use your actual default branch if it differs from `main`. Enable Actions if the repository prompts you. The workflow declares `contents: write`; organization policy can still restrict release creation. Never send the signing secret to the assistant or put it in git.

## Subsequent releases

1. Change `src/` community code. Keep settings migration backward-compatible while startup rollback is possible; rollback changes code, not user data.
2. Increase `package.json` version, for example `0.3.1`; update release documentation. Tag and package version must match.
3. Test with `npm test` (no npm install is needed for this project).
4. Commit, push, and tag `v0.3.1`. The workflow produces:
   - `masterhub-release.json`: signed release metadata and per-file hashes;
   - `masterhub-release.sig`: publisher signature;
   - `masterhub-community.json.gz`: complete community code;
   - `MasterHUB-Community-0.3.1-source-installer.zip`: new-user installation package.

Only stable numeric `vMAJOR.MINOR.PATCH` releases work with the client. Publish in increasing version order; the workflow marks its release latest. GitHub's automatically generated source ZIP alone is not an installable package. If a workflow failed after creating a partial release, remove that incomplete release before rerunning it.

Clients check the fixed GitHub latest-release API, then fetch fixed asset names from that tag. They never execute release-note text or accept an alternate URL from release metadata. Downloads use HTTPS with a restricted GitHub redirect-host list and byte/time limits. The public key authenticates the release metadata; SHA-256 authenticates the compressed bundle and every installed source file.

Documentation: [GitHub releases API](https://docs.github.com/en/rest/releases/releases), [GitHub Actions secrets](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions).

## Local signing (maintainer only)

Node 22+ and Python 3.10+ are build tools, not client runtime requirements. With `MHC_UPDATE_SIGNING_KEY` provided privately as an environment variable:

```sh
node scripts/release.cjs 0.3.0
python scripts/package.py
```

The private key must match `bootstrap/config.json`. No private key is written into either package. The download size is the full community source, not the much larger proprietary vendor archive.

## Bootstrap compatibility

The immutable bootstrap in the locally patched vendor archive owns update verification, the fixed feed and activation. The renderer obtains the current module directory from its main process. Do not assume edits in `bootstrap/` or `build.py` will be delivered automatically: those require reinstalling the bootstrap. Increment `bootstrap` in `bootstrap/config.json` when an incompatible bootstrap/vendor-hook change is required. Older clients reject that update with “needs a new installer” rather than loading incompatible code. Changing the repository, trust key, or target vendor version likewise requires a new installer.

## Two-version policy

Per-user location: `%APPDATA%\MasterHub\community\updates`.

| Phase | Version folders |
| --- | --- |
| Normal use | `current` |
| Download ready | `current`, `pending` |
| First launch of update | `current` (new), `previous` (old) |
| Startup confirmed | `current` (new) |
| Unconfirmed launch recovered | `current` (old) |

The pending bundle is validated in memory before replacing an older pending slot. Partial writes are discarded next launch. An activation journal handles interruptions between directory renames. An extra marker remembers a failed version; markers are not retained program versions. Installed third-party plugins, profile backups, the fixed bootstrap and original vendor recovery archive are separate from these community release slots. Old backups created by previous installers are not silently deleted.

Recovery provides startup protection, not a guarantee that every plugin or hardware function is working. The health signal confirms the renderer initialized and survived 20 seconds. Once the previous version is deleted, fixing a later-discovered issue requires a newer release. Updates never automatically restart a user's running app.

## Windows smoke check before wider release

- Apply 0.3.0 on the supported vendor installation or your existing 0.2.3 installation. Confirm Add-ons says 0.3.0, profile saving still works, and Stream Deck actions load.
- Publish a small 0.3.1 update. Check now; observe only current + pending. Current UI remains 0.3.0.
- Fully exit the tray app and reopen. Confirm 0.3.1. Wait 25 seconds; verify only current remains.
- Repeat with the network disconnected; the installed version must remain usable.
- In a disposable test installation, close immediately after a staged update begins its first launch. Next launch must restore the prior version and stop retrying the failed version.
- Do not delete current code to simulate a failure in your production installation.
