import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HUD} from './HUD.mjs';
import {KILLFEED_TONES,killFeedAppearance,killFeedColoredWords} from '../game/killFeedColor.mjs';

class FakeNode {
  constructor(tag='div') {
    this.tagName=tag.toUpperCase();this._text='';this.children=[];
    this.dataset={};this.style={};this.className='';this.classList={remove(){},add(){}};
  }
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
  appendChild(node){this.children.push(node);return node;}
  prepend(node){this.children.unshift(node);return node;}
  get lastElementChild(){return this.children.at(-1)??null;}
  remove(){this.removed=true;}
}
test('HUD colors the authored Disaster sentence itself, with five elements and NO appended labels',()=>{
 const old=globalThis.document;
 globalThis.document={createElement:tag=>new FakeNode(tag)};
 try{
  const feed=new FakeNode(),hud={feed};
  const event={source:'one_hit_of_wonders',killerId:'k',victimId:'v',
    infusionTiers:{fire:2,frost:1,gale:2,lightning:2,steel:1}};
  const appearance=killFeedAppearance(event);
  const raw='Rowan <img src=x onerror=alert(1)> slew Perry';
  const node=HUD.prototype.addFeed.call(hud,raw,appearance.tone,'same',appearance.infusions);
  const parts=killFeedColoredWords(raw,appearance.infusions);
  assert.equal(node.className,'feed-line mixed tone-mixed');
  assert.equal(node.textContent,raw,'no extra · FIRE or other element text');
  assert.equal(node.children.length,parts.length,'each fragment belongs to existing text');
  assert.deepEqual([...new Set(parts.flatMap(p=>p.tones))],
    ['fire','frost','gale','lightning','steel']);
  assert.ok(node.children.every(n=>n.className.startsWith('feed-word')),
    'all colors affect original prose only');
  const short=HUD.prototype.addFeed.call(hud,'Rowan won',appearance.tone,'same',appearance.infusions);
  assert.strictEqual(short,node,'keyed text updates reuse the same element');
  assert.equal(short.textContent,'Rowan won','short messages keep their exact wording');
  assert.ok(short.children.some(n=>n.style.backgroundImage?.includes('linear-gradient(')),
    'short fragments can carry more than one infusion without inserting badges');
  assert.equal(node.children.some(n=>n.tagName==='IMG'),false,
    'untrusted names are never parsed into HTML');
  clearTimeout(node.feedFadeTimer);clearTimeout(node.feedRemoveTimer);
  const next=HUD.prototype.addFeed.call(hud,'Rowan slew Perry again','sword','same');
  assert.strictEqual(next,node,'one keyed line is replaced, not duplicated');
  assert.equal(next.children.length,0,'old colored words never bleed into a new kill');
  assert.equal(feed.children.length,1);
  clearTimeout(node.feedFadeTimer);clearTimeout(node.feedRemoveTimer);
 }finally{globalThis.document=old;}
});
test('CSS exposes readable feed, colored prose and local SLAIN for every registered cause',()=>{
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 for(const tone of Object.keys(KILLFEED_TONES)){
  assert.match(css,new RegExp('\\.feed-line\\.tone-'+tone+'\\b'),tone+' feed family exists');
  assert.match(css,new RegExp('\\.status-flash\\.kill\\.tone-'+tone+'\\b'),tone+' SLAIN family exists');
 }
 for(const element of ['fire','frost','gale','lightning','steel'])
  assert.match(css,new RegExp('\\.feed-word\\.tone-'+element+'\\b'));
 assert.match(css,/\.feed-word\.feed-gradient/);
 assert.doesNotMatch(css,/\.feed-infusion/,'former elemental chips are removed');
});
