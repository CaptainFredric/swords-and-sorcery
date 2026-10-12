import { KIT_PALETTE as P, shadeColor } from './facetKit.mjs';

// Reusable farm pieces write into the world's existing material batches. No per-prop draw calls.
export function farmPiece(batch, random, item) {
  const [x,cy,z]=item.center,[sx,sy,sz]=item.size,y=cy-sy/2;
  const block=(material,dx,dy,dz,w,h,d,color,rotY=0)=>batch[material].block({cx:x+dx,cy:y+dy,cz:z+dz,sx:w,sy:h,sz:d,color,rotY,rand:random,chamfer:0,jitter:0});
  if(item.kind==='shed') {
    block('stone',0,0,0,sx,.45,sz,P.stoneDark);
    block('stone',0,.45,0,sx,sy-.45,sz,P.plaster);
    for(const dx of [-sx/2+.1,0,sx/2-.1])block('wood',dx,.45,sz/2+.02,.18,sy-.45,.09,P.timberDark);
    for(const h of [.45,sy-.2])block('wood',0,h,sz/2+.02,sx,.15,.1,P.timberDark);
    block('wood',-sx*.2,.45,sz/2+.08,1.2,1.9,.03,P.timber);
    block('wood',sx*.22,1.5,sz/2+.08,.8,.65,.03,0x303a2c);
    batch.foliage.roof({cx:x,cy:y+sy,cz:z,sx,sz,height:Math.min(sx,sz)*.38,overhang:.3,ridge:sx*.3,color:P.thatch,rand:random});
    return;
  }
  if(item.kind==='ruin') {
    const alongX=sx>sz,length=alongX?sx:sz,n=Math.ceil(length/1.5),rows=Math.ceil(sy/.5);
    for(let a=0;a<n;a++)for(let b=0;b<rows;b++) {
      const t=-length/2+(a+.5)*length/n,h=sy/rows;
      block('stone',alongX?t:0,b*h,alongX?0:t,alongX?length/n-.025:sx,h-.02,alongX?sz:length/n-.025,shadeColor(P.stone,.82+random()*.24));
    }return;
  }
  if(item.kind==='cart') {
    block('wood',0,.35,0,sx,sy-.35,sz,P.timberDark);
    block('wood',0,sy-.15,0,sx-.24,.16,sz-.2,P.timber);
    for(const side of [-1,1])for(const end of [-1,1]) {
      // Hexagonal wheels sit within the same substantial collision footprint.
      const wx=x+side*(sx/2-.22),wy=y+.43,wz=z+end*sz*.3;
      for(let a=0;a<6;a++) {
        const t=a*Math.PI/3,u=(a+1)*Math.PI/3;
        const at=(dx,angle)=>[wx+dx,wy+Math.sin(angle)*.42,wz+Math.cos(angle)*.42];
        batch.wood.quad(at(-.1,t),at(.1,t),at(.1,u),at(-.1,u),P.timberDark);
        batch.wood.tri([wx+side*.1,wy,wz],at(side*.1,t),at(side*.1,u),P.timber);
      }
      block('metal',side*(sx/2-.1),.37,end*sz*.3,.08,.12,.12,P.brassDark);
    }
    for(const side of [-1,1])block('wood',side*sx*.38,sy,0,.13,.4,sz,P.timber);
    block('foliage',0,sy+.05,0,sx*.7,.3,sz*.7,P.thatch);return;
  }
  if(item.kind==='hay') {
    block('foliage',0,0,0,sx,sy,sz,P.thatch);
    for(const side of [-1,1])block('wood',side*sx*.25,0,0,.055,sy+.025,sz+.03,0x7d7145);
    return;
  }
  if(item.kind==='trough') {
    block('stone',0,0,0,sx,sy*.65,sz,P.stoneDark);
    block('stone',0,sy*.65,0,sx,sy*.35,sz,P.stone);
    block('wood',0,sy+.008,0,sx*.65,.01,sz*.8,0x394b48);return;
  }
  if(item.kind==='fence') {
    const alongX=sx>sz,length=alongX?sx:sz,n=Math.ceil(length/2.5);
    for(let i=0;i<=n;i++){const t=-length/2+i*length/n;block('wood',alongX?t:0,0,alongX?0:t,.15,sy,.15,P.timberDark);}
    for(const h of [.4,.95])block('wood',0,h,0,alongX?sx:.12,.1,alongX?.12:sz,P.timber);return;
  }
  if(item.kind==='timber') {
    for(let i=0;i<3;i++)block('wood',0,i*.16,(i-1)*sz*.3,sx,.25,sz*.32,P.timberDark);
    return;
  }
  if(item.kind==='stump') {
    batch.wood.prism({cx:x,cy:y,cz:z,radiusBottom:sx*.55,radiusTop:sx*.4,height:sy,sides:5,color:P.timber,rand:random});return;
  }
  if(item.kind==='stones')for(let i=0;i<3;i++)batch.stone.lump({cx:x+(i-1)*sx*.3,cy:y+sy*.5,cz:z+(random()-.5)*sz,rx:sx*.22,ry:sy*.5,rz:sz*.3,color:P.stoneDark,rand:random});
}
