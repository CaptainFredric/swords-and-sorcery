import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HUD} from './HUD.mjs';
import {KILLFEED_TONES,killFeedAppearance} from '../game/killFeedColor.mjs';

class FakeNode {
  constructor(tag='div') {
    this.tagName=tag.toUpperCase();this._text='';this.children=[];
    this.dataset={};this.className='';this.classList={remove(){},add(){}};
  }
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
  appendChild(node){this.children.push(node);return node;}
  prepend(node){this.children.unshift(node);return node;}
  get lastElementChild(){return this.children.at(-1)??null;}
  remove(){this.removed=true;}
}
test('HUD renders five independently tinted Disaster words without parsing arbitrary player names as HTML',()=>{
 const old=globalThis.document;
 globalThis.document={createElement:tag=>new FakeNode(tag)};
 try{
  const feed=new FakeNode(),hud={feed};
  const event={source:'one_hit_of_wonders',killerId:'k',victimId:'v',
    infusionTiers:{fire:2,frost:1,gale:2,lightning:2,steel:1}};
  const appearance=killFeedAppearance(event);
  const raw='Rowan <img src=x onerror=alert(1)> slew Perry';
  const node=HUD.prototype.addFeed.call(hud,raw,appearance.tone,'same',appearance.infusions);
  assert.equal(node.className,'feed-line mixed tone-mixed');
  assert.equal(node.children.length,5);
  assert.deepEqual(node.children.map(n=>n.className),[
    'feed-infusion tone-fire','feed-infusion tone-frost','feed-infusion tone-gale',
    'feed-infusion tone-lightning','feed-infusion tone-steel']);
  assert.ok(node.textContent.startsWith(raw),'author-written copy remains literal unchanged');
  assert.equal(node.children[0].title,'FIRE infusion · Full');
  assert.equal(node.children.at(-1).title,'STEEL infusion · Half');
  assert.equal(node.children.some(n=>n.tagName==='IMG'),false,'untrusted names never become elements');
  clearTimeout(node.feedFadeTimer);clearTimeout(node.feedRemoveTimer);
  const next=HUD.prototype.addFeed.call(hud,'Rowan slew Perry again','sword','same');
  assert.strictEqual(next,node,'one keyed line is replaced, not duplicated');
  assert.equal(next.children.length,0,'old element words never bleed into a new kill');
  assert.equal(feed.children.length,1);
  clearTimeout(node.feedFadeTimer);clearTimeout(node.feedRemoveTimer);
 }finally{globalThis.document=old;}
});
test('CSS exposes readable feed and local SLAIN color for every registered cause and chip',()=>{
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 for(const tone of Object.keys(KILLFEED_TONES)){
  assert.match(css,new RegExp('\\.feed-line\\.tone-'+tone+'\\b'),tone+' feed family exists');
  assert.match(css,new RegExp('\\.status-flash\\.kill\\.tone-'+tone+'\\b'),tone+' SLAIN family exists');
 }
 for(const element of ['fire','frost','gale','lightning','steel'])
  assert.match(css,new RegExp('\\.feed-infusion\\.tone-'+element+'\\b'));
});
