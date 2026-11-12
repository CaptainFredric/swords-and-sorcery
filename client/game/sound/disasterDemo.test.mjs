import test from 'node:test';
import assert from 'node:assert/strict';
import {DEMOS} from './soundDemo.mjs';

function events(name){
  const list=[];
  DEMOS[name].script({play:(recipe,options)=>list.push({recipe,...options})});
  return list;
}
test('Debug sound renderer exposes independent audio audition sequences',()=>{
  assert.ok(DEMOS['magma-and-lightning']);
  assert.ok(DEMOS['disaster-elements']);
  assert.ok(DEMOS['magma-and-lightning'].seconds>=15);
  assert.ok(DEMOS['disaster-elements'].seconds>=40);
});
test('Magma bubbles occur before final deep explosion; lightning and wind remain separately recognizable',()=>{
  const e=events('magma-and-lightning');
  assert.ok(e.length>=9);
  const arming=e.find(x=>x.at===1),bubbles=e.find(x=>x.at===1.035),blast=e.find(x=>x.at===1.6);
  assert.ok(arming&&bubbles&&blast);
  assert.ok(bubbles.recipe.layers.some(x=>(x.at??0)>.15));
  assert.ok(blast.recipe.layers.some(x=>x.freq<65&&x.type==='tone'));
  assert.ok(e.some(x=>x.at===6)&&e.some(x=>x.at===6.45));
  assert.ok(e.some(x=>x.at===11)&&e.some(x=>x.at===11.65));
  assert.ok(e.every(x=>x.at>=0&&x.at<DEMOS['magma-and-lightning'].seconds));
});
test('Disaster audition renders base, each individual element, then all five in layers',()=>{
  const eventsList=events('disaster-elements');
  const beginnings=[1,6,11,16,21,26,33];
  for(const time of beginnings)
    assert.ok(eventsList.some(e=>e.at===time),'element section beginning at '+time+'s');
  assert.ok(eventsList.some(e=>e.at>33.1&&e.at<33.25),'full mixture has staggered fire/frost accents');
  assert.ok(eventsList.every(x=>x.at<DEMOS['disaster-elements'].seconds),
    'all delayed recipes fit the demo render');
  assert.ok(eventsList.length>=40,'not a single representative one-shot');
});
