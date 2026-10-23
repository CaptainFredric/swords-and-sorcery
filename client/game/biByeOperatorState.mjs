const clamp=v=>Math.max(0,Math.min(1,v));
export function biByeOperatorReach(b,now){
 if(b.trackingSince!=null)return clamp((now-b.trackingSince)/.35);
 if(b.coupling==='ENGAGING')return clamp((now-b.couplingStartedAt)/.35);
 if(b.coupling==='COUPLED'||b.coupling==='FIRING')return 1;
 if(b.coupling==='RELEASING')return 1-clamp((now-b.couplingStartedAt-.3)/.3);
 return 0;
}
