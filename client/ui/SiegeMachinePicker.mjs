// A short, interactive draft before every Siege Blades round. The cards are
// actual accessible buttons. Network authority owns the countdown and pick;
// local selection is shown immediately while the snapshot catches up.
export const SIEGE_MACHINE_CARDS = Object.freeze([
  Object.freeze({id:'so-fist-ication',name:'SO-FIST-ICATION',role:'Armored Ram',description:'Charge · Crush · Recoil'}),
  Object.freeze({id:'bi-bye-llista',name:'BI-BYE-LLISTA',role:'Twin-Bolt Ballista',description:'Aim · Deploy · Fire'}),
  Object.freeze({id:'fight-and-flight',name:'FIGHT-AND-FLIGHT',role:'Flying Repeater',description:'Fly · Strafe · Volley'}),
]);

// Each card's picture is a still of the machine's real model, rendered by the game's own renderer
// (scripts/render-siege-machine-cards.mjs): a small WebP, so the draft never waits on the machines' GLBs.
export const siegeMachinePicture = (id) => `/client/assets/ui/siege-machines/${id}.webp`;

export function siegePickerSeconds(selectionEndsAt,serverNow){
  return Number.isFinite(selectionEndsAt) ? Math.max(0,Math.ceil(selectionEndsAt-serverNow)) : 0;
}
export function siegePickerStatus(choice){
  const machine=SIEGE_MACHINE_CARDS.find(c=>c.id===choice);
  return machine?`Your machine · ${machine.name}`:'No machine chosen · one will be assigned';
}
export function siegePickerMarkup(){
  return `<div class="sb-draft-backdrop" aria-hidden="true"></div>
    <div class="sb-draft-content">
      <header class="sb-draft-head">
        <div class="sb-draft-title">
          <p class="sb-draft-eyebrow">SIEGE BLADES · ROUND <span data-sb-draft-round>1</span></p>
          <h2>Choose your machine</h2>
          <p class="sb-draft-status" data-sb-draft-status aria-live="polite">${siegePickerStatus(null)}</p>
        </div>
        <div class="sb-draft-clock" role="timer" aria-label="Deploying in"><b data-sb-draft-seconds>8</b><small>DEPLOY</small></div>
      </header>
      <div class="sb-draft-choices" role="radiogroup" aria-label="Siege machine">${SIEGE_MACHINE_CARDS.map((machine,index)=>`<button type="button" class="sb-draft-card" role="radio" data-siege-pick="${machine.id}" aria-checked="false" tabindex="${index===0?0:-1}">
        <span class="sb-draft-art"><img src="${siegeMachinePicture(machine.id)}" alt="${machine.name}, ${machine.role.toLowerCase()}" decoding="async" draggable="false"></span>
        <span class="sb-draft-text">
          <strong>${machine.name}</strong>
          <span class="sb-draft-role">${machine.role}</span>
          <small>${machine.description}</small>
        </span>
        <kbd class="sb-draft-key" aria-hidden="true">${index+1}</kbd>
      </button>`).join('')}</div>
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
      if(event.repeat||!this.active)return;
      const count=SIEGE_MACHINE_CARDS.length,current=SIEGE_MACHINE_CARDS.findIndex(c=>c.id===this.localChoice);
      let index=Number(event.key)-1;
      // (the arrow keys step along the three, as in any radio group; 1, 2 and 3 pick directly)
      if(event.key==='ArrowRight'||event.key==='ArrowDown')index=(current+1+count)%count;
      if(event.key==='ArrowLeft'||event.key==='ArrowUp')index=current<0?count-1:(current-1+count)%count;
      if(!Number.isInteger(index)||index<0||index>=count)return;
      event.preventDefault();
      choose(SIEGE_MACHINE_CARDS[index].id);
      this.element.querySelector(`[data-siege-pick="${SIEGE_MACHINE_CARDS[index].id}"]`)?.focus?.({preventScroll:true});
    });
    root.append(this.element);
    this.round=null;
    this.localChoice=null;
    this.active=false;
  }
  hide(){this.active=false;this.element.hidden=true;}
  updateSelection(choice){
    const cards=[...this.element.querySelectorAll('[data-siege-pick]')];
    for(const [index,card] of cards.entries()){
      const selected=card.dataset.siegePick===choice;
      card.classList.toggle('selected',selected);
      card.setAttribute('aria-checked',String(selected));
      card.tabIndex=selected||(!choice&&index===0)?0:-1;
    }
    this.element.querySelector('[data-sb-draft-status]').textContent=siegePickerStatus(choice);
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
    const seconds=siegePickerSeconds(state.selectionEndsAt,serverNow);
    this.element.querySelector('[data-sb-draft-seconds]').textContent=String(seconds);
    this.element.classList.toggle('sb-draft-closing',seconds<=3);
    if(newlyOpened)this.element.focus?.({preventScroll:true});
    return true;
  }
}
