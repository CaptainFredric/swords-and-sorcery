import { SPRINT } from '../../shared/src/movement.mjs';
import { combatStatusDurationMs } from '../game/combatFeedbackTiming.mjs';
import { spellFor } from '../../shared/src/spells.mjs';
import { steelStrength } from '../../shared/src/steel.mjs';
import { iconSvg } from './icons.mjs';
import { ultimateView } from './ultimateView.mjs';
import { STAGGER } from '../../shared/src/stagger.mjs';
import { practiceOverride } from '../../shared/src/practiceRecast.mjs';

export function matchInfoText(snapshot, serverNow) {
  if (snapshot?.mode === 'PRACTICE') return 'PRACTICE YARD  ·  UNTIMED';
  if (snapshot?.suddenDeath) return 'SUDDEN DEATH';
  const startedAt = Number.isFinite(snapshot?.matchStartedAt) ? snapshot.matchStartedAt : serverNow;
  const elapsed = Math.max(0, serverNow - startedAt);
  const length = Number.isFinite(snapshot?.matchSeconds) ? snapshot.matchSeconds : 360;
  const left = Math.max(0, length - elapsed);
  const mins = Math.floor(left / 60);
  const secs = Math.floor(left % 60).toString().padStart(2, '0');
  return `FIRST TO ${snapshot?.scoreToWin ?? 10}  ·  ${mins}:${secs}`;
}

export class HUD {
  constructor() {
    this.root = document.querySelector('#hud');
    this.healthValue = document.querySelector('#health-value');
    this.healthFill = document.querySelector('#health-fill');
    this.healthTrail = document.querySelector('#health-trail');
    this.guardBlock = document.querySelector('#guard-block');
    this.guardFill = document.querySelector('#guard-fill');
    this.spell = document.querySelector('#spell-ability');
    this.spellLabel = this.spell.querySelector('em');
    this.spellIcon = this.spell.querySelector('.ability-icon');
    this.spellBadge = this.spell.querySelector('.ability-badge');
    this.burnEdge = document.querySelector('#afflict-burn');
    this.hurtEdge = document.querySelector('#hurt-edge');
    this.lowHealth = document.querySelector('#low-health');
    this.chillEdge = document.querySelector('#afflict-chill');
    this.dash = document.querySelector('#dash-ability');
    const dashIcon = this.dash?.querySelector('.ability-icon');
    if (dashIcon) dashIcon.innerHTML = iconSvg('dash');
    this.ultimate = document.querySelector('#ultimate-ability');
    const ultimateIcon = this.ultimate?.querySelector('.ability-icon');
    if (ultimateIcon) ultimateIcon.innerHTML = iconSvg('sunder');
    this.ultimateShown = 'sunder';
    this.ultimateReady = false;
    this.staggerTrack = document.querySelector('#stagger-track');
    this.staggerFill = document.querySelector('#stagger-fill');
    this.armour = document.querySelector('#health-armour');
    this.armourPlates = [...(this.armour?.querySelectorAll('.armour-plate') ?? [])];
    this.armourShown = -1;
    this.matchInfo = document.querySelector('#match-info');
    this.feed = document.querySelector('#kill-feed');
    this.crosshair = document.querySelector('#crosshair');
    this.flash = document.querySelector('#status-flash');
    this.subtitleLine = document.querySelector('#subtitle');
    this.deathCard = document.querySelector('#death-card');
    this.deathKiller = document.querySelector('#death-killer');
    this.deathHow = document.querySelector('#death-how');
    this.deathLeft = document.querySelector('#death-left');
    this.deathTimer = document.querySelector('#death-timer');
    this.debug = document.querySelector('#debug');
    this.scoreboard = document.querySelector('#scoreboard');
    this.pointerHint = document.querySelector('#pointer-hint');
    this.displayedTrail = 100;
    this.feedTimers = [];
  }

  show() { this.root.classList.remove('hidden'); this.root.setAttribute('aria-hidden', 'false'); }
  hide() { this.root.classList.add('hidden'); this.root.setAttribute('aria-hidden', 'true'); }
  setPointerLocked(locked) {
    this.pointerHint.classList.toggle('hidden', locked);
    this.root.classList.toggle('pointer-locked', Boolean(locked));
  }

  update(local, snapshot, serverNow) {
    if (!local) return;
    const hp = Math.max(0, Math.min(100, local.health));
    this.healthValue.textContent = String(Math.ceil(hp));
    this.healthFill.style.width = `${hp}%`;
    this.displayedTrail += (hp - this.displayedTrail) * 0.035;
    if (hp < this.displayedTrail) this.displayedTrail = Math.max(hp, this.displayedTrail - 0.25);
    else this.displayedTrail = hp;
    this.healthTrail.style.width = `${this.displayedTrail}%`;
    // badly hurt: the edges of the view keep a slow pulse, stronger the lower it gets
    const low = local.alive && hp < 35 ? (35 - hp) / 35 : 0;
    if (this.lowHealth) {
      this.lowHealth.classList.toggle('on', low > 0);
      this.lowHealth.style.setProperty('--low', low.toFixed(2));
    }

    const guard = Math.max(0, Math.min(100, local.guardStamina));
    this.guardFill.style.width = `${guard}%`;
    // balance lost: a thin bar under the stamina, filling toward the break (red and pulsing near it)
    const stagger = Math.max(0, Math.min(1, (local.stagger?.level ?? 0) / STAGGER.max));
    if (this.staggerFill) {
      this.staggerFill.style.width = `${(stagger * 100).toFixed(1)}%`;
      this.staggerTrack.classList.toggle('shown', stagger > 0.01);
      this.staggerTrack.classList.toggle('warn', stagger >= 0.72);
      this.staggerTrack.classList.toggle('recovering', (local.stagger?.recoverUntil ?? -Infinity) > serverNow);
    }
    this.guardBlock.classList.toggle('faded', !local.guarding && !local.sprinting && guard >= 99.5 && stagger <= 0.01);
    this.guardBlock.classList.toggle('sprinting', Boolean(local.sprinting));
    this.guardBlock.classList.toggle('winded', !local.sprinting && guard < SPRINT.restartStamina);

    // the Q tile shows whichever spell was carried in from the Armory; while it cools, the key is the gauntlet's (the
    // fist on the tile, the spell's own mark small in its corner, its cooldown still counting down)
    const spell = spellFor(local.spell);
    // (in the Practice Yard the key stays the spell's while it cools: it comes back after a moment)
    const practice = snapshot?.mode === 'PRACTICE';
    const cooling = (local.spellReadyAt ?? 0) - serverNow > 0.01 && !practice;
    const face = `${spell.id}:${cooling ? 'fist' : 'spell'}`;
    if (this.spell.dataset.face !== face) {
      this.spell.dataset.face = face;
      this.spell.dataset.spell = spell.id;
      this.spell.classList.toggle('fist', cooling);
      this.spellLabel.textContent = cooling ? 'GAUNTLET' : (spell.short ?? spell.label).toUpperCase();
      this.spellIcon.innerHTML = iconSvg(cooling ? 'gauntlet' : spell.id);
      if (this.spellBadge) this.spellBadge.innerHTML = cooling ? iconSvg(spell.id) : '';
    }
    this.#ability(this.spell, Math.max(0, (local.spellReadyAt ?? 0) - serverNow), spell.cooldownSec);
    this.#ability(this.dash, Math.max(0, local.dashReadyAt - serverNow));
    // the real cooldown counts down as in a match; the yard's mark says why the key works anyway
    this.spell.classList.toggle('practice', practiceOverride(local, 'spell', serverNow, practice));
    this.dash.classList.toggle('practice', practiceOverride(local, 'dash', serverNow, practice));
    this.#ultimate(local, serverNow, practice);
    this.#armour(steelStrength(local.steel, serverNow), local.steel?.calledAt);
    this.matchInfo.textContent = matchInfoText(snapshot, serverNow);

    this.deathCard.classList.toggle('hidden', local.alive);
    if (!local.alive) this.deathTimer.textContent = Math.max(0, local.respawnAt - serverNow).toFixed(1);
  }

  /** A key pressed that can do nothing yet (the spell cooling with nobody in reach of the gauntlet): the tile says so. */
  denied(ability) {
    const element = ability === 'spell' ? this.spell : ability === 'dash' ? this.dash : ability === 'ultimate' ? this.ultimate : null;
    if (!element) return;
    element.classList.remove('denied');
    // (restart the shake if it is already playing)
    void element.offsetWidth;
    element.classList.add('denied');
    clearTimeout(element.deniedTimer);
    element.deniedTimer = setTimeout(() => element.classList.remove('denied'), 320);
  }

  /** While the spell cools, whether its key would throw the gauntlet now (dimmed while the sword has the hand). */
  setFistReady(ready) {
    this.spell.classList.toggle('fist-held', !ready);
  }

  /**
   * A blow taken: the edges of the view redden, as deep as the blow was heavy (`amount` damage) and deeper on the side
   * it came from (`side`: -1 its left .. 1 its right), easing back over most of a second.
   */
  hurt({ amount = 10, side = 0 } = {}) {
    if (!this.hurtEdge) return;
    this.hurtEdge.style.setProperty('--hurt', Math.min(0.85, 0.3 + amount / 55).toFixed(2));
    this.hurtEdge.style.setProperty('--hx', Math.max(-1, Math.min(1, side)).toFixed(2));
    this.hurtEdge.classList.remove('struck');
    void this.hurtEdge.offsetWidth;
    this.hurtEdge.classList.add('struck');
  }

  /**
   * A blow landing on my hardened plate: the frame jolts and flashes, as bright as the armour is strong, throws
   * sparks where the health ends, and what it turned aside (`turned`, damage) rises off it. `full`: the blow's own
   * clang (a quick follow-on only jolts it).
   */
  steelStruck({ strength = 1, turned = 0, full = true, health = null } = {}) {
    if (!this.armour) return;
    this.armour.classList.remove('struck');
    void this.armour.offsetWidth;
    this.armour.classList.add('struck');
    clearTimeout(this.armourStruckTimer);
    this.armourStruckTimer = setTimeout(() => this.armour.classList.remove('struck'), 160);
    if (!full) return;
    const at = Math.max(4, Math.min(96, Number.isFinite(health) ? health : 50));
    const sparks = Math.round(3 + 9 * Math.max(0, Math.min(1, strength)));
    for (let i = 0; i < sparks; i += 1) {
      const spark = document.createElement('i');
      spark.className = 'armour-spark';
      const up = i % 2 === 0;
      const reach = 10 + 26 * strength * Math.random();
      spark.style.left = `calc(${at}% + ${(Math.random() - 0.5) * 14}px)`;
      spark.style.top = up ? '-5px' : 'calc(100% + 2px)';
      spark.style.setProperty('--dx', `${(Math.random() - 0.5) * 2 * reach}px`);
      spark.style.setProperty('--dy', `${(up ? -1 : 1) * (4 + reach * Math.random())}px`);
      this.armour.append(spark);
      setTimeout(() => spark.remove(), 420);
    }
    if (turned >= 1) {
      const word = document.createElement('b');
      word.className = 'armour-turned';
      word.style.left = `${at}%`;
      word.innerHTML = `⛨ ${Math.round(turned)}<small>GLANCING</small>`;
      this.armour.append(word);
      setTimeout(() => word.remove(), 950);
    }
  }

  // Sheathed in Steel round the health bar: each of the five plates holds a fifth of the armour's strength, the
  // right-hand ones wearing first, and one worn through breaks away and falls; freshly called, they slam on
  #armour(strength, calledAt) {
    if (!this.armour) return;
    const shown = Math.round(strength * 200) / 200;
    if (shown === this.armourShown) return;
    this.armourShown = shown;
    const recalled = Number.isFinite(calledAt) && calledAt !== this.armourCalledAt;
    this.armour.classList.toggle('sheathed', shown > 0);
    this.armour.style.setProperty('--steel', shown.toFixed(3));
    this.armourWas ??= this.armourPlates.map(() => 0);
    this.armourPlates.forEach((plate, i) => {
      const p = Math.max(0, Math.min(1, shown * this.armourPlates.length - i));
      if (!recalled && this.armourWas[i] > 0.02 && p <= 0) this.#breakPlate(plate, this.armourWas[i]);
      this.armourWas[i] = p;
      plate.style.setProperty('--p', p.toFixed(3));
      plate.classList.toggle('cracked', shown > 0 && p < 0.5);
    });
    if (recalled) {
      this.armourCalledAt = calledAt;
      this.armour.classList.remove('called');
      void this.armour.offsetWidth;
      this.armour.classList.add('called');
    }
  }

  // a plate worn through: a copy of it as it last was breaks away and falls
  #breakPlate(plate, p) {
    const fragment = plate.cloneNode(false);
    fragment.classList.add('armour-fragment');
    fragment.classList.add('cracked');
    fragment.style.setProperty('--p', Math.max(0.35, p).toFixed(3));
    fragment.style.setProperty('--dx', `${4 + Math.random() * 8}px`);
    fragment.style.setProperty('--turn', `${(Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 20)}deg`);
    this.armour.append(fragment);
    setTimeout(() => fragment.remove(), 720);
  }

  // the ultimate's tile: its shade drains as prowess is earned; full, it glows (and says so once); while it runs, its
  // seconds count down
  #ultimate(local, serverNow, practice = false) {
    if (!this.ultimate) return;
    const view = ultimateView(local, serverNow, { practice });
    const tile = this.ultimate;
    // (the tile is the ultimate carried: its own mark and name)
    if (this.ultimateShown !== view.ultimate.id) {
      this.ultimateShown = view.ultimate.id;
      tile.dataset.ultimate = view.ultimate.id;
      tile.querySelector('.ability-icon').innerHTML = iconSvg(view.ultimate.id, 'sunder');
    }
    // its name; while a Vortex runs, what it has been steered to (BLADE, FIRE), and the tile takes that on
    const word = view.word ?? (view.ultimate.short ?? view.ultimate.label).toUpperCase();
    const name = tile.querySelector('em');
    if (name.textContent !== word) name.textContent = word;
    const emphasis = view.emphasis ?? '';
    if ((tile.dataset.emphasis ?? '') !== emphasis) tile.dataset.emphasis = emphasis;
    // (while it runs: how much of its stretch is left, as a ring drawn round the tile)
    tile.style.setProperty('--left', view.state === 'active' ? view.charge.toFixed(3) : '0');
    tile.classList.toggle('ready', view.state === 'ready');
    tile.classList.toggle('cooling', view.state === 'charging' || view.state === 'locked');
    tile.classList.toggle('active', view.state === 'active' || view.state === 'bracing');
    // (running, it is lit, not shaded: what is left of it is the ring round it)
    tile.style.setProperty('--cooldown', view.state === 'charging' || view.state === 'locked' ? String(1 - view.charge) : '0');
    const value = tile.querySelector('strong');
    if (value.textContent !== view.label) value.textContent = view.label;
    const ready = view.state === 'ready';
    if (ready && !this.ultimateReady) this.onUltimateReady?.();
    this.ultimateReady = ready;
  }

  #ability(element, remaining, cooldownSec = 5) {
    const value = element.querySelector('strong');
    const ready = remaining <= 0.01;
    element.classList.toggle('ready', ready);
    element.classList.toggle('cooling', !ready);
    value.textContent = ready ? 'READY' : remaining.toFixed(1);
    element.style.setProperty('--cooldown', String(Math.min(1, remaining / cooldownSec)));
  }

  /** My own afflictions at the edges of the view: burning (on or off), chill 0..1 (fading as it thaws). */
  setAfflictions({ burning = false, chill = 0 } = {}) {
    this.burnEdge.classList.toggle('on', Boolean(burning));
    this.chillEdge.style.opacity = String(Math.max(0, Math.min(1, chill)));
  }

  flashText(text, kind = '', durationMs = null, hint = null) {
    this.flash.textContent = text;
    // (a smaller line under it, for the once it is worth saying: how a Vortex is steered)
    if (hint) {
      const small = document.createElement('small');
      small.textContent = hint;
      this.flash.append(small);
    }
    this.flash.className = `status-flash show ${kind}`;
    clearTimeout(this.flashTimer);
    const duration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : combatStatusDurationMs(text);
    this.flashTimer = setTimeout(() => { this.flash.className = 'status-flash'; }, duration);
  }

  /**
   * A Spellblade's words as he says them: `delay` seconds from now, for as long as he says them (and a breath after).
   * name: whose they are (none for my own); a new line takes the place of the last.
   */
  subtitle({ text, name = null, delay = 0, seconds = 2 } = {}) {
    const line = this.subtitleLine;
    if (!line || !text) return;
    clearTimeout(this.subtitleShow);
    clearTimeout(this.subtitleHide);
    this.subtitleShow = setTimeout(() => {
      line.replaceChildren();
      if (name) {
        const who = document.createElement('b');
        who.textContent = name;
        line.append(who);
      }
      const words = document.createElement('span');
      words.textContent = text;
      line.append(words);
      line.classList.toggle('mine', !name);
      line.classList.add('show');
      this.subtitleHide = setTimeout(() => line.classList.remove('show'), (seconds + 0.9) * 1000);
    }, Math.max(0, delay) * 1000);
  }

  hit(kind = 'hit') {
    this.crosshair.classList.add(kind);
    setTimeout(() => this.crosshair.classList.remove(kind), 130);
  }

  addFeed(text, kind = '') {
    const line = document.createElement('div');
    line.className = `feed-line ${kind}`;
    line.textContent = text;
    this.feed.prepend(line);
    while (this.feed.children.length > 5) this.feed.lastElementChild?.remove();
    setTimeout(() => line.classList.add('fade'), 3400);
    setTimeout(() => line.remove(), 4100);
  }

  /** Who felled me, how, and how close it was (deathCam.deathCardText). */
  setDeath({ name, how = '', left = '' } = {}) {
    this.deathKiller.textContent = name || 'THE ABYSS';
    if (this.deathHow) this.deathHow.textContent = how;
    if (this.deathLeft) {
      this.deathLeft.textContent = left;
      this.deathLeft.hidden = !left;
    }
  }

  setScoreboard(snapshot, visible) {
    this.scoreboard.classList.toggle('hidden', !visible);
    if (!visible) return;
    const sorted = [...snapshot.players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    this.scoreboard.innerHTML = `<h3>SCOREBOARD</h3>${sorted.map((p) => `<div><span>${escapeHtml(p.name)}</span><b>${p.kills}</b><em>${p.deaths} deaths</em></div>`).join('')}`;
  }

  setDebug(data, visible) {
    this.debug.classList.toggle('hidden', !visible);
    if (!visible) return;
    this.debug.textContent = [
      `FPS ${data.fps.toFixed(0)}`,
      `PING ${data.ping}ms`,
      `TICK ${data.tick}`,
      `POS ${data.position.x.toFixed(1)} ${data.position.y.toFixed(1)} ${data.position.z.toFixed(1)}`,
      `ROOM ${data.room}`,
      `${data.players} PLAYERS · ${data.state}`,
      `PRED ERR ${data.predictionError.toFixed(2)}m`,
      `DRAW ${data.drawCalls ?? '-'} · TRIS ${Number.isFinite(data.triangles) ? `${(data.triangles / 1000).toFixed(1)}k` : '-'}`,
    ].join('\n');
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
}
