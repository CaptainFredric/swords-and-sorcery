// Pure PBR plate-reflection inputs. Kept separate from Three.js so our
// browser-independent verification can check WebGL-compatible pixel data.
const cap=(v,min,max)=>Math.max(min,Math.min(max,v));

/** Linear-RGB, opaque, unsigned-byte equirectangular sky/ground reflection. */
export function plateSkyBytes(width,height,{sky,horizon,ground}){
 if(!Number.isInteger(width)||width<1||!Number.isInteger(height)||height<1)
  throw Error('Plate environment dimensions must be positive integers');
 const pixels=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++){
  const up=1-(2*(y+.5))/height;
  const colour=up>=0?
    horizon.map((h,k)=>h+(sky[k]-h)*Math.min(1,up/.6)):
    horizon.map((h,k)=>h+(ground[k]-h)*Math.min(1,-up/.25));
  const rgb=colour.map(v=>Math.round(cap(v,0,1)*255));
  for(let x=0;x<width;x++)pixels.set([...rgb,255],(y*width+x)*4);
 }
 return pixels;
}

/** Texture metalness is multiplied by the material factor; stay within PBR. */
export function plateMetalness(original,scale=1.25){
 return cap((Number.isFinite(original)?original:.25)*scale,0,.6);
}
