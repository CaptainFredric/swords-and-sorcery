export function siegeSkillLabel(b,now){
 const s=b?.skill;if(!s)return '';
 const name=s.id==='beatToThePunch'?'Beat to the Punch':'Bolt to the Occasion';
 return `${name}: ${s.phase==='primed'?'PRIMED '+Math.max(0,s.expiresAt-now).toFixed(1)+'s':s.phase==='releasing'?'RELEASING':now<s.readyAt?Math.ceil(s.readyAt-now)+'s':'READY'}`;
}
