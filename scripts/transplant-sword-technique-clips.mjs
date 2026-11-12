#!/usr/bin/env node
// Animation-only transfer. Preserve the production Spellblade GLBs' geometry,
// skins, textures, original animations and bind pose; add only Technique clips.
// Usage: node scripts/transplant-sword-technique-clips.mjs <extracted Argon package directory> [production asset directory] [--apply]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const MAGIC=0x46546c67, JSON_TYPE=0x4e4f534a, BIN_TYPE=0x004e4942;
const align=n=>(n+3)&~3;
const sha=b=>createHash('sha256').update(b).digest('hex');
function glb(file){
  const raw=readFileSync(file);
  if(raw.readUInt32LE(0)!==MAGIC||raw.readUInt32LE(4)!==2||
    raw.readUInt32LE(8)!==raw.length)throw Error('Invalid GLB: '+file);
  let doc=null,bin=null,at=12;
  while(at<raw.length){
    const n=raw.readUInt32LE(at),type=raw.readUInt32LE(at+4);
    const data=raw.subarray(at+8,at+8+n);
    if(type===JSON_TYPE)doc=JSON.parse(data.toString('utf8').trim());
    if(type===BIN_TYPE)bin=data;
    at+=8+n;
  }
  if(!doc||!bin||doc.buffers?.length!==1||doc.buffers[0].uri)
    throw Error('Expected one embedded BIN chunk in '+file);
  return {doc,bin,raw};
}
function chunk(type,data,pad){
  const out=Buffer.alloc(8+align(data.length),pad);
  out.writeUInt32LE(align(data.length),0);
  out.writeUInt32LE(type,4);
  data.copy(out,8);
  return out;
}
function encode(doc,bin){
  const j=chunk(JSON_TYPE,Buffer.from(JSON.stringify(doc)),0x20);
  const b=chunk(BIN_TYPE,bin,0);
  const header=Buffer.alloc(12);
  header.writeUInt32LE(MAGIC,0);header.writeUInt32LE(2,4);
  header.writeUInt32LE(12+j.length+b.length,8);
  return Buffer.concat([header,j,b]);
}
function namedNodes(doc,kind){
  const map=new Map();
  (doc.nodes??[]).forEach((n,i)=>{
    if(!n.name)return;
    if(map.has(n.name))map.set(n.name,null);
    else map.set(n.name,i);
  });
  if(!map.size)throw Error('Unnamed '+kind+' skeleton');
  return map;
}
function transplant(baseFile,donorFile,prefix,expected){
  const base=glb(baseFile),donor=glb(donorFile);
  if(sha(donor.raw)!==expected)throw Error('Unexpected source GLB: '+donorFile);
  const target=structuredClone(base.doc),source=donor.doc;
  const to=namedNodes(target,'production'),from=namedNodes(source,'donor');
  const existing=new Set((target.animations??[]).map(a=>a.name));
  const added=(source.animations??[]).filter(a=>a.name?.startsWith(prefix));
  if(added.length!==12)throw Error('Expected 12 '+prefix+' clips, received '+added.length);
  if(added.some(a=>existing.has(a.name)))throw Error('Already installed: '+baseFile);
  const views=new Map(),accessors=new Map(),blobs=[];
  const initial=align(target.buffers[0].byteLength);
  let length=0;
  const copyView=id=>{
    if(views.has(id))return views.get(id);
    const v=source.bufferViews[id];
    if(v.buffer!==0)throw Error('Non-GLB donor buffer');
    const buf=donor.bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);
    const index=(target.bufferViews??=[]).push({
      ...structuredClone(v),buffer:0,byteOffset:initial+length
    })-1;
    blobs.push(buf,Buffer.alloc(align(buf.length)-buf.length));
    length+=align(buf.length);
    views.set(id,index);
    return index;
  };
  const copyAccessor=id=>{
    if(accessors.has(id))return accessors.get(id);
    const a=structuredClone(source.accessors[id]);
    if(a.sparse||a.bufferView===undefined)throw Error('Unsupported animation accessor');
    a.bufferView=copyView(a.bufferView);
    const next=target.accessors.push(a)-1;
    accessors.set(id,next);
    return next;
  };
  for(const a of added){
    const samplers=a.samplers.map(s=>({
      ...structuredClone(s),input:copyAccessor(s.input),output:copyAccessor(s.output)
    }));
    const channels=a.channels.map(c=>{
      const name=source.nodes[c.target.node]?.name;
      if(from.get(name)===null||!Number.isInteger(to.get(name)))
        throw Error('Cannot safely bind bone '+name+' for '+a.name);
      return {...structuredClone(c),target:{...c.target,node:to.get(name)}};
    });
    (target.animations??=[]).push({...structuredClone(a),samplers,channels});
  }
  const original=target.buffers[0].byteLength;
  const bin=Buffer.concat([base.bin.subarray(0,original),
    Buffer.alloc(initial-original),...blobs]);
  target.buffers[0].byteLength=bin.length;
  const merged=encode(target,bin);
  return {data:merged,before:sha(base.raw),after:sha(merged),
    bytes:merged.length,clips:target.animations.map(a=>a.name),
    added:added.map(a=>a.name)};
}
const sourcePath=process.argv[2],targetPath=resolve(process.argv[3]||
  'client/assets/characters/spellblade');
if(!sourcePath)throw Error('Supply the extracted Argon package directory');
const apply=process.argv.includes('--apply');
const inputs=[
  {key:'thirdPerson',file:'spellblade.glb',prefix:'Technique_',
    sha:'9dae42a815f4108afab4fdab95673293422283b677ea97f06ac0375ba50516a1'},
  {key:'firstPerson',file:'spellblade-fp.glb',prefix:'FP_Technique_',
    sha:'1b12af5551b449ff25c8b6f75c4d1a661f6edd271a18a97e31c5eb4d743be904'},
];
const result=inputs.map(i=>({...i,...transplant(join(targetPath,i.file),
  join(resolve(sourcePath),i.file),i.prefix,i.sha)}));
const manifestFile=join(targetPath,'manifest.json');
const manifest=JSON.parse(readFileSync(manifestFile,'utf8'));
const revision=result[0].after.slice(0,40);
for(const r of result){
  const m=manifest[r.key];
  if(m.sha256!==r.before)throw Error('Manifest baseline mismatch; aborting: '+r.file);
  m.sha256=r.after;m.bytes=r.bytes;m.clips=r.clips;
  m.url=m.url.replace(/\?v=[^&]+/,'?v='+revision);
  m.gzipUrl=m.gzipUrl.replace(/\?v=[^&]+/,'?v='+revision);
}
manifest.sourceRevision=revision;
if(apply){
  for(const r of result){
    writeFileSync(join(targetPath,r.file),r.data);
    writeFileSync(join(targetPath,r.file+'.gz'),gzipSync(r.data,{level:9}));
  }
  writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
}
console.log(JSON.stringify({applied:apply,revision,
  models:result.map(r=>({file:r.file,sha256:r.after,bytes:r.bytes,added:r.added}))
},null,2));
