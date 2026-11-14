#!/usr/bin/env node
// Stage only the exact user-supplied original Argon donor binaries.
import {readFileSync,copyFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const sha={glb:'9d1a8e7920b445c29546336d1bf00190b6837549941bd84c75858f64662619e6',archive:'cdb304075c515d0313fdcd65673e8927d07232894c97fe2a11e8666501957d60'};
const targetGlb='client/assets/props/bibye-ballista/Bi_Bye_llista_GameReady_PBR.glb';
const targetArchive='assets/source/bibye-ballista/Bi_Bye_llista_blend_archive.zip';
const [glb,archive]=process.argv.slice(2);
if(!glb||!archive)throw new Error('Usage: node scripts/stage-bibye-argon-v26.mjs ORIGINAL.glb SOURCE.zip');
function checked(path,expected){
 const binary=readFileSync(resolve(path));
 const actual=createHash('sha256').update(binary).digest('hex');
 if(actual!==expected)throw new Error('Original Argon SHA-256 mismatch for '+path+': '+actual);
 return binary;
}
const bytes=checked(glb,sha.glb),source=checked(archive,sha.archive);
if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new Error('Invalid GLB 2.0');
const j=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
const clips=new Set((j.animations??[]).map(x=>x.name)),nodes=new Set((j.nodes??[]).map(x=>x.name));
if(clips.size!==26)throw new Error('The complete 26-clip GLB is required');
for(const name of ['22_BiBye_A_Sharp_Turn','23_BiBye_Look_Around_Spin_Loop','24_BiBye_Look_Around_Reversed_Fire_Settle','25_BiBye_Ram_Impact_Force_Mobile','26_BiBye_Melee_Lowered_Stance'])
 if(!clips.has(name))throw new Error('Missing clip '+name);
for(const name of ['Traverse_Mount','Elevation_Cradle','Main_Limb_L','Main_Limb_R','socket_frame_blade_L','socket_frame_blade_R','frame_sweep_volume_L','frame_sweep_volume_R'])
 if(!nodes.has(name))throw new Error('Missing original locator '+name);
for(const [dst,src] of [[targetGlb,glb],[targetArchive,archive]]){
 mkdirSync(dirname(dst),{recursive:true});copyFileSync(resolve(src),dst);
}
console.log('Staged exact original Argon v26: '+clips.size+' clips, '+nodes.size+' nodes. Review binary diff before committing.');
