import test from 'node:test';
import assert from 'node:assert/strict';
import { TutorialView } from './TutorialView.mjs';
import { TutorialDirector } from './TutorialDirector.mjs';

function view(context={}) {
  globalThis.document=new EventTarget();
  const elements=new Map();
  const root={hidden:true,classList:{toggle(){}},querySelector(selector){
    if(!elements.has(selector)) elements.set(selector,Object.assign(new EventTarget(),{hidden:false,textContent:''}));
    return elements.get(selector);
  }};
  let continued=0;
  const display=new TutorialView(root,{context:()=>context,onContinue:()=>continued++});
  return {display,root,elements,continued:()=>continued};
}
test('caption preview keeps the creator joke at the endpoint, presents YOU and never advances speech on a timer',()=>{
  const {display,elements,continued}=view();
  display.show({state:'running',current:{kind:'dialogue',speaker:'spellblade',line:'Of course. I have a name.'}});
  assert.equal(elements.get('[data-tutorial-speaker]').textContent,'YOU');
  assert.equal(elements.get('[data-tutorial-exchange]').hidden,true);
  assert.equal(elements.get('[data-tutorial-continue]').hidden,false);
  assert.equal(continued(),0);
  const event=new Event('keydown');Object.defineProperty(event,'code',{value:'Enter'});document.dispatchEvent(event);
  assert.equal(continued(),1);
  display.show({state:'prototype-ended'});
  assert.equal(elements.get('[data-tutorial-exchange]').hidden,false);
  assert.equal(elements.get('[data-tutorial-continue]').hidden,true);
  assert.equal(elements.get('[data-tutorial-practice]').hidden,false);
  assert.equal(elements.get('[data-tutorial-skip]').hidden,true);
});
test('touch captions use Continue and an optional aside does not replace the movement prompt',()=>{
  const {display,elements}=view({touch:true});
  const director=new TutorialDirector();director.start();director.offerBranch('frolic');
  display.show(director.progress);
  assert.equal(elements.get('[data-tutorial-continue]').textContent,'CONTINUE');
  assert.match(elements.get('[data-tutorial-optional-line]').textContent,/NARRATOR: The Spellblade decides to frolic/);
  assert.equal(elements.get('[data-tutorial-line]').textContent,director.current.line);
});
