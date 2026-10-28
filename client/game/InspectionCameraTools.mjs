export class InspectionCameraTools {
  constructor(parent, actions) {
    this.root=document.createElement('div');this.root.className='inspection-camera-ui hidden';
    this.root.innerHTML=`<details class="inspection-camera-tools"><summary>INSPECTION CAMERA <span data-camera-state></span></summary><div class="inspection-camera-buttons"><button data-camera="actor" aria-pressed="true">YOU</button><button data-camera="dummy" aria-pressed="false">INHABIT DUMMY</button><button data-camera="fly" aria-pressed="false">FLY</button><button data-camera="split" aria-pressed="false">SPLIT VIEW</button><button data-camera="reset">RESET CAMERA</button><button data-camera="freeze">FREEZE</button><button data-camera="step">STEP 1 TICK</button></div><p data-camera-help></p><small>One local scene. Split view draws twice. Dummy control disables challenge rewards for this run.</small></details><div class="inspection-view-labels"></div>`;
    parent.append(this.root);
    this.actions=actions;
    this.click=event=>{const node=event.target.closest('[data-camera]');if(!node)return;event.stopPropagation();actions[node.dataset.camera]?.();if(document.body.classList.contains('touch-ui')&&['actor','dummy','body','fly','freeze'].includes(node.dataset.camera))this.root.querySelector('details').open=false;};
    this.root.addEventListener('click',this.click);
    // Toolbar gestures must never seed movement/look or a touch capture behind the panel.
    this.stop=event=>event.stopPropagation();
    this.stopEvents=['pointerdown','pointerup','mousedown','mouseup','keydown','keyup'];
    for(const type of this.stopEvents)this.root.addEventListener(type,this.stop);
    this.labels=this.root.querySelector('.inspection-view-labels');
  }
  update({available,focus,split,dummy,controlledDummy,frozen,views,controls}) {
    this.root.classList.toggle('hidden',!available);if(!available)return;
    const signature=JSON.stringify([focus,split,Boolean(dummy),controlledDummy,frozen,views,controls]);
    if(signature===this.signature)return;this.signature=signature;
    const button=id=>this.root.querySelector(`[data-camera="${id}"]`);
    button('actor').setAttribute('aria-pressed',String(focus==='actor'&&!controlledDummy));
    button('dummy').disabled=!dummy;button('dummy').setAttribute('aria-pressed',String(focus==='actor'&&controlledDummy));
    button('fly').setAttribute('aria-pressed',String(focus==='fly'));
    button('split').setAttribute('aria-pressed',String(split));
    button('freeze').textContent=frozen?'RESUME':'FREEZE';button('step').disabled=!frozen;
    this.root.querySelector('[data-camera-state]').textContent=`${focus==='fly'?'FLY':controlledDummy?'DUMMY':'YOU'}${frozen?' · FROZEN':''}`;
    this.root.querySelector('[data-camera-help]').textContent=focus==='fly'?controls:'Choose You or Inhabit Dummy for ordinary controls. Fly moves the camera alone, even while frozen.';
    this.labels.replaceChildren();
    if(split)for(const view of views){
      const node=document.createElement('button');node.dataset.camera=view.kind;
      node.className='inspection-view-label';node.textContent=view.kind==='fly'?'FLY CAMERA':controlledDummy?'DUMMY':'YOU';
      node.setAttribute('aria-label',`Control ${node.textContent.toLowerCase()}`);node.setAttribute('aria-pressed',String(view.controlled));
      const touch=document.body.classList.contains('touch-ui');
      Object.assign(node.style,{left:`${view.x+(touch?view.width-88:8)}px`,top:`${view.y+(touch?64:8)}px`});
      // Actor pane retains the currently selected body.
      if(view.kind==='actor')node.dataset.camera='body';
      const outline=document.createElement('div');outline.className='inspection-pane';
      Object.assign(outline.style,{left:`${view.x}px`,top:`${view.y}px`,width:`${view.width}px`,height:`${view.height}px`});
      this.labels.append(outline,node);
    }
  }
  dispose(){this.root.removeEventListener('click',this.click);for(const type of this.stopEvents)this.root.removeEventListener(type,this.stop);this.root.remove();}
}
