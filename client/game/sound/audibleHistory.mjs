export const AUDIBLE_VARIETY=Object.freeze({seconds:30,meters:18,repeatScale:.08});
export class AudibleHistory {
 constructor(){this.entries=[];}
 note(line,speaker,at,position){this.entries=this.entries.filter(e=>at-e.at<AUDIBLE_VARIETY.seconds);const entry={line,speaker,at,position:position?{...position}:null};this.entries.push(entry);return entry;}
 cancel(entry,now){if(entry&&now<entry.at)this.entries=this.entries.filter(e=>e!==entry);}
 scale(line,speaker,at,position){return this.entries.some(e=>e.line===line&&e.speaker!==speaker&&at>=e.at&&at-e.at<AUDIBLE_VARIETY.seconds&&e.position&&position&&Math.hypot(e.position.x-position.x,e.position.z-position.z)<=AUDIBLE_VARIETY.meters)?AUDIBLE_VARIETY.repeatScale:1;}
}
