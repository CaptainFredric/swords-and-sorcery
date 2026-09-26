#!/bin/zsh
# build_kit.sh -- regenerate both Spellblade sources (source/spellblade-third-person.blend and
# source/spellblade-first-person.blend) from the kit.
# Env: BLENDER (Blender 4.5 binary), KIT_PYTHON (python with numpy + pillow), SPELLBLADE_KIT_WORK (work folder).
set -euo pipefail
KIT=${0:A:h}
ROOT=${KIT:h:h:h:h:h}
B=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
PY=${KIT_PYTHON:-python3}
export SPELLBLADE_KIT_WORK=${SPELLBLADE_KIT_WORK:-$ROOT/artifacts/kit}
WORK=$SPELLBLADE_KIT_WORK
mkdir -p $WORK
# run a Blender step: abort the build (with the log tail) if it fails, otherwise print its summary lines
run() {
  local log
  log=$("$B" --background --factory-startup "$@" 2>&1) || { print -r -- "$log" | tail -25; echo "build_kit: Blender step failed: $*" >&2; return 1; }
  print -r -- "$log" | grep -E "^(RIG2|HELMET3|KIT|BANNER|WEAR|FT |FOLLOWTHROUGH|STANCE|IDLE_LOOP|GUARD_LOOP|FP_GUARD_LOOP)" || true
}
# never copy a stale file from an earlier run
rm -f $WORK/helmet.blend $WORK/rig2.blend $WORK/kit.blend $WORK/kit_st.blend $WORK/kit_ft.blend $WORK/fp_kit.blend $WORK/fp_st.blend
# the last hand-built source: its rig, actions, sword, palm rune and accent materials are the starting point
git -C $ROOT show bcc16ef:tools/blender/characters/spellblade/source/spellblade-third-person.blend > $WORK/source_bcc16ef.blend
python3 $KIT/joints_concept.py > /dev/null
$PY $KIT/banner_tex.py $WORK/banner.jpg
$PY $KIT/wear_tex.py $WORK
run --python-exit-code 1 --python $KIT/helmet3.py -- $WORK/helmet.blend
run $WORK/source_bcc16ef.blend --python-exit-code 1 --python $KIT/rig2.py -- $WORK/rig2.blend
run $WORK/rig2.blend --python-exit-code 1 --python $KIT/kit.py -- $WORK/kit.blend
# slash follow-through: bend the sword's path around the legs with one smooth arm key per slash
# ready stance on the standing actions, a breathing Idle loop and a living Guard hold
run $WORK/kit.blend --python-exit-code 1 --python $KIT/stance.py -- $WORK/kit_st.blend
run $WORK/kit_st.blend --python-exit-code 1 --python $KIT/followthrough.py -- $WORK/kit_ft.blend
cp $WORK/kit_ft.blend $ROOT/tools/blender/characters/spellblade/source/spellblade-third-person.blend
# first person: the same arm builders on the authored first-person rig, camera and actions
git -C $ROOT show bcc16ef:tools/blender/characters/spellblade/source/spellblade-first-person.blend > $WORK/fp_base.blend
KIT_MODE=fp run $WORK/fp_base.blend --python-exit-code 1 --python $KIT/kit.py -- $WORK/fp_kit.blend
KIT_MODE=fp run $WORK/fp_kit.blend --python-exit-code 1 --python $KIT/stance.py -- $WORK/fp_st.blend
cp $WORK/fp_st.blend $ROOT/tools/blender/characters/spellblade/source/spellblade-first-person.blend
echo "SPELLBLADE_KIT_SOURCE_WRITTEN"
