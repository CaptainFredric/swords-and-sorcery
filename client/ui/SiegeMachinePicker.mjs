// A short, interactive draft before every Siege Blades round. The cards are
// actual accessible buttons. Network authority owns the countdown and pick;
// local selection is shown immediately while the snapshot catches up.
export const SIEGE_MACHINE_CARDS = Object.freeze([
  Object.freeze({id:'so-fist-ication',name:'SO-FIST-ICATION',role:'ARMORED RAM',description:'Charge into enemies and batter them with a steel fist.'}),
  Object.freeze({id:'bi-bye-llista',name:'BI-BYE-LLISTA',role:'TWIN-BOLT BALLISTA',description:'Slow foes with frost; finish them with heavy bolts.'}),
  Object.freeze({id:'fight-and-flight',name:'FIGHT-AND-FLIGHT',role:'FLYING REPEATER',description:'Take to the skies, strafe with bolts and strike with rotors.'}),
]);

// Actual game/model captures, cropped to small raster portraits and packaged
// as standalone SVG image containers. No WebGL context or GLB fetch is needed
// in the timed picker. appUrl also works in the static GitHub Pages export.
import {appUrl} from '../appUrl.mjs';
export const SIEGE_MACHINE_PORTRAITS = Object.freeze({
  'so-fist-ication':'/client/assets/props/siege-portraits/so-fist-ication.svg',
  'bi-bye-llista':'/client/assets/props/siege-portraits/bi-bye-llista.svg',
  'fight-and-flight':'/client/assets/props/siege-portraits/fight-and-flight.svg',
});
let portraitsPreloaded=false;
export function preloadSiegePortraits(){
  if(portraitsPreloaded||typeof Image==='undefined')return;
  portraitsPreloaded=true;
  for(const path of Object.values(SIEGE_MACHINE_PORTRAITS)){
    const image=new Image();image.src=appUrl(path);
  }
}
export function siegePickerSeconds(selectionEndsAt,serverNow){
  return Number.isFinite(selectionEndsAt) ? Math.max(0,Math.ceil(selectionEndsAt-serverNow)) : 0;
}
export function siegePickerMarkup(){
  return `<div class="sb-draft-backdrop" aria-hidden="true"></div>
    <div class="sb-draft-content">
      <p class="sb-draft-eyebrow">SIEGE BLADES · ROUND <span data-sb-draft-round>1</span></p>
      <h2>CHOOSE YOUR SIEGE MACHINE</h2>
      <p class="sb-draft-instruction">You can change your choice until the timer ends.</p>
      <div class="sb-draft-choices">${SIEGE_MACHINE_CARDS.map((machine,index)=>`<button type="button" class="sb-draft-card" data-siege-pick="${machine.id}" aria-pressed="false">
        <span class="sb-draft-art" role="img" aria-label="${machine.name} actual machine portrait"><img src="${appUrl(SIEGE_MACHINE_PORTRAITS[machine.id])}" alt="" decoding="async" draggable="false"></span>
        <span class="sb-draft-role">${machine.role}</span>
        <strong>${machine.name}</strong>
        <small>${machine.description}</small>
        <span class="sb-draft-key">PRESS ${index+1}</span>
      </button>`).join('')}</div>
      <div class="sb-draft-footer"><span data-sb-draft-status>NO CHOICE · ASSIGN RANDOMLY</span><span>DEPLOYMENT IN <b data-sb-draft-seconds>6</b>S</span></div>
    </div>`;
}

export class SiegeMachinePicker {
  constructor(root,onPick=()=>{}){
    this.onPick=onPick;
    this.element=document.createElement('section');
    this.element.className='sb-machine-picker';
    this.element.hidden=true;
    this.element.setAttribute('role','dialog');
    this.element.setAttribute('aria-modal','true');
    this.element.setAttribute('aria-label','Choose your siege machine');
    this.element.tabIndex=-1;
    this.element.innerHTML=siegePickerMarkup();
    const choose=machine=>{
      if(!this.active)return;
      this.localChoice=machine;
      this.updateSelection(machine);
      this.onPick(machine);
    };
    this.element.addEventListener?.('click',event=>{
      const button=event.target.closest?.('[data-siege-pick]');
      if(button)choose(button.dataset.siegePick);
    });
    this.element.addEventListener?.('keydown',event=>{
      const index=Number(event.key)-1;
      if(event.repeat||!this.active||!Number.isInteger(index)||index<0||index>=SIEGE_MACHINE_CARDS.length)return;
      event.preventDefault();
      choose(SIEGE_MACHINE_CARDS[index].id);
    });
    root.append(this.element);
    this.round=null;
    this.localChoice=null;
    this.active=false;
  }
  hide(){this.active=false;this.element.hidden=true;}
  updateSelection(choice){
    for(const card of this.element.querySelectorAll('[data-siege-pick]')){
      const selected=card.dataset.siegePick===choice;
      card.classList.toggle('selected',selected);
      card.setAttribute('aria-pressed',String(selected));
    }
    this.element.querySelector('[data-sb-draft-status]').textContent=choice
      ? 'SELECTED · '+(SIEGE_MACHINE_CARDS.find(c=>c.id===choice)?.name??'MACHINE')
      : 'NO CHOICE · ASSIGN RANDOMLY';
  }
  update(snapshot,playerId,serverNow){
    const state=snapshot?.mode==='SIEGE_BLADES'&&snapshot.roomState==='PLAYING'?snapshot.siegeBlades:null;
    if(!state||!Number.isFinite(state.selectionEndsAt)){this.hide();return false;}
    if(this.round!==state.roundNumber){
      this.round=state.roundNumber;
      this.localChoice=null;
      this.element.querySelector('[data-sb-draft-round]').textContent=String(this.round);
    }
    const newlyOpened=!this.active;
    this.active=true;this.element.hidden=false;
    const confirmed=state.selectionChoices?.[playerId]??null;
    if(confirmed===this.localChoice||!this.localChoice)this.localChoice=confirmed;
    this.updateSelection(this.localChoice);
    this.element.querySelector('[data-sb-draft-seconds]').textContent=String(siegePickerSeconds(state.selectionEndsAt,serverNow));
    if(newlyOpened)this.element.focus?.({preventScroll:true});
    return true;
  }
}
