# Castleward distribution implementation plan

Goal: prepare an accurate private itch.io release and consistent creator media, using the existing playable client and multiplayer server.

Architecture: export the current client and shared modules with the existing ss-game-server meta pointing at Render. Keep GitHub Pages playable. Preserve the separate Credits support draft, PR145, until a real Ko fi URL is supplied.

Stack: Node 24, native filesystem and ZIP tooling, existing browser client, Chrome, itch.io Draft.

Spec: creator supplied release brief, attachment 59c59a54-e65e-4724-b75a-e35112dbb724.

Constraints: retain gameplay authority and local solo; root index.html; relative assets; secure external resources; fewer than 1000 files, 500 MB total, 200 MB per file, 240 characters per path. Preserve Claude's checkout. Keep project private and PRs unmerged. User forbids automatic code reviews and reviewer agents.

1. Verify GitHub Pages works, then replace the creator page's Render play link. Existing Pages uses the real Render backend.
2. Create a faithful avatar candidate and covers from real captures. Label generated artwork separately. Save a comparison and media manifest.
3. Implement scripts/export-html5.mjs and focused tests for package filtering, configuration, paths, limits and archive layout. Add npm scripts and instructions. Test a subdirectory static preview before upload.
4. Prepare an itch.io Draft with accurate description, disclosure and controls. Upload the package, cover and actual screenshots. Test the actual iframe, secure multiplayer, ordinary input, reconnect, cross host rooms, solo fallback and responsive framing. Record any unverified device behavior.
5. Run repository verification. Save release evidence, project text, devlog, first week measurement template and practical next steps. Open a separate Draft PR. No publishing, payment setup or merging.

Key risks to verify: mjs MIME on the HTML CDN, GLB and voice paths under a subdirectory, third party storage, fullscreen and pointer lock permissions, server sleeping, guest identity being scoped to each host.

Execution notes: already in isolated linked worktree /Users/erendiracisneros/swords-and-sorcery-polish. Baseline origin/main aad49e8e46ffeb70da394ec91e3345f8c6f6d888. Branch feat/itch-release. Source clean, preexisting untracked output preserved. Prior support baseline verification passed 1111 tests; rerun after export changes.
