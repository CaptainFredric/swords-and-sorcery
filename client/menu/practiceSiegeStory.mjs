import { siegeArmoryView } from './siegeArmoryView.mjs';

// Practice does not have its own competing version of the three machines'
// stories. It borrows the authors' actual Armory lore and one-line subtitles.
const ids=Object.freeze({
 'bi-bye-llista':'biBye',
 'so-fist-ication':'soFist',
 'fight-and-flight':'fightFlight',
});
const armory=Object.freeze(Object.fromEntries(siegeArmoryView().map(m=>[m.id,m])));
const classification=Object.freeze({
 'bi-bye-llista':'TWIN-BOLT SIEGE ARTILLERY',
 'so-fist-ication':'MECHANICAL BATTERING RAM',
 'fight-and-flight':'AERIAL SIEGE APPARATUS',
});

export function practiceSiegeCopy(machine){
 const entry=armory[ids[machine]];
 return entry?{machine,id:entry.id,name:entry.name,subtitle:entry.subtitle,
   classification:classification[machine],facts:entry.facts,preview:entry.preview,
   line:entry.line}:null;
}

// Armory copy uses paragraph breaks and occasional *emphasis*. Produce text
// tokens, never HTML, so Practice can render the original punctuation safely.
export function practiceSiegeParagraphs(line){
 return String(line??'').trim().split(/\n\s*\n/g).filter(Boolean).map(paragraph=>{
  const tokens=[];
  const pattern=/\*([^*\n]+)\*/g;
  let from=0,match;
  while((match=pattern.exec(paragraph))){
   if(match.index>from)tokens.push({text:paragraph.slice(from,match.index),em:false});
   tokens.push({text:match[1],em:true});
   from=pattern.lastIndex;
  }
  if(from<paragraph.length)tokens.push({text:paragraph.slice(from),em:false});
  return tokens;
 });
}
