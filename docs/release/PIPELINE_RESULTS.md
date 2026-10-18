# Release infrastructure verification

October 18, 2026. Branch `feat/itch-release-pipeline`, based on main `d369216eaaafe126e108214dbbc1299dc01388ea`. PR #200 was already merged; no other PR was open when work began. Existing model, motion and release worktrees were preserved.

## Architecture audit

CI runs syntax, repository tests, export tests and HTTP/WebSocket smoke. Pages copies client/shared to a static site on relevant main pushes. Render uses Docker and `autoDeployTrigger: checksPass`. These configurations were inspected and preserved. The new workflows do not invoke either deployment.

The existing deterministic exporter was retained. Added per file SHA256 and a 900 file warning while retaining the documented hard limits. Root release.json already identifies source revision and production server. The live client has no protocol version negotiation; reconnect and expired session behavior remain unchanged. Publication now conservatively checks matching deployed shared runtime/network adapter source and exercises real WebSocket commands.

The authenticated itch editor remains HTML, In development, No payments, mobile friendly and Draft. The actual game page currently reports **No file provided to embed**. There are no visible upload rows in the editor. This contradicts historical October release notes. No current uploaded client revision could be verified, and no upload, visibility, price or page setting was changed.

GitHub has no `itch-release` environment. The new workflow refuses publication until the owner configures required reviewer and main branch restriction, then adds the environment Butler key. No key was read or configured. The fixed target is `captainfredric/swords-and-sorcery:html5`; whether that Butler channel exists requires authenticated Butler status during a future approved operation. It was not assumed from the page kind.

## Local verification

`npm run verify` passed: syntax across 441 runtime modules, 1,520 repository tests, 16 export/release tests, and HTTP/WebSocket smoke. Additional explicit syntax checks cover release scripts. Actionlint 1.7.12 accepted both new workflows. ZIP integrity and full manifest hashes passed. Existing exporter reproducibility and dependency tests passed. Release tests reproduce rejection of failed browser evidence, archive corruption, edited manifest hashes, wrong provenance, PR/failed candidates, missing approval/secret, invalid branches, duplicate/stale versions, unsafe rollback and incomplete protected environment configuration. Butler invocation is also exercised through command capture without credentials or upload.

Local exported runtime revision: `d369216eaaafe126e108214dbbc1299dc01388ea`.

ZIP: 950 files, 37,578,738 bytes archived, 46,485,055 bytes extracted.

SHA256: `a3b6e30cbe81bdab15b343581f6752e31de0f23aa3f0ab9ae555305a7eeae5ec`.

Chrome tested the actual extracted ZIP under `/html/verified/`. Menu/WebGL, production menu and first person GLBs, Practice, ordinary movement, sword, Guard, Fireball, real Pointer Lock, gesture activated audio, Tutorial startup and recording decoding, leaving, and simultaneous landscape touch movement/look passed. Desktop inputs used CDP events; menu selection used ordinary DOM button activation. Screenshots were visually inspected. No simulation transforms, outcomes or combat timing were injected. Physical phone and actual future uploaded iframe acceptance remain separate checks.

The actual production Render check matched 56 shared/network source files and passed hello, ping, isolated private create/join, authoritative input sequence acknowledgement, Guard, sword, casting and token reconnect. Test clients explicitly left. This is stronger than health alone and remains a bounded compatibility sample rather than proof of every gameplay edge case.

## Owner steps and current limits

See OPERATIONS.md for exact environment, migration, approval, normal release, postupload and rollback procedures. No live itch operation has occurred. The missing embed needs an approved restoration or hidden first migration followed by owner controlled playable upload selection. The page must stay Draft unless separately approved.

Recovery ZIPs and receipts are designed to remain in draft GitHub releases beyond the 90 day Actions artifact window. Rollback repushes preserved verified content and requires current compatibility; it does not call an undocumented historical build activation API.

The final PR candidate workflow is exercised separately on GitHub. Its artifacts validate CI build behavior but remain ineligible for publication because they come from a PR. A main candidate and first protected publication remain future owner authorized steps.
