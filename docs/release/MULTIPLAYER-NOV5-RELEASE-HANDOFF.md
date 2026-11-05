# Castleward multiplayer + room-banner release handoff (November 5, 2026)

## What is actually verified

- PR #378's multiplayer repair is **merged** into main (merge commit `68dcf567`). Two independent real WebGL/Chrome clients entered a six-actor High Grounds room, drove real keyboard movement and recorded 2.81 m / 4.41 m authoritative displacement, 0.245 m p95 local correction, and three skipped server simulation ticks during severe software-Chromium renderer stalls.
- The latest GitHub Pages workflow on main succeeded. The Pages URL is https://captainfredric.github.io/swords-and-sorcery/ (the source revision and URL may change after later commits).
- This follow-up PR repairs the *visibly broken* Open Rooms and Solo companion banners. Both real Chrome workflows now pass desktop (two disjoint banners) and 390px mobile (one navigable full-width banner). Evidence: the `castleward-room-menus` and `castleward-two-banners` artifacts on the PR's GitHub Actions runs.
- The published itch.io player is a **separate HTML5 upload**. A successful Pages deployment does not update the existing itch iframe.

## Exact blocker to the next itch / Render release

`npm run verify` currently executes **2,572 tests, of which 2,569 pass** on this branch. The remaining three are the intentionally strict checks in `server/tests/so-fist-asset-contract.test.mjs`: the real elevating-ram GLB, detached-fist GLB and editable Blender source are absent from Git. These failures precede the multiplayer repair and must not be misrepresented as new networking failures.

The Render Blueprint's `autoDeployTrigger: checksPass` can hold back an updated multiplayer server when CI stays red. The itch candidate workflow likewise calls `npm run verify` and cannot produce an approved candidate while the assets are missing. The itch publisher requires explicit approval for the exact candidate through `workflow_dispatch`; no PR merge publishes it automatically.

### Recover the original approved assets (do not fabricate or bypass)

The approved handoff is `SO_FIST_ICATION_PR366_Ready_to_Stage.zip`. Its contents are separately recorded in the user's Library, but the Library connector in this conversation did not grant an accessible raw-byte copy. Download that exact archive into a local repository checkout, then run:

```bash
python3 scripts/release/stage-sofist-assets.py /path/to/SO_FIST_ICATION_PR366_Ready_to_Stage.zip
npm run verify
git add client/assets/props/so-fist-ication/so-fist-ication-elevating-ram.glb \
        client/assets/props/so-fist-ication/so-fist-ication-detached-fist.glb \
        assets/source/so-fist-ication/SoFist-elevating-ram-source.blend
```

The staging script identifies files by their **exact, existing SHA-256 checksums and byte lengths**, regardless of ZIP root layout, and refuses mismatched contents. It never substitutes the legacy GLB, weakens tests, or publishes a build. Submit the three authentic files for review and complete CI, WebGL, network compatibility and release-candidate validation. Only then authorize the specified itch candidate upload.

## Acceptance that still requires devices

The CI tests are not a substitute for actual 3–6 player geographically distributed matches, mobile GPU frame pacing, intentional abyss crossings or live latency/loss monitoring. Before calling the networking bug completely eliminated, run those trials on the updated Render server and distinguish render stalls from authoritative late ticks via the `/health` simulation counters.

No background publishing is scheduled or implied by this handoff.
