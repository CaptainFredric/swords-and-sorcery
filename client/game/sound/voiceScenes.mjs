// The Spellblade's longer scenes: lines that take more than one moment to happen, each part said only when the game
// has earned it. Nothing here waits on a line and nothing in the game waits on any of it: these are a little memory
// and some clocks, fed with what happens (the host's events and the knights as last seen), that say a part when its
// time has come and let the whole thing drop the moment it has stopped making sense.
//
//   The final duel. Rarely, as a fresh encounter opens (voiceMoments: `worthyFoe`), a knight declares that he has
//   sought a worthy challenger all his life. His foe then says one ordinary remark of their own (an existing line
//   marked `reply`: never one written for the joke, a death line, a cry or another setup; if they have nothing fit to
//   say, or cannot be heard, the scene ends there). He answers: "...The quest continues." The fight goes on, and for a
//   few seconds a verdict is open on that same foe: if he then fells them quickly and at little cost, he complains to
//   the herald. If he is felled, or hurt much, or it takes too long, there is no complaint. The game decides the joke.
//
//   The Sunder sentence. Rarely (one roll for each Sunder), from that Sunder's first slam into the ground, he says a
//   sentence a word to a slam: every Sundering swing after it is the next word, hit or miss. If he stops swinging for
//   longer than the chain's own pace allows, the sentence is dropped for the rest of that Sunder. A foe felled once it
//   is nearly said gets "Thank. You." in place of whatever was left of it.
//
//   The trick. Rarely, the moment a blow he survives leaves him low, he says "Wait, wait!!...". If he then gets away
//   with it (his health seen to come back, well out of danger), he laughs and says he tricked them: the panic was the
//   plan all along. Felled first, there is no trick, and he is likelier to protest that he is a knight (deathMoment
//   `planFailed`). Once weighed, it is not weighed again until he has been well clear of low (his health hovering at the
//   edge never stammers it out twice).
//
// say(line, speaker, options) is the voice's (VoiceBank through the runtime): false, or { seconds, delay } when it was
// said. `earned` marks a part that has earned its turn (no odds, no cooldown; it still gives way to a line of state).
// Times are the host's (seconds). Pure but for its memory and `say`, so it is tested.

import { HEALTH_REGEN } from '../../../shared/src/combat.mjs';
import { REPLY_LINES, VOICE_LINE_LIST, voiceLine } from './voiceLines.mjs';

// the line that waits for a scene's moment (the declarations say which: voiceLines.mjs)
const lineFor = (tag) => VOICE_LINE_LIST.find((line) => !line.coming && line.triggers[tag] > 0)?.id ?? null;
const LINES = Object.freeze({
  duel: lineFor('worthyFoe'),               // its second part is the answer ("...The quest continues.")
  herald: lineFor('challengerBrief'),
  sentence: lineFor('sunderSentence'),
  thanks: lineFor('sunderSentenceKill'),
  trick: lineFor('regenWait'),
});

export const SCENES = Object.freeze({
  finalDuel: Object.freeze({
    replyAfter: 0.4,       // after the declaration ends, before the foe's remark
    questAfter: 0.35,      // after the remark ends, before "...The quest continues."
    verdictSec: 8,         // the foe must fall within this long of that...
    verdictHurt: 22,       // ...and he must have taken no more than this meanwhile
    heraldAfter: 0.7,      // a beat after they fall, before the complaint
  }),
  sunderSentence: Object.freeze({
    graceSec: 1.5,         // no Sundering swing for this long: the sentence is dropped
    thanksAfter: 0.3,      // a beat after the foe falls, before "Thank. You."
    thanksFrom: 9,         // "Thank. You." once this many words are said (as far as "For.")
  }),
  regenTrick: Object.freeze({
    low: 30,               // "Wait, wait!!..." as a blow he survives takes him to this or below...
    rearm: 60,             // ...weighed again only once he has been back above this
    recovered: 55,         // the reveal: his health come back up to this (regenerated out of danger)
    giveUpSec: 25,         // the reveal is waited for this long at most
  }),
});

export class VoiceScenes {
  constructor({ say = () => false, rand = Math.random } = {}) {
    this.say = say;
    this.rand = rand;
    this.duels = new Map();       // speaker -> { foe, stage, at, until, hurt }
    this.sentences = new Map();   // speaker -> { state: 'waiting' | 'running' | 'over', index, lastAt }
    this.tricks = new Map();      // knight -> { saidAt, hurtAt, lowest, done }: "Wait, wait!!..." said, the reveal waited for
    this.weighed = new Set();     // knights whose fall to low has been weighed (until they are well clear of it)
  }

  /** A new match: nothing carries over. */
  reset() {
    this.duels.clear();
    this.sentences.clear();
    this.tricks.clear();
    this.weighed.clear();
  }

  // ------------------------------------------------------------------------------------------------ the final duel

  /** The declaration was said by `speaker` to `foe` (it runs `seconds` from `at`): the scene is open. */
  duelDeclared(speaker, foe, at, seconds = 0) {
    if (!speaker || !foe) return;
    this.duels.set(speaker, { foe, stage: 'declared', at: at + seconds + SCENES.finalDuel.replyAfter, hurt: 0 });
  }

  /** Whether `speaker` is in the spoken part of a final duel (declaring, being answered, or answering). */
  duelSpeaking(speaker) {
    const duel = this.duels.get(speaker);
    return Boolean(duel) && (duel.stage === 'declared' || duel.stage === 'answered');
  }

  // -------------------------------------------------------------------------------------------- the Sunder sentence

  /** A Sunder has taken hold: its sentence may begin at its first slam (one roll, there). */
  sunderBegan(speaker) {
    if (speaker) this.sentences.set(speaker, { state: 'waiting', index: 0, lastAt: null });
  }

  /**
   * The Sunder is over. A sentence that never began will not; one being said may still have the last slams of the chain
   * he was in (they are swung as slams: each is still its word), and stops with them.
   */
  sunderEnded(speaker) {
    const sentence = this.sentences.get(speaker);
    if (sentence && sentence.state !== 'running') this.sentences.delete(speaker);
  }

  /** `speaker`'s Sundering blade was driven into the ground (a genuine slam): the first of them may begin the sentence. */
  groundSlam(speaker, at) {
    const sentence = this.sentences.get(speaker);
    if (!sentence || sentence.state !== 'waiting') return;
    // (the one roll: the line's own odds and cooldown, as any line's; begun, it takes the voice, even from the cry
    // that called the Sunder)
    const said = this.say(LINES.sentence, speaker, { part: 0, opening: true });
    sentence.state = said ? 'running' : 'over';
    sentence.index = said ? 1 : 0;
    sentence.lastAt = at;
  }

  /** `speaker` swung a Sundering slam (hit or miss): the next word, if the sentence is running and they have kept on. */
  slamSwung(speaker, at) {
    const sentence = this.sentences.get(speaker);
    if (!sentence || sentence.state !== 'running') return;
    if (at - sentence.lastAt > SCENES.sunderSentence.graceSec) {
      sentence.state = 'over';
      return;
    }
    const words = voiceLine(LINES.sentence)?.parts?.length ?? 0;
    if (sentence.index >= words) return;
    this.say(LINES.sentence, speaker, { part: sentence.index, earned: true });
    sentence.index += 1;
    sentence.lastAt = at;
    if (sentence.index >= words) sentence.state = 'said';
  }

  /** Whether `speaker`'s Sunder sentence is being said (their ordinary swing lines keep quiet under it). */
  sentenceRunning(speaker, at = null) {
    const sentence = this.sentences.get(speaker);
    if (!sentence || sentence.state !== 'running') return false;
    return at === null || at - sentence.lastAt <= SCENES.sunderSentence.graceSec;
  }

  // ---------------------------------------------------------------------------------------------------- what happens

  /** A blow landed (a `damage` event). */
  damage(event) {
    const { victimId, attackerId, at } = event;
    if (!(event.amount > 0) || !victimId) return;
    this.#lowBlow(event);
    // the verdict: what he takes while it is open counts against it
    const duel = this.duels.get(victimId);
    if (duel?.stage === 'verdict' && attackerId && attackerId !== victimId) {
      duel.hurt += event.amount;
      if (duel.hurt > SCENES.finalDuel.verdictHurt) this.duels.delete(victimId);
    }
  }

  /**
   * A knight fell (a `death` event). Returns what it means for the voice: { planFailed: the fallen was waiting on an
   * announced plan; victor: true when a scene has the victor's next words (the ordinary victor's lines keep quiet) }.
   */
  death(event) {
    const { victimId, at } = event;
    const killerId = event.killerId && event.killerId !== victimId ? event.killerId : null;
    const trick = this.tricks.get(victimId);
    const planFailed = Boolean(trick) && !trick.done;
    this.tricks.delete(victimId);
    this.weighed.delete(victimId);
    // the fallen's own scenes end with them
    this.duels.delete(victimId);
    this.sentences.delete(victimId);
    let victor = false;
    for (const [speaker, duel] of [...this.duels]) {
      if (duel.foe !== victimId) continue;
      // the challenger fell: to him, while the verdict was open and at little cost, and he complains; any other way
      // (somebody else's doing, a fall, mid-speech), the scene is simply over
      if (speaker === killerId && duel.stage === 'verdict' && at <= duel.until) {
        this.duels.set(speaker, { ...duel, stage: 'herald', at: at + SCENES.finalDuel.heraldAfter });
        victor = true;
      } else {
        this.duels.delete(speaker);
      }
    }
    // the Sunder sentence, nearly said, and a foe felled by it: they have left
    const sentence = killerId ? this.sentences.get(killerId) : null;
    const bySunder = ['sword', 'rupture'].includes(event.source);
    if (sentence && bySunder && (sentence.state === 'running' || sentence.state === 'said') && sentence.index >= SCENES.sunderSentence.thanksFrom) {
      sentence.state = 'over';
      // (it cuts whatever word was still in his mouth: nothing more is shouted at the fallen)
      if (this.say(LINES.thanks, killerId, { delay: SCENES.sunderSentence.thanksAfter, force: true })) victor = true;
    }
    return { planFailed, victor };
  }

  /**
   * Time passes: the parts whose moment has come are said. now: the host's time; knights: every knight as last seen
   * ([{ id, alive, health }]).
   */
  step(now, knights = []) {
    this.#duels(now, knights);
    this.#tricks(now, knights);
  }

  #duels(now, knights) {
    const alive = (id) => knights.find((knight) => knight.id === id)?.alive !== false;
    for (const [speaker, duel] of [...this.duels]) {
      if (!alive(speaker) || !alive(duel.foe)) {
        // (a herald's complaint is about one already fallen: only the speaker's own fall ends that)
        if (duel.stage !== 'herald' || !alive(speaker)) this.duels.delete(speaker);
        if (duel.stage !== 'herald') continue;
      }
      if (duel.stage === 'declared' && now >= duel.at) {
        // the foe's own remark: one of their ordinary lines fit to say back, whichever comes first to hand
        const candidates = [...REPLY_LINES].sort(() => this.rand() - 0.5);
        let reply = false;
        for (const line of candidates) {
          reply = this.say(line, duel.foe, { earned: true });
          if (reply) break;
        }
        if (!reply) this.duels.delete(speaker);
        else this.duels.set(speaker, { ...duel, stage: 'answered', at: now + reply.seconds + SCENES.finalDuel.questAfter });
      } else if (duel.stage === 'answered' && now >= duel.at) {
        const quest = this.say(LINES.duel, speaker, { part: 1, earned: true });
        if (!quest) this.duels.delete(speaker);
        else this.duels.set(speaker, { ...duel, stage: 'verdict', until: now + quest.seconds + SCENES.finalDuel.verdictSec, hurt: 0 });
      } else if (duel.stage === 'verdict' && now > duel.until) {
        this.duels.delete(speaker);
      } else if (duel.stage === 'herald' && now >= duel.at) {
        this.duels.delete(speaker);
        this.say(LINES.herald, speaker, { earned: true });
      }
    }
  }

  // a blow survived that left him low: "Wait, wait!!..." (now and then; once until he is well clear of low)
  #lowBlow(event) {
    const { victimId, at } = event;
    const rules = SCENES.regenTrick;
    const after = event.health;
    const trick = this.tricks.get(victimId);
    if (trick) {
      trick.lowest = Math.min(trick.lowest, after ?? trick.lowest);
      trick.hurtAt = at;
      return;
    }
    if (!(after > 0) || after > rules.low || this.weighed.has(victimId)) return;
    this.weighed.add(victimId);
    if (this.say(LINES.trick, victimId, { part: 0 })) this.tricks.set(victimId, { saidAt: at, hurtAt: at, lowest: after, done: false });
  }

  #tricks(now, knights) {
    const rules = SCENES.regenTrick;
    for (const knight of knights) {
      if (!knight?.id || knight.alive === false) continue;
      const health = knight.health ?? 0;
      // well clear of low again: the next fall to it may be weighed
      if (health > rules.rearm && !this.tricks.has(knight.id)) this.weighed.delete(knight.id);
      const trick = this.tricks.get(knight.id);
      if (!trick) continue;
      // he got away with it: his health has come back, out of danger (truly regenerated: never before it could have)
      if (health >= rules.recovered && health > trick.lowest && now >= trick.hurtAt + HEALTH_REGEN.delaySec) {
        trick.done = true;
        this.tricks.delete(knight.id);
        this.say(LINES.trick, knight.id, { part: 1, earned: true });
      } else if (now - trick.saidAt > rules.giveUpSec) {
        this.tricks.delete(knight.id);
      }
    }
  }
}
