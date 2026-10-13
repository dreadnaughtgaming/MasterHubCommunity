Experimental community mod for Cooler Master MasterHUB 1.0.0.113 on Windows.

## Install

Download **MasterHUB-Community-0.3.0-source-installer.zip** below and extract it. Fully exit MasterHUB and MHDaemon, then right-click **Apply.cmd → Run as administrator**, using your normal Windows account. Requires Python 3.10+. Launch MasterHUB normally afterward.

Use that installer asset, not GitHub's automatically generated Source code downloads. This package builds the patch from your locally installed vendor app; no vendor application archive is redistributed.

## Changes

- Signed automatic updates from this repository; version and update status in Add-ons.
- Whole community-code downloads, staged for the next full application launch.
- At most two installed community releases: current + pending, or new current + previous during startup confirmation. Previous code is deleted after successful startup; an unconfirmed first launch rolls back next time.
- Carries forward profile-save and connection repairs, custom add-ons, resizable panels, and partial Stream Deck plugin support.

The fixed bootstrap/vendor integration requires this one-time installation. Future compatible community modules update in the Windows user folder without administrator access. Bootstrap or vendor-version changes still need a new installer.

55 automated checks passed locally, including the vendor WebSocket loopback test; CI skips that one vendor-dependent test. **Windows/device validation is still pending.** This release does not claim to fix the previously reported encrypted-plugin import error.

## Maintainer

The initial release uses a pre-signed package verified against the source. Future tagged releases require the repository Actions secret **MHC_UPDATE_SIGNING_KEY**. The private key is not included in this repository or release.
