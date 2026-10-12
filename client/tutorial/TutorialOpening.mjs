// Presentation only: a cue can exist before its caption and recorded source are revealed.
export const TUTORIAL_OPENING_MS = 1300;
export const TUTORIAL_OPENING_LIMIT_MS = 2500;
export class TutorialOpening {
  constructor({ hold, reveal, ready = () => true, schedule = (fn,ms) => setTimeout(fn,ms), cancel = timer => clearTimeout(timer) } = {}) {
    this.hold = hold; this.reveal = reveal; this.ready = ready; this.schedule = schedule; this.cancel = cancel;
    this.waiting = false; this.generation = 0; this.audioReady = true;
  }
  begin() {
    this.stop();
    const generation = this.generation;
    this.waiting = true; this.established = false; this.settled = false; this.audioReady = false;
    this.hold();
    this.timer = this.schedule(() => { if(generation!==this.generation)return;this.established=true;if(this.settled)this.finish(this.audioReady); },TUTORIAL_OPENING_MS);
    this.limit = this.schedule(() => { if(generation===this.generation)this.finish(false); },TUTORIAL_OPENING_LIMIT_MS);
    const settle = ready => {
      if(generation!==this.generation || !this.waiting)return;
      this.settled=true;this.audioReady=Boolean(ready);
      if(this.established)this.finish(this.audioReady);
    };
    try {
      const result=this.ready();
      if(result?.then)result.then(settle,()=>settle(false));else settle(result);
    }catch{settle(false);}
  }
  finish(audioReady) {
    if(!this.waiting)return;
    this.cancel(this.timer);this.cancel(this.limit);this.timer=this.limit=null;
    this.waiting=false;this.audioReady=audioReady;this.reveal({audioReady});
  }
  stop() { this.generation++; this.cancel(this.timer);this.cancel(this.limit);this.timer=this.limit=null;this.waiting=false;this.audioReady=true; }
}
