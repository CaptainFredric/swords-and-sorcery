# First protected itch upload

The creator approved credential setup and the initial hidden migration on October 18, 2026. The game remains Draft with No payments.

| Record | Value |
| --- | --- |
| Uploaded source | `100e7d55a5cb4419a78a5a4aaa737078ba5c39ab` |
| Candidate run | [39154217043](https://github.com/CaptainFredric/swords-and-sorcery/actions/runs/39154217043) |
| Publication run | [39155105205](https://github.com/CaptainFredric/swords-and-sorcery/actions/runs/39155105205) |
| ZIP SHA256 | `cdd17d718a303b1c47692baae5e6b43aaa6c49b23279a40379dfb4fc1958680a` |
| Butler channel | `captainfredric/swords-and-sorcery:html5` |
| Remote build | `2155478`, completed |
| Recovery draft ID | `416630218` |
| Recovery draft | [Retained archive](https://github.com/CaptainFredric/swords-and-sorcery/releases/tag/untagged-7c0662268a38114123cc) |

The protected `itch-release` environment requires CaptainFredric approval and permits exactly the main branch. `BUTLER_API_KEY` is an environment secret. Its value is absent from these records.

## Verified

The main candidate passed repository verification, the official Butler dry run, archive validation, and exported desktop and landscape touch checks. Publication repeated provenance, checksum, and live Render checks. At upload time all 56 shared runtime/network files matched; a private two-client session exercised input acknowledgement, Guard, sword, spell, and reconnect.

The actual itch page now exposes Run game. Its iframe serves the uploaded revision in `release.json`, renders Castleward, reports multiplayer online, enters Practice and returns to the menu, starts Greener Pastures with captions, and returns from Tutorial to Solo. The actual iframe also created a private room, started a match with a second WebSocket client, and resumed the same running match after a full itch page reload. The editor saved the browser upload selection. Title, description, media, HTML kind, Draft visibility, No payments, mobile support, and fullscreen launch preference were preserved.

The initial iframe navigation stalled in the controlled browser; a reload loaded it. This is recorded as an observed first-launch issue, with its cause unresolved. Rendering success is separate from physical input acceptance.

## Pending creator acceptance

Physical computer control timed out during the actual iframe Pointer Lock check. The creator chose to test later. Mouse look, movement, Guard, sword, Q, fullscreen entry/exit, audible playback, ordinary multiplayer combat input, and a real landscape phone still require hands-on acceptance. Exported browser and live server probe results do not replace these checks.

`ITCH_HTML5_CHANNEL_READY` remains unset. Set it only after the postupload checklist in OPERATIONS.md passes. Public publication remains a separate creator decision. Later main commits are not automatically included in this upload.

## Recovery lookup correction

The retained draft and all six recovery assets exist. However, GitHub's release-by-tag REST endpoint returns published releases only, so the original expired-artifact lookup could not find this draft. Recovery now searches the authenticated paginated release list, requires one exact draft tag and source, and preserves existing receipt/hash checks. Future publication receipts and summaries record GitHub's actual draft URL and release ID.

The corrected path was exercised against this real retained ZIP without invoking Butler or changing the channel. Its full archive, provenance, and checksum validation passed. Regression tests also cover pagination, ambiguous matches, a missing archive, a published release, and a mismatched source.

[GitHub documents the published-only tag endpoint and authenticated draft listings](https://docs.github.com/en/rest/releases/releases#get-a-release-by-tag-name).
