// Reassemble the original Argon files byte-for-byte from Git transport-safe parts.
// GitHub's binary-upload connector cannot accept the complete 7.14 MB asset.
// The reconstructed GLB is what Three.js loads; no generated geometry or dummy clips.
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const SO_FIST_V26=Object.freeze({
  glb:Object.freeze({
    directory:'client/assets/props/so-fist-ication/argon-v26',
    stem:'so-fist-ication-v26.glb',
    parts:10,bytes:7141380,
    sha256:'6800db7a9dd1bfa69bb8b789c5663e2e6a83b63f5406d9dbdd97e113ca2221b4',
    output:'client/assets/props/so-fist-ication/so-fist-ication-v26.glb',
  }),
  source:Object.freeze({
    directory:'assets/source/so-fist-ication/argon-v26',
    stem:'SO_FIST_ICATION.blend',
    parts:6,bytes:4338912,
    sha256:'43d972282d31636fa2680b1c9933af9a26b633aed475a5399498f1dc21023da6',
    output:'assets/source/so-fist-ication/argon-v26/SO_FIST_ICATION.blend',
  }),
});
const sha256=data=>createHash('sha256').update(data).digest('hex');
export function assembleSoFistAsset(kind='glb'){
  const spec=SO_FIST_V26[kind];
  if(!spec)throw new Error('Unknown SO-FIST-ICATION asset: '+kind);
  const output=join(ROOT,spec.output);
  if(existsSync(output)){
    const file=readFileSync(output);
    if(file.length===spec.bytes&&sha256(file)===spec.sha256)return output;
    throw new Error('Refusing to overwrite a different SO-FIST-ICATION asset: '+output);
  }
  const buffers=[];
  for(let i=0;i<spec.parts;i++){
    const part=join(ROOT,spec.directory,spec.stem+'.part'+String(i).padStart(2,'0'));
    buffers.push(readFileSync(part));
  }
  const data=Buffer.concat(buffers);
  if(data.length!==spec.bytes||sha256(data)!==spec.sha256)
    throw new Error('Argon '+kind+' failed size/SHA-256 verification; refusing to stage an altered model');
  mkdirSync(dirname(output),{recursive:true});
  const temp=output+'.staging-'+process.pid;
  writeFileSync(temp,data);
  renameSync(temp,output);
  return output;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const kind=process.argv.includes('--source')?'source':'glb';
  console.log('Verified original Argon SO-FIST-ICATION '+kind+': '+assembleSoFistAsset(kind));
}
