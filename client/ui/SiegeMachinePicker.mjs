// A short, interactive draft before every Siege Blades round. The cards are
// actual accessible buttons. Network authority owns the countdown and pick;
// local selection is shown immediately while the snapshot catches up.
export const SIEGE_MACHINE_CARDS = Object.freeze([
  Object.freeze({id:'so-fist-ication',name:'SO-FIST-ICATION',role:'ARMORED RAM',description:'Close the distance. Drive the mechanical fist into enemy machines.'}),
  Object.freeze({id:'bi-bye-llista',name:'BI-BYE-LLISTA',role:'TWIN-BOLT BALLISTA',description:'Mobile firepower, heavy bolts, and a vicious built-in turning attack.'}),
  Object.freeze({id:'fight-and-flight',name:'FIGHT-AND-FLIGHT',role:'FLYING REPEATER',description:'Climb, strafe, and spend flight charge on rapid-fire bolts.'}),
]);

// Compact machine portraits, not load-bearing 3-D assets: the selection must
// remain usable on slow mobile connections before the full GLBs have loaded.
const WHEELS='<g stroke="#cfba89" stroke-width="3" fill="#272d31"><circle cx="64" cy="104" r="13"/><circle cx="165" cy="104" r="13"/></g><g stroke="#907d5b" stroke-width="2"><path d="M64 91v26m-13-13h26m88-13v26m-13-13h26"/></g>';
const ART=Object.freeze({
  'so-fist-ication':`<svg viewBox="0 0 240 132" role="img" aria-label="Armored siege ram with four wheels and an extended steel fist"><g fill="#4d5354" stroke="#b6a478" stroke-width="2.5"><path d="M31 93L50 74h139l18 19-13 12H40z"/><path d="M62 72V52h95l24 20z"/><rect x="83" y="60" width="66" height="13" rx="2" fill="#94744e"/></g><g stroke="#e0d3b7" stroke-width="3"><path d="M143 66h38m-13-7h24m-9 14h11"/></g><path d="M186 53l9-7h18l9 10-2 18-12 10-20-3-9-13z" fill="#a6afb3" stroke="#e0c999" stroke-width="3"/><path d="M190 48V38l8-3 6 8V33l8 0 1 12 9-1 4 12" fill="#b5bdc1" stroke="#e0c999" stroke-width="2.4"/><path d="M75 72h41" stroke="#d35b46" stroke-width="5"/>${WHEELS}</svg>`,
  'bi-bye-llista':`<svg viewBox="0 0 240 132" role="img" aria-label="Wheeled siege ballista with two stacked crossbow launchers"><g fill="#424948" stroke="#b7a67f" stroke-width="2"><path d="M36 97h173l-22 10H44z"/><path d="M63 82h118l17 15H46z"/></g><path d="M120 81V48m-34 28 69-54m-32 57 53-33" stroke="#d6c59a" stroke-width="6"/><g stroke="#c9b586" stroke-width="3" fill="none"><path d="M63 38q42 34 95 0M85 66q40 25 102 1"/><path d="m61 38 107 1m-83 27 102 1" stroke="#e2d1ab"/></g><path d="m104 34 58 4-9-7m-33 33 66 3-11-8" stroke="#aebbc1" stroke-width="4" fill="none"/><path d="M108 78h39v12h-39z" fill="#963d34" stroke="#d4b477" stroke-width="2"/>${WHEELS}</svg>`,
  'fight-and-flight':`<svg viewBox="0 0 240 132" role="img" aria-label="Flying rotor-powered crossbow platform with a compact repeater"><g stroke="#d8cfb0" stroke-width="5" stroke-linecap="round"><path d="M37 43h168M122 24v39"/></g><circle cx="122" cy="43" r="8" fill="#9dabb3" stroke="#d9c79a" stroke-width="3"/><path d="M93 57h59l19 19-9 18H77L67 76z" fill="#576063" stroke="#d5c18e" stroke-width="3"/><path d="M79 75h89" stroke="#9a473d" stroke-width="6"/><path d="M153 66l45-12m-13-12 14 12-8 14m-44 10 49 2" stroke="#c9d5da" stroke-width="3.5" fill="none"/><g stroke="#bea97d" stroke-width="4"><path d="M93 96l-11 15m58-15 13 15M89 112h70"/></g><path d="M65 72 40 80m124-8 29 11" stroke="#d4be8c" stroke-width="4"/></svg>`,
});

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
        <span class="sb-draft-art">${ART[machine.id]}</span>
        <span class="sb-draft-role">${machine.role}</span>
        <strong>${machine.name}</strong>
        <small>${machine.description}</small>
        <span class="sb-draft-key">PRESS ${index+1}</span>
      </button>`).join('')}</div>
      <div class="sb-draft-footer"><span data-sb-draft-status>NO CHOICE · ASSIGN RANDOMLY</span><span>DEPLOYMENT IN <b data-sb-draft-seconds>8</b>S</span></div>
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
