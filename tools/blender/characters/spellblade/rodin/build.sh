#!/usr/bin/env bash
# build.sh -- rebuild both Spellblade sources from Rodin's delivery (assets/source/rodin/) on the kit's rig and actions,
# and the emblem cape textures. Writes:
#   tools/blender/characters/spellblade/source/spellblade-third-person.blend
#   tools/blender/characters/spellblade/source/spellblade-first-person.blend
#   client/assets/heraldry/*-cape.jpg
# Env: BLENDER (a Blender 4.5 binary; default: blender), RODIN_WORK (scratch folder; default: artifacts/rodin).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../../../.." && pwd)
B=${BLENDER:-blender}
WORK=${RODIN_WORK:-$ROOT/artifacts/rodin}
SRC=$ROOT/tools/blender/characters/spellblade/source
# the last kit sources: their rig, fifteen actions, references and review cameras (third person), and the first-person
# rig, camera-tuned actions, camera and palm rune
BASE=6157fb22f87caa884b28169e3e1f66317ef8cff3
mkdir -p "$WORK"
git -C "$ROOT" show "$BASE:tools/blender/characters/spellblade/source/spellblade-third-person.blend" > "$WORK/kit-third-person.blend"
git -C "$ROOT" show "$BASE:tools/blender/characters/spellblade/source/spellblade-first-person.blend" > "$WORK/kit-first-person.blend"
# run one Blender step; on failure show the end of its log and stop
run() {
  local log
  if ! log=$("$B" --background --factory-startup --python-exit-code 1 "$@" 2>&1); then
    printf '%s\n' "$log" | tail -25
    echo "rodin/build.sh: Blender step failed: $*" >&2
    return 1
  fi
  printf '%s\n' "$log" | grep -E "^RODIN_" || true
}
run "$WORK/kit-third-person.blend" --python "$HERE/build_source.py" -- \
  --out "$SRC/spellblade-third-person.blend" --work "$WORK"
run "$WORK/kit-first-person.blend" --python "$HERE/fp_arms.py" -- \
  --third-person "$SRC/spellblade-third-person.blend" --kit-third-person "$WORK/kit-third-person.blend" \
  --out "$SRC/spellblade-first-person.blend"
run "$SRC/spellblade-third-person.blend" --python "$HERE/emblems.py" -- --out "$ROOT/client/assets/heraldry"
echo "RODIN_SOURCES_WRITTEN"
