import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { withMotionClips } from './SpellbladeAssets.mjs';
import { resolveSpellbladeAnimationPlan, resolveFirstPersonAnimationPlan } from './spellbladeAnimationPlan.mjs';
import { authoredArmoryClip } from '../menu/armoryPreview.mjs';

const base = '../assets/characters/spellblade/';
const manifest = JSON.parse(readFileSync(new URL(base + 'manifest.json', import.meta.url), 'utf8'));
const requiredTP = ['Idle','Run','Sprint','Guard','Slash_1','Slash_2','Slash_3',
  'Restless_Fall_Asleep_Standing_Slump','Restless_Fall_Asleep_Seated_Nod',
  'Restless_Sleep_Breathing_Loop','Restless_Ladder_Carry_Idle','Restless_Ladder_Carry_March',
  'Armory_Fireball_Cast_Showcase','Armory_Frostfire_Snap_Showcase','Armory_Gale_Cone_Showcase',
  'Armory_Coreflagration_Lob_Showcase','Armory_LineOfConduct_Commit_Showcase',
  'Armory_Steel_Infusion_Brace_Showcase'];
const requiredFP = ['Slash_1','Slash_2','Slash_3','FP_Ladder_Carry_Idle','FP_Ladder_Carry_March'];

function inspect(file, expected, sha, count) {
  const bytes = readFileSync(new URL(base + file, import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha);
  assert.equal(bytes.toString('ascii', 16, 20), 'JSON');
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  assert.equal(json.animations.length, count);
  assert.deepEqual(json.animations.map((a) => a.name), expected);
  assert.ok(json.skins?.length > 0 && json.meshes?.length > 0);
}

test('Argon 89/25 production models are the exact reviewed bytes and inventories', () => {
  inspect('spellblade.glb', manifest.thirdPerson.clips, manifest.thirdPerson.sha256, 89);
  inspect('spellblade-fp.glb', manifest.firstPerson.clips, manifest.firstPerson.sha256, 25);
});

test('phase sidecars append rather than replace newer canonical actions', () => {
  const own = [{name:'Slash_1',source:'new'}, {name:'Idle'}];
  const motion = [{name:'Slash_1',source:'old'}, {name:'Technique_Whirl_Revolution'}];
  const result = withMotionClips(own,motion);
  assert.equal(result.find((clip)=>clip.name==='Slash_1').source,'new');
  assert.equal(result.filter((clip)=>clip.name==='Slash_1').length,1);
  assert.equal(result.find((clip)=>clip.name==='Technique_Whirl_Revolution'),motion[1]);
});

test('Restless Day collapse plays both variants then breathes without the Death clip', () => {
  for (const [variant,clip,duration] of [
    [0,'Restless_Fall_Asleep_Standing_Slump',2.2],
    [1,'Restless_Fall_Asleep_Seated_Nod',2.4]]) {
    const player = {restlessAsleep:true,restlessSleepAt:10,restlessVariant:variant};
    assert.equal(resolveSpellbladeAnimationPlan({state:'restless-sleep',player,serverNow:10.3}).clip,clip);
    const next = resolveSpellbladeAnimationPlan({state:'restless-sleep',player,serverNow:10+duration+0.1});
    assert.equal(next.clip,'Restless_Sleep_Breathing_Loop');
    assert.equal(next.loop,true);
  }
});

test('ladder carry is connected to third- and first-person gameplay events', () => {
  const player={restlessCarrying:'ladder-1',velocity:{x:0,z:0}};
  assert.equal(resolveSpellbladeAnimationPlan({state:'idle',player,localTime:2}).clip,'Restless_Ladder_Carry_Idle');
  player.velocity.x=1;
  assert.equal(resolveSpellbladeAnimationPlan({state:'run',player,localTime:3}).clip,'Restless_Ladder_Carry_March');
  assert.equal(resolveFirstPersonAnimationPlan({state:'idle'},{combatPlayer:player},3).clip,'FP_Ladder_Carry_March');
  player.velocity.x=0;
  assert.equal(resolveFirstPersonAnimationPlan({state:'idle'},{combatPlayer:player},3).clip,'FP_Ladder_Carry_Idle');
});

test('six Armory demonstrations map to the actual 89-clip authored poses', () => {
  for (const [id,clip] of Object.entries({
    fireball:'Armory_Fireball_Cast_Showcase',
    frostfire:'Armory_Frostfire_Snap_Showcase',
    gale:'Armory_Gale_Cone_Showcase',
    coreflagration:'Armory_Coreflagration_Lob_Showcase',
    steel:'Armory_Steel_Infusion_Brace_Showcase',
    line_of_conduct:'Armory_LineOfConduct_Commit_Showcase'
  })) assert.equal(authoredArmoryClip(id),clip);
  assert.equal(authoredArmoryClip('vortex'),null);
});
