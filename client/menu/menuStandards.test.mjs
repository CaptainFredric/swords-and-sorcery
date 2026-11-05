import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../menu.css',import.meta.url),'utf8');
const renown=readFileSync(new URL('../renown.css',import.meta.url),'utf8');
const challenges=readFileSync(new URL('../challenges.css',import.meta.url),'utf8');
const main=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
const scene=readFileSync(new URL('./MenuScene.mjs',import.meta.url),'utf8');
const section=id=>{
 const begin=html.indexOf('<section id="'+id+'"');
 const end=html.indexOf('</section>',begin);
 assert.ok(begin>=0&&end>begin,'missing '+id);
 return html.slice(begin,end);
};
test('Mettle banner separates scenario selection from right-hand battle settings',()=>{
 const body=section('breakthrough-menu');
 const pivot=body.indexOf('companion-banner mettle-companion');
 assert.ok(pivot>0);
 for(const id of ['breakthrough-size','breakthrough-arena','breakthrough-team',
   'breakthrough-rival','breakthrough-play-bots','breakthrough-create-private'])
  assert.ok(body.indexOf('id="'+id+'"')>pivot,id+' belongs to the settings banner');
 assert.ok(body.indexOf('id="mettle-modes"')<pivot);
 assert.match(css,/#breakthrough-menu\[data-panel="details"\]/);
 assert.match(main,/breakthroughMenu\.dataset\.panel='details'/);
});
test('Private mode defaults to FFA and uses one create button with validated room settings',()=>{
 const body=section('private-menu');
 const pivot=body.indexOf('companion-banner private-companion');
 assert.ok(pivot>0);
 for(const mode of ['FFA','BREAKTHROUGH','HIGH_GROUNDS'])
  assert.match(body,new RegExp('data-private-mode="'+mode+'"'));
 assert.match(body,/data-private-mode="FFA" class="selected"/);
 for(const id of ['private-room-config','private-rules-summary',
   'private-config-create'])assert.ok(body.indexOf('id="'+id+'"')>pivot,id+' belongs to right banner');
 assert.match(body,/id="create-room"/);
 assert.match(body,/id="room-code"/);
 assert.doesNotMatch(body,/id="create-breakthrough-room"/);
 for(const name of ['worldId','scoreToWin','minutes','teamSize','botSkill'])
  assert.match(body,new RegExp('name="'+name+'"'));
 assert.match(main,/menuController\.createPrivate\(nameInput\.value,settings\)/);
 assert.match(main,/privateRoomForm\.addEventListener\('submit',event=>/);
});
test('Paired banners use square-edged brass rods and protect their top headings',()=>{
 assert.match(css,/menu-screen::after, \.side-screen::after, \.lobby-screen::after/);
 assert.match(css,/border-radius: 2px;\s*background: linear-gradient\(90deg,#6f4421/);
 assert.match(css,/#solo-menu \.companion-banner \.banner-scroll,/);
 assert.match(css,/#rooms-menu \.companion-banner \.banner-scroll,/);
 assert.match(css,/#private-menu \.companion-banner \.banner-scroll,/);
 assert.match(css,/#breakthrough-menu \.companion-banner \.banner-scroll/);
 assert.match(main,/scroll\.querySelectorAll\('\.banner-scroll'\)/);
});
test('Armory tabs, heraldry and challenges remain inside the genuine scroll viewport',()=>{
 assert.match(renown,/#armory-menu \.armory-inner\s*\{\s*--banner-width:min\(510px,46cqw\)/);
 assert.match(renown,/#armory-menu \.armory-scroll\s*\{/);
 assert.match(renown,/overflow-y:auto;overflow-x:hidden/);
 assert.match(renown,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(challenges,/#armory-menu \.mastery-feat-heading/);
 assert.match(challenges,/overflow-wrap:anywhere/);
});
test('Spellblade retreats from Armory cloth, restores canonical position and retains normal showcase animations',()=>{
 assert.match(scene,/setArmoryPresentation\(active\)/);
 assert.match(scene,/this\.targetPosition\.set\(-\.86,0,\.46\)/);
 assert.match(scene,/isRepositioning/);
 assert.match(scene,/if \(this\.armoryPreview && !isRepositioning/);
 assert.match(main,/setArmoryPresentation\(screenId===SCREEN_IDS\.ARMORY\)/);
 assert.match(main,/previous===SCREEN_IDS\.ARMORY&&screenId!==SCREEN_IDS\.ARMORY/);
});
