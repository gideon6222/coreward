# The Android wrapper

The Lattice is a web game and is played as a link. Google Play cannot list a link, so this
folder holds the one thing that lets it list the game: a **Trusted Web Activity**, an
Android app whose whole body is Chrome showing `https://gideon6222.github.io/lattice/`
full screen, with no browser bar once the site vouches for the app.

`twa-manifest.json` is the source. `scripts\twa.ps1` runs Bubblewrap on it (`update`
regenerates the Android project, `build` compiles and signs with the studio's upload key),
verifies the bundle, and puts it on a GitHub release named after the newest changelog
version. The dashboard's store lane sees a `v*` release carrying `lattice.aab` and uploads
it to Play's internal testing track on its own. Everything Bubblewrap generates under this
folder is ignored by git; only the manifest and this file are source.

Two facts that differ from the Godot games:

- **Version code.** `appVersionCode` in the manifest is bumped by the script whenever the
  changelog's version name changes. Play refuses a repeat.
- **`assetlinks.json`.** `public\.well-known\assetlinks.json` names the SHA-256 of the
  certificate that signs the installed APK. With Play App Signing that is Google's
  app-signing certificate, read from Play Console under Setup, App signing, after the first
  upload. The upload key's own fingerprint is listed too, for a build installed from here.
  Until the file is live, the wrapper runs but shows a browser bar at the top.

The package is `com.gideon.lattice`, recorded in `C:\dev\.studio\store\coreward.json` as
`pkg` so the store lane treats this game like the others.
