# itch HTML5 release operations

This pipeline prepares candidates automatically and changes itch only after a deliberate main branch dispatch and protected environment approval. GitHub Pages and Render retain their existing deployment workflows. Neither is triggered by this publication workflow.

## Candidate preparation

`Prepare itch HTML5 candidate` runs for relevant main pushes and pull requests. Documentation only changes skip it. Manual preparation from main is available after the workflow is merged. PR artifacts exercise the complete pipeline but publication rejects them.

The job runs `npm run verify`, the existing exporter, ZIP integrity and content validation, an unauthenticated official Butler dry run that creates no build, then Chrome against the extracted archive at `/html/verified/`. It checks WebGL, production GLBs, recorded audio, menu, Practice, movement, sword, Guard, Fireball, leaving, Tutorial startup and simultaneous landscape touch movement and look. Physical phone acceptance remains a human check. This startup smoke does not claim to complete the entire tutorial.

Download the Actions artifact named `itch-html5-SHA-RUN-ATTEMPT`. It contains the deterministic ZIP, `export-report.json`, `candidate.json`, `browser-check.json` and screenshots. The summary supplies the source SHA, ZIP SHA256 and run ID. Root `release.json` identifies the exact uploaded source and production WebSocket URL. The Butler version is `sha-` followed by the full source SHA.

The current file budget is tight. At 900 files the exporter warns; more than 1,000 fails. The other limits remain 500 MiB extracted, 200 MiB per file and 240 characters per path. Every entry has a size and SHA256. Required assets are retained. Do not delete recordings or model dependencies to silence the warning.

Local preparation:

```sh
npm run verify
npm run export:html5
CHROME_BIN='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/release/browser-check.mjs dist/html5
node scripts/release/candidate.mjs seal dist/html5
unzip -t dist/html5/swords-and-sorcery-html5.zip
```

Local candidates cannot be published through the workflow. Publication requires a successful candidate workflow run on repository main, a matching source SHA and ZIP checksum, and ancestry within current main.

## One time owner setup

1. Merge the infrastructure PR after review. Creating its PR does not deploy the game or run Butler.
2. In repository Settings, Environments, create `itch-release`. Add at least one required reviewer. Choose **Selected branches and tags** and allow exactly the branch `main`, without tag or wildcard rules. Decide whether a second person must approve by enabling prevent self review if appropriate. The preflight checks reviewer and branch restrictions through the GitHub API and fails if absent.
3. Obtain an itch Butler key through the official `butler login` flow or the itch account API keys page. Store it only as environment secret `BUTLER_API_KEY`. Never paste the value into issues, PRs, command arguments, candidate files or logs. No key has been configured by this implementation.
4. Leave environment variable `ITCH_HTML5_CHANNEL_READY` unset until the migration below is complete.

GitHub environment approvals and branch restrictions are required. If your account/repository plan does not support them, stop and select a supported approval model before adding the key. Do not weaken the workflow to work around missing protection.

The CI installer downloads official Butler 15.32.0 from a versioned broth URL and verifies its checked in SHA256 before executing it. Updating Butler requires a reviewed version and checksum change. Local installation uses the official instructions; the CI installer intentionally supports only Linux x64.

## Initial migration from the manual browser upload

Live audit on October 18: the authenticated game page currently reports **No file provided to embed** and the editor lists no upload rows. Historical notes about a working manually uploaded ZIP are stale. Visibility remains Draft, kind HTML, No payments and mobile friendly. No setting or upload was changed. Inspect any retained uploads and local backups before migration; do not assume an active original exists.

Current target is fixed to `captainfredric/swords-and-sorcery:html5`. A channel name does not automatically configure HTML browser play. The first push creates a separate upload. It does not replace the manually uploaded ZIP.

1. Record the current working upload and its settings. Keep its ZIP available. Preserve title, URL, Draft/privacy state, No payments/free status, description, media, credits, mobile friendly option and fullscreen embed choice.
2. Prepare and review a successful main candidate. Dispatch **Publish approved itch candidate** from **main** with its candidate run ID, full SHA and ZIP SHA256. Select `migrate`, then explicitly check the authorization input. Approve the environment job. This is the first real upload and requires creator approval outside this implementation task.
3. Migration refuses an existing `html5` channel. It pushes the ZIP with `--hidden`, so the new upload stays hidden and the existing working manual browser upload remains intact. It never deletes, switches or unhides uploads.
4. In the itch editor, inspect the new channel. Keep project kind **HTML**. Mark the channel **HTML5 / Playable in browser**. Arrange an intentional switch of browser upload when ready; avoid exposing two competing playable uploads. Keep the original hidden or retained for recovery rather than deleting it. The exact editor visibility controls are owner actions, not Butler side effects claimed by this pipeline.
5. Save only the intentional upload selection change, preserving all other page settings. Test the actual selected iframe through the checklist below. Only after acceptance set environment variable `ITCH_HTML5_CHANNEL_READY=true`.

`--hidden` applies only when a channel is first created. Normal releases never use it, and migration never runs against an existing channel.

## Normal releases and urgent fixes

Choose an appropriate successful main candidate, review its screenshots/report, then dispatch publication from main with the exact run, SHA and checksum. Select `release`. Leave recovery run and rollback reason empty. Check the authorization input and approve the environment job.

The workflow validates candidate provenance, revision, hashes and browser evidence without itch credentials. It verifies the production server before approval. After approval it repeats candidate and server validation, checks current channel version, preserves a recovery draft on GitHub, pushes the exact ZIP, and waits for the intended completed channel head.

Only the final invocation receives the environment key. Candidate data is never executed in that job. Tooling comes from the dispatch revision on main. Actions are pinned to immutable revisions, Butler is pinned by version and digest, tokens have explicit permissions and publishing jobs share one concurrency group. Keep other publishing tools from modifying this channel concurrently.

Do not rebuild the ZIP in the publication job. Do not copy a different ZIP over an approved candidate. Do not dispatch from an experimental branch. Duplicate SHA versions, stale ancestors and divergent revisions fail. If another release overtakes an approved candidate while approval is pending, the final channel check blocks the downgrade.

Release after meaningful milestones, typically once or twice weekly. A critical control, mobile, networking, crash or progression fix may be released immediately through the same checks. There is no calendar upload or automatic public announcement.

## Server compatibility and stale clients

The existing client has no negotiated protocol version. Render serves current shared runtime code and its network adapter, so the release check requires exact hashes for exported shared modules and `GameSocket.mjs`, plus a real isolated private session. It checks hello/ping, private create/join, authoritative input acknowledgement, sword, Guard, cast and token reconnect, then explicitly leaves all test clients. No stats or balance are modified. No public matchmaking is used.

This is conservative: a compatible older client may still be refused if shared source differs. Matching source is necessary under this policy and does not prove every gameplay edge case. An HTTP health response alone never approves publication. Render receives four bounded wake attempts, then the check fails with a diagnostic.

A mismatch means wait for the expected Render deployment or prepare a compatible candidate. Do not bypass the gate for a rollback. Cached older iframe clients still have the existing reconnect/error behavior; this infrastructure does not add a protocol negotiation or forcibly update their browser tabs. Retain the old deployment during breaking protocol migrations or coordinate a separate compatibility change.

## Postupload acceptance

A zero Butler exit is not acceptance. The workflow polls authenticated Butler JSON status for the expected `sha-SHA` completed head, records the remote build ID, and preserves `publication.json`. Processing failure or timeout makes the workflow fail visibly. It does not hide, delete or republish anything automatically.

Owner checks remain mandatory:

1. Open the existing itch game page and launch its actual selected HTML iframe. Confirm root `release.json` is the intended revision, rather than a cached older upload.
2. Confirm fullscreen entry/exit, Pointer Lock, mouse and keyboard, audio activation, Tutorial, Practice, movement, sword, Guard, Fireball and return to menu.
3. Join a private room with a second current client. Check start, ordinary combat and reconnect/reload.
4. Check the real phone, especially landscape movement plus looking, combat buttons and leaving. Browser emulation does not replace the owner's physical device check.
5. Confirm title, art, screenshots, description, privacy/Draft status, price, mobile setting and credits stayed intact.

The receipt explicitly leaves browser acceptance pending. Record acceptance or a failure in the release's private review notes. Failed browser acceptance should lead to the deliberate rollback below after checking compatibility, not automatic corrective uploads.

## Rollback and retained copies

Each publication first creates a **draft GitHub recovery release** tagged `itch-SOURCE_SHA-PUBLICATION_RUN_ID`. It retains ZIP, export report, candidate provenance, browser evidence, compatibility result and publication receipt beyond Actions artifact retention. The draft does not publish the itch page. Keep these assets and the original manual ZIP; normal artifacts expire after 90 days.

Rollback repushes the preserved previously verified ZIP to the same channel as a new Butler build. It does not rely on an undocumented API to activate an arbitrary historical build.

Dispatch from main with the original candidate run ID, source SHA and ZIP checksum. Choose `rollback`, provide a meaningful reason and approve it explicitly. If the original candidate artifact has expired, enter its original **publication run ID** as recovery run. The workflow reads only known data assets from the corresponding draft recovery release and verifies the completed publication receipt, source, candidate run and checksum. The original candidate workflow run must still exist and be successful. Preserve workflow history for this reason.

Rollback must point to an older ancestor of the current channel version and pass current server compatibility. It preserves the current channel, page, privacy and assets. It creates another recovery draft and receipt. A rollback already on the channel is rejected as a duplicate.

## Troubleshooting

Missing workflow in Actions: it must first be merged into main. PR validation can run before that; PR candidates remain ineligible for publication.

Missing environment, reviewer, branch policy or key: finish the owner setup. Preflight and missing secret handling fail before upload.

Expired artifact: normal releases should prepare a fresh main candidate. For an intentional rollback use the preserved recovery draft and original publication run ID. A deleted candidate workflow run requires a new audited recovery procedure; do not fabricate provenance.

Wrong channel or unknown current version: stop and inspect `butler status captainfredric/swords-and-sorcery:html5 --json`. This workflow targets only that channel. It refuses arbitrary legacy user versions and cannot migrate over an existing channel.

Butler failure after starting push: inspect status before retrying. A remote build may exist even when the local command timed out. The recovery draft already exists. Never delete the working upload to fix authentication or processing.

File budget: warnings are actionable release risk, not cosmetic output. Review duplicate or obsolete assets with their owners. Keep required recordings, fonts and production GLBs intact.

## Official references

[Butler push, HTML channel setup and hidden first channels](https://itch.io/docs/butler/pushing.html)

[Butler CI authentication](https://itch.io/docs/butler/login.html)

[Official automation distribution](https://itch.io/docs/butler/installing.html)

[itch HTML5 paths and archive requirements](https://itch.io/docs/creators/html5)

[GitHub protected environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
