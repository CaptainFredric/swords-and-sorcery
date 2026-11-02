import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {CastlewardRenderer} from '../../client/worlds/CastlewardRenderer.mjs';
import {SCENE_PRESENTATION as P} from '../../client/game/scenePresentation.mjs';
import {retargetClips} from './retarget.mjs';
import {runCompositionChecks} from './composition.browser.mjs';
const scene=new THREE.Scene();scene.background=new THREE.Color(P.background);scene.fog=new THREE.FogExp2(P.fogColor,P.fogDensity);
scene.add(new THREE.HemisphereLight(P.hemisphere.skyColor,P.hemisphere.groundColor,P.hemisphere.intensity));
const sun=new THREE.DirectionalLight(P.moon.color,P.moon.intensity);sun.position.set(-12,24,8);scene.add(sun);
new CastlewardRenderer(scene);
const camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.05,180);camera.layers.enableAll();
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.append(renderer.domElement);
const orbit=new OrbitControls(camera,renderer.domElement);orbit.target.set(0,1,-10);camera.position.set(0,2.2,-22);orbit.update();
const loader=new GLTFLoader(),manifest=await(await fetch('/client/assets/characters/spellblade/manifest.json')).json();
const paths={production:manifest.thirdPerson.url,v29:'/assets/source/argon-review/spellblade-v2.9-review-only.glb',v30:'/assets/source/argon-review/spellblade-v30-refined-candidate.glb',v31:'/assets/source/argon-review/spellblade-v31-ingame-review-candidate.glb'};
const models=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([key,url])=>[key,await loader.loadAsync(url)])));
const metrics={},actors=[];
for(const [key,gltf]of Object.entries(models)){
 const root=gltf.scene;scene.add(root);root.rotation.y=key==='production'?0:Math.PI;
 // Same Castleward lighting, no candidate-only environment or material edits.
 let triangles=0,vertices=0;const materials=new Set(),bones=[];
 root.traverse(n=>{if(n.isBone)bones.push(n);if(n.isMesh){triangles+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;vertices+=n.geometry.attributes.position.count;[n.material].flat().forEach(m=>materials.add(m));}});
 metrics[key]={storedTriangles:triangles,vertices,joints:bones.length,materials:materials.size,primitives:0};root.traverse(n=>{if(n.isMesh)metrics[key].primitives++;});
 const production=key==='production'?gltf.animations:retargetClips(models.production.scene,root,models.production.animations);
 const clips=new Map(production.map(c=>['Production / '+c.name,c]));
 for(const c of gltf.animations)if(key!=='production')clips.set('Authored / '+c.name.replace(/^Spellblade_\d+_/,''),c);
 const mixer=new THREE.AnimationMixer(root),label=document.createElement('div');label.className='label';label.textContent=key;document.querySelector('#labels').append(label);
 actors.push({key,root,mixer,clips,label});
}
const selector=document.querySelector('#model'),clipSelect=document.querySelector('#clip'),slider=document.querySelector('#time'),status=document.querySelector('#status');
const common=[...actors[1].clips.keys()];for(const key of common){const o=document.createElement('option');o.value=o.textContent=key;clipSelect.add(o);}
let playing=true,phase=0,last=performance.now(),active='';
function layout(){const shown=actors.filter(a=>(selector.value==='all'||a.key===selector.value)&&(!active||a.clips.has(active)));actors.forEach(a=>{a.root.visible=shown.includes(a);a.label.hidden=!a.root.visible;});shown.forEach((a,i)=>{a.root.position.set(((shown.length-1)/2-i)*2.4,0,-10);});const distance=shown.length>1?8:5.8;camera.position.set(0,2.2,-10-distance);orbit.target.set(0,1.1,-10);orbit.update();}
selector.onchange=layout;layout();
function choose(){active=clipSelect.value;for(const a of actors){a.mixer.stopAllAction();a.action=null;const c=a.clips.get(active);if(c){a.action=a.mixer.clipAction(c);a.action.play();a.action.paused=true;}}layout();}
clipSelect.onchange=choose;clipSelect.value='Production / Idle';choose();document.querySelector('#pause').onclick=()=>{playing=!playing;document.querySelector('#pause').textContent=playing?'Pause':'Play';};slider.oninput=()=>{phase=Number(slider.value);playing=false;};
for(const [id,pos]of Object.entries({front:[0,2.2,-12],side:[12,2.2,0],rear:[0,2.2,12],three:[-9,3,-9]}))document.querySelector('#'+id).onclick=()=>{const scale=selector.value==='all'?1:.48;camera.position.set(pos[0]*scale,pos[1]*scale,-10+pos[2]*scale);orbit.update();};
document.querySelector('#checks').onclick=async()=>{status.textContent='Checking real renderer channels…';try{const result=await runCompositionChecks();window.argonChecks=result;status.textContent=JSON.stringify(result);}catch(e){status.textContent='FAIL: '+e.stack;console.error(e);}};
window.argonReview={scene,camera,renderer,actors,metrics};
function handVariant(a){
 if(a.key==='production'||active.startsWith('Authored / '))return;
 const open=active==='Production / Cast';
 const closed=a.root.getObjectByName('Spellblade_Hand_L_Closed_Grip'),spell=a.root.getObjectByName('Spellblade_Hand_L_Open_Sorcery_And_Rune');
 if(closed){closed.visible=!open;closed.scale.setScalar(open?0:1);}if(spell){spell.visible=open;spell.scale.setScalar(open?1:0);}
}
function frame(t){const dt=Math.min(.05,(t-last)/1000);last=t;if(playing)phase=(phase+dt/2)%1;slider.value=phase;for(const a of actors){if(a.action){a.action.time=phase*a.action.getClip().duration;a.mixer.update(0);}handVariant(a);const p=new THREE.Vector3(a.root.position.x,0,a.root.position.z).project(camera);a.label.style.left=(p.x*.5+.5)*innerWidth-25+'px';a.label.style.top=(-p.y*.5+.5)*innerHeight+'px';}orbit.update();renderer.render(scene,camera);requestAnimationFrame(frame);}
status.textContent='Select a model or compare all. Production clips are retargeted through actual rest bases. '+JSON.stringify(metrics);requestAnimationFrame(frame);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
