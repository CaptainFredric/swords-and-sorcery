#!/bin/zsh
set -eu
cd "$(dirname "$0")/.."
exec claude 'Read docs/CLAUDE_HANDOFF.md and inspect the repository status. This is the shared Swords and Sorcery repository. Summarize the next focused helmet correction before editing; wait for my direction.'
