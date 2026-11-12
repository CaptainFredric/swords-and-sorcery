import test from 'node:test';
import assert from 'node:assert/strict';
import {SoundEngine} from './SoundEngine.mjs';
import {
  coreMagmaFuseRecipe,coreMagmaDetonationRecipe,conductChargeRecipe,
  conductDischargeRecipe,galeStreamRecipe,disasterEarthImpactRecipe,
  disasterInfusionImpactRecipe,disasterInfusionFieldRecipe,
} from './disasterSoundRecipes.mjs';

// A strict little WebAudio graph, not a blank mock. Every oscillator, noise
// node and filter must accept finite start/stop times and frequencies through
// the EXACT SoundEngine used in Chrome.
class FakeContext{
  constructor(){
    this.state='running';this.currentTime=0;this.sampleRate=8000;
    this.started=[];this.stopped=[];this.parameters=[];this.sources=[];
    this.destination=this.node();
  }
  param(value=0){
    const ctx=this;
    return {value,
      setValueAtTime(v,t){assert.ok(Number.isFinite(v)&&Number.isFinite(t));this.value=v;ctx.parameters.push(v);return this;},
      linearRampToValueAtTime(v,t){assert.ok(Number.isFinite(v)&&Number.isFinite(t));this.value=v;ctx.parameters.push(v);return this;},
      exponentialRampToValueAtTime(v,t){assert.ok(v>0&&Number.isFinite(t));this.value=v;ctx.parameters.push(v);return this;},
      setTargetAtTime(v,t,constant){assert.ok(Number.isFinite(v)&&Number.isFinite(t)&&constant>0);this.value=v;return this;},
      cancelScheduledValues(){return this},
    };
  }
  node(){
    const node={
      gain:this.param(1),frequency:this.param(440),Q:this.param(.7),
      delayTime:this.param(0),pan:this.param(0),playbackRate:this.param(1),
      threshold:this.param(0),knee:this.param(0),ratio:this.param(1),
      attack:this.param(0),release:this.param(0),offset:this.param(0),
      connect(other){assert.ok(other);return other},
      disconnect(){},
      start:(when,offset)=>{assert.ok(Number.isFinite(when)&&when>=0);
        this.started.push({when,offset});},
      stop:(when)=>{assert.ok(Number.isFinite(when)&&when>=0);this.stopped.push(when)},
    };
    return node;
  }
  createGain(){return this.node()}
  createOscillator(){return this.node()}
  createBufferSource(){const node=this.node();this.sources.push(node);return node}
  createConvolver(){return this.node()}
  createDelay(){return this.node()}
  createBiquadFilter(){return this.node()}
  createDynamicsCompressor(){return this.node()}
  createStereoPanner(){return this.node()}
  createBuffer(channels,length,sampleRate){
    assert.ok(channels>0&&length>0&&sampleRate>0);
    const data=Array.from({length:channels},()=>new Float32Array(length));
    return {getChannelData:i=>data[i],copyToChannel:(arr,i)=>data[i].set(arr),
      sampleRate,length,numberOfChannels:channels};
  }
}
test('Every new identity plays in the REAL WebAudio recipe engine, with legal envelope times and finite lifetimes',()=>{
  const ctx=new FakeContext();
  const engine=new SoundEngine({listen:false}).useContext(ctx);
  engine.offline=true; // avoids deferred disconnect timers in this graph test
  const rnd=()=>.4;
  const recipes=[
    coreMagmaFuseRecipe(rnd,{seconds:.6}),
    coreMagmaDetonationRecipe(rnd),conductChargeRecipe(rnd),
    conductDischargeRecipe(rnd),galeStreamRecipe(rnd,{seconds:.8}),
    disasterEarthImpactRecipe(rnd),
    ...['fire','frost','gale','lightning','steel'].flatMap(element=>[
      disasterInfusionImpactRecipe(element,rnd,{tier:2}),
      disasterInfusionFieldRecipe(element,rnd,{tier:2,strength:.5}),
    ]),
  ];
  for(const [i,recipe] of recipes.entries()){
    const result=engine.play(recipe,{at:1+i*.4,gain:.45,pan:Math.sin(i)});
    assert.equal(typeof result?.stop,'function');
  }
  assert.ok(ctx.started.length>70,'actual oscillators and filtered noise sources are allocated');
  assert.equal(ctx.started.length,ctx.stopped.length,'all sources have finite stop times');
  assert.ok(ctx.stopped.every(t=>t<30),'no indefinitely looping audio samples');
  assert.ok(ctx.parameters.every(Number.isFinite));
});

test('Held Gale wind has a real sustained body, loops the noise source and fades without a hard cut',()=>{
  const ctx=new FakeContext();
  const engine=new SoundEngine({listen:false}).useContext(ctx);
  engine.offline=true;
  const wind=galeStreamRecipe(()=>.4,{seconds:.8,weight:1});
  const first=ctx.stopped.length;
  engine.play(wind,{at:2,gain:.35,pan:0});
  const durations=ctx.stopped.slice(first);
  assert.ok(durations.length>=3);
  assert.ok(Math.max(...durations)>2.68,
    'audible wind remains present well after the opening whoosh');
  assert.ok(ctx.sources.filter(n=>n.buffer===engine.noise).every(n=>n.loop===true),
    'sustained noise must loop its one-second source buffer until envelope finishes');
  const short={layers:[{type:'noise',filter:'highpass',freq:4000,
    attack:.002,decay:.08,gain:.1}],reverb:0};
  const before=ctx.sources.length;
  engine.play(short,{at:4,gain:.5});
  assert.equal(ctx.sources[before].loop,false,
    'old short-percussive recipes still use unlooped one-shot noise');
});
