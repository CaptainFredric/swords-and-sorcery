# itch release pipeline implementation plan

Goal: produce reviewed, traceable HTML5 candidates and permit deliberate publication without changing current deployments.

Architecture: reuse export-html5, add candidate validation and two Actions workflows. Candidate jobs have no itch credentials. Publication accepts a successful main candidate run, exact revision and checksum, uses trusted main tooling, a protected environment, a fixed channel, serialized execution, compatibility checks and preserved recovery assets.

1. Strengthen the existing exporter with file budget warnings and content hashes. Validate actual ZIP paths, hashes, root metadata and dependencies. Test corruption and packaging exclusions.
2. Build a candidate manifest tying source SHA, run, archive checksum and browser evidence together. Test provenance, approval, branch, duplicate and rollback rejection before writing publication orchestration.
3. Add a conservative deployed source check and real private WebSocket create/join/input/reconnect probe. Preserve server and client implementations. Test against a local server and explicit mismatch.
4. Extend existing Chrome capture infrastructure for the exported archive at a nested path, desktop actions, tutorial loading and simultaneous landscape touch input. Run it on actual exported files.
5. Implement credential free candidate workflow and manual protected publication. Pin Actions and official Butler distribution, preserve ZIPs in draft recovery releases, use hidden first migration, require explicit rollback and record postupload status separately from browser acceptance.
6. Run full verification, exporter, ZIP integrity, workflow validation and simulated publication failures. Open a focused PR with setup instructions and honest remaining platform checks. Do not upload, merge, deploy or change itch settings.
