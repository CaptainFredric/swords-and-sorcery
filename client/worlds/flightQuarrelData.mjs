// Framework-independent source geometry and texels for the v2.7 quarrel.
// This layer runs in deterministic Node tests without needing browser Three.js.
export const QUARREL_LENGTH=.83;
export function boltWoodPixels(){
 const width=16,height=64,pixels=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const grain=Math.sin(x*2.4+Math.sin(y*.13)*1.5)*9+
     Math.sin(y*.74+x*.48)*4+Math.sin(y*.09+x*4.7)*3;
   const nick=(x*13+y*23)%113===0?-23:0;
   const v=Math.max(-23,Math.min(20,Math.round(grain+nick)));
   const i=(y*width+x)*4;
   pixels[i]=Math.max(0,145+v);
   pixels[i+1]=Math.max(0,105+v);
   pixels[i+2]=Math.max(0,67+Math.round(v*.76));
   pixels[i+3]=255;
 }
 return {width,height,pixels};
}
export function featherMeshData(){
 const positions=[],colors=[],indices=[];
 const sections=[
   {z:-.374,r:.024,c:[.60,.55,.47]},
   {z:-.329,r:.072,c:[.75,.69,.57]},
   {z:-.277,r:.078,c:[.58,.52,.44]},
   {z:-.214,r:.039,c:[.80,.72,.59]}
 ];
 for(let blade=0;blade<3;blade++){
   const a=blade*2*Math.PI/3,u=Math.cos(a),v=Math.sin(a);
   const base=positions.length/3;
   for(let j=0;j<sections.length;j++){
     const sec=sections[j];
     for(const side of [-1,1]){
       positions.push(u*sec.r-v*side*.004,v*sec.r+u*side*.004,sec.z);
       const shift=(blade*3+j*7+side+20)%5===0?-.09:0;
       colors.push(Math.max(0,sec.c[0]+shift),Math.max(0,sec.c[1]+shift),Math.max(0,sec.c[2]+shift));
     }
   }
   for(let j=0;j<sections.length-1;j++){
     const k=base+j*2;
     indices.push(k,k+1,k+2,k+1,k+3,k+2);
   }
 }
 return {positions,colors,indices,vanes:3};
}
