import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const main=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
const renown=readFileSync(new URL('../renown.css',import.meta.url),'utf8');
function section(name){
 const at=html.indexOf('<section id="'+name+'"'),end=html.indexOf('<section ',at+1);
 assert.ok(at>=0);return html.slice(at,end<0?undefined:end);
}
test('Mettle controls live on companion standard, with left-side mode and play actions',()=>{
 const s=section('breakthrough-menu'),right=s.indexOf('mettle-companion');
 assert.ok(right>0&&s.indexOf('id="mettle-modes"')<right);
 for(const id of ['breakthrough-size','breakthrough-arena','breakthrough-team','breakthrough-rival'])
   assert.ok(s.indexOf('id="'+id+'"')>right,id);
 assert.match(s,/id="breakthrough-play-bots"/);
});
test('Private room chooses one of three modes and exposes actual host rules and invite code',()=>{
 const s=section('private-menu');
 for(const mode of ['FFA','BREAKTHROUGH','HIGH_GROUNDS'])
   assert.ok(s.includes('data-private-mode="'+mode+'"'),mode);
 for(const id of ['create-room','room-code','private-settings-form'])
   assert.ok(s.includes('id="'+id+'"'),id);
 assert.ok(!s.includes('id="create-breakthrough-room"'));
 for(const name of ['worldId','scoreToWin','minutes','teamSize','team','botSkill'])
   assert.ok(s.includes('name="'+name+'"'),name);
 assert.match(main,/createPrivate\(nameInput\.value,preview\.settings,preview\.team\)/);
});
test('Relocated control IDs are unique and Armory tabs cannot break words',()=>{
 for(const id of ['breakthrough-rival-note','breakthrough-size','private-mode','private-rule-summary','create-room','siege-blades-menu','siege-play-bots','siege-open-workshop'])
  assert.equal([...html.matchAll(/\bid="([^"]+)"/g)].filter(m=>m[1]===id).length,1,id);
 assert.match(renown,/word-break:keep-all/);
 assert.match(renown,/overflow-y:auto/);
});

test('Dedicated Siege Blades hub uses new action portraits and Modes of Mettle groups Individual vs Team modes',()=>{
 const siege=section('siege-blades-menu');
 for(const portrait of ['so-fist-ication.svg','bi-bye-llista.svg','fight-and-flight.svg'])
  assert.ok(siege.includes(portrait),portrait);
 for(const id of ['siege-play-bots','siege-browse-matches','siege-create-private','siege-open-workshop','siege-hub-size','siege-hub-format'])
  assert.ok(siege.includes('id="'+id+'"'),id);
 const mettle=section('breakthrough-menu');
 const indiv=mettle.indexOf('>INDIVIDUAL PURSUITS<'),team=mettle.indexOf('>TEAM BATTLES<');
 assert.ok(indiv>0&&team>indiv);
 for(const mode of ['RENOWN_TRIALS','EDGE_OF_VICTORY','FFA'])
  assert.ok(mettle.indexOf('data-mettle-mode="'+mode+'"')>indiv&&mettle.indexOf('data-mettle-mode="'+mode+'"')<team,mode);
 for(const mode of ['BREAKTHROUGH','HIGH_GROUNDS','RESTLESS_DAY'])
  assert.ok(mettle.indexOf('data-mettle-mode="'+mode+'"')>team,mode);
 assert.ok(mettle.includes('id="mettle-to-siege"'));
 const solo=section('solo-menu');
 assert.ok(solo.includes('TRAINING OPTIONS'));
 assert.ok(solo.indexOf('id="advanced-practice-tools"')<solo.indexOf('id="inspection-mode"'));
});
