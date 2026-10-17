# Publishing and compatibility

Main builds use numeric X.Y.Z versions and channel stable. Beta builds use X.Y.Z-test.N and channel test on the existing test branch. User-facing labels are Main/Beta; internal names stay stable/test for compatibility with already installed clients.

Change source, increment package.json and commit matching signed-release assets, or provide MHC_UPDATE_SIGNING_KEY through the existing Actions secret. Never commit a private key. Push to the corresponding branch. Main publishes a stable latest release; test publishes a prerelease with latest=false. Do not merge the Beta workflow or video modules into Main.

Both installers use bootstrap ABI 2. ABI 1 installations require a one-time installer migration. ABI 2 can accept signed ABI-1 stable releases as well as ABI-2 bundles. Bootstrap changes need reinstalling; community modules can update automatically.

Updates check 35 seconds after startup and then every six hours. Channel switching checks immediately, cancels pending code from the other channel and permits a downgrade when returning to Main. Wait for startup confirmation before switching. The repository and signing public key stay pinned.

Two installed versions maximum: current + pending, or current + previous during activation. Startup confirmation removes previous; failure rolls back and restores the previous channel. Activation only happens on full application restart. Profiles, credentials and channel selection live outside the version slots.
