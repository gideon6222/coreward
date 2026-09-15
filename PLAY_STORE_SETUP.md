# The Lattice — Play Store & AdMob setup overview

Written 2026-09-15 by Claude (Cowork), after finishing the last steps of the Play Console + AdMob setup. Read this before touching store listing, ads declarations, or AdMob wiring for this game.

## What this game is, packaging-wise

The Lattice (renamed from Coreward) is a three.js PWA served from GitHub Pages, wrapped as an Android **Trusted Web Activity (TWA)** via Bubblewrap so it can ship through the Play Store as `com.gideon.lattice`. It has no native Android code layer of its own — it's a stock Chrome-in-a-box around the web build.

## The build/publish pipeline (home PC)

- `twa/twa-manifest.json` — TWA config: package `com.gideon.lattice`, host `gideon6222.github.io`, start URL `/lattice/`, signing key at `C:/dev/keys/upload.keystore` (alias `upload`).
- `scripts/twa.ps1` — runs Bubblewrap, builds and signs the `.aab` with that upload key, publishes it as a GitHub release tagged `v*`.
- A "store lane" on the dashboard watches for those `v*` releases: it auto-uploads the `.aab` to the Play internal testing track, and — only when an `autoListing` flag is on — pushes `store/listing/en-US/` (title, descriptions, screenshots, icon, feature graphic) to the live Play Console store listing. Worth checking that flag's state before assuming the listing text is being kept in sync automatically.
- `scripts/store.mjs` — generates the store screenshots via Playwright, driven by a `window.__cw` debug handle in the built game. Renders 4 fixed-state screenshots (title, descent, deep, shop) at 1080×1920, plus the icon and feature graphic.
- `public/.well-known/assetlinks.json` — required for the TWA to open full-screen instead of showing a browser address bar. Needs both the Play App Signing certificate's SHA-256 fingerprint and the local upload key's, listed together. This file was created and pushed 2026-09-15; not yet confirmed live at `https://gideon6222.github.io/lattice/.well-known/assetlinks.json` (the repo's CI/deploy takes ~20 min per push).

All 7 of Gideon's current Play Console apps go through some version of this same pipeline, not just The Lattice.

## Play Console status (as of 2026-09-15)

Account: Calsynergy Games organization account (ID 6579184008739218131). The Lattice's app dashboard checklist is **11/11 complete** — store listing, content rating, target audience, data safety, ads declaration, category, contact details, etc. are all filled in.

Specifically done this session:
- Store listing full description rewritten to remove all "no ads"/"ad-free" language, both in Play Console and in `store/listing/en-US/full_description.txt` in this repo (so the store-lane push doesn't revert it).
- "Does your app contain ads?" flipped to **Yes**.
- Category set to Casual.
- Icon, feature graphic, and 4 phone screenshots uploaded to the store listing.
- assetlinks.json committed (see above).
- Internal tester list fixed — it had `gideon6222@hotmail.com` instead of `gideon6222@gmail.com` (this is a list shared across all 7 apps, so the fix applies everywhere). gideon6222@gmail.com is now enabled for The Lattice's internal track.
- A build (v0.39.0) is already live on the Internal testing track via the automation pipeline, status "Not reviewed" — this is the app's first-ever submission.

**Not yet done / blocked:**
- **"Send app for review" is greyed out** in Publishing overview even though the dashboard checklist shows 11/11. Couldn't identify what it's actually waiting on — check this fresh; it may just have been backend propagation lag right after the listing save.
- Privacy policy URL in the queued changes still points at `https://gideon6222.github.io/privacy/coreward.html` — the pre-rename name. Worth checking whether it still resolves or needs updating.
- Data safety and Health apps declarations are queued as changes but weren't re-checked against the new ads plan (ads usually mean third-party data collection that Data safety should reflect).
- Phone number verification (Gideon has to do this personally) and ICANN WHOIS click for calsynergygames.com (due 2026-09-27) are still open, unrelated to The Lattice specifically.

## AdMob status (as of 2026-09-15)

Account: contact@calsynergygames.com. The Lattice is registered as the first app:
- **App ID**: `ca-app-pub-8549269157827351~6410906735`
- **Ad units**:
  - "Shop Transition" — Interstitial — `ca-app-pub-8549269157827351/9873665713`
  - "Bonus Haul" — Rewarded — `ca-app-pub-8549269157827351/8185179527` (default reward: 1x "Reward")
- Account approval still pending on Google's side.

## The real open question: how do ads actually get shown in a TWA?

This is the important unresolved piece, separate from all the account/console setup above, which is done. The standard AdMob Android SDK integration (per `publishing-research.md`: `play-services-ads` Gradle dependency, App ID in `AndroidManifest.xml`, `MobileAds.initialize()` call) assumes native Android app code to call into. A stock Bubblewrap TWA doesn't have that — it's just a Chrome wrapper around the web build, with no custom native layer.

Two directions worth exploring before writing any code:
1. **Add a thin native wrapper module** to the Bubblewrap-generated Android project (post-processing step after `bubblewrap build`, or a custom TWA fork) that hosts the AdMob SDK and shows ads natively, with some bridge (e.g. a JS-to-native postMessage channel) for the web game to trigger them.
2. **Web-based ads instead** — Google has a Web/HTML5 ad SDK path (AdSense for Games / H5 ads) that could run inside the PWA itself without needing native code at all, though it's a different product from AdMob's native SDK and may have different eligibility/payout mechanics worth checking.

Neither has been evaluated yet. This is the next real blocker before ads will actually work in The Lattice, and it likely affects every other web/PWA game that goes through this same TWA pipeline, not just this one.
