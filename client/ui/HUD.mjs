import { preparedSpellView } from '../game/preparedSpellSelector.mjs';
import { SPRINT } from '../../shared/src/movement.mjs';
import { combatStatusDurationMs } from '../game/combatFeedbackTiming.mjs';
import { spellFor } from '../../shared/src/spells.mjs';
import { steelStrength } from '../../shared/src/steel.mjs';
import { iconSvg } from './icons.mjs';
import { ultimateView } from './ultimateView.mjs';
import { STAGGER } from '../../shared/src/stagger.mjs';
import { practiceOverride } from '../../shared/src/practiceRecast.mjs';
import { ultimateFor } from '../../shared/src/ultimates.mjs';

const HIT_MARKERS = Object.freeze({
  hit: { priority: 1, milliseconds: 160 },
  glance: { priority: 1, milliseconds: 160 },
  block: { priority: 2, milliseconds: 200 },
  break: { priority: 3, milliseconds: 240 },
  parry: { priority: 3, milliseconds: 240 },
  kill: { priority: 4, milliseconds: 320 },
});

export function duelScoreView(local, snapshot) {
  if (!local || snapshot?.tutorial || !['BOT_DUEL', 'DUEL'].includes(snapshot?.mode) || snapshot.players?.length !== 2) return null;
  const rival = snapshot.players.find(player => player.id !== local.id);
  if (!rival || !snapshot.players.some(player => player.id === local.id)) return null;
  return { mine: Math.max(0, local.kills ?? 0), theirs: Math.max(0, rival.kills ?? 0), rival: rival.name ?? 'Rival' };
}

// how long after Spells & Chivalry takes hold its prepared spells still say how to use them (s)
export const PREPARED_HINT_SEC = 2.5;

export function breakthroughHudView(local, snapshot, serverNow) {
  if (snapshot?.mode !== 'BREAKTHROUGH' || !snapshot.objective) return { visible: false };
  const obj = snapshot.objective;
  const myTeam = local?.team ?? 'ATTACKERS';
  const isAttacker = myTeam === 'ATTACKERS';
  const pct = Math.max(0, Math.min(100, Math.round((obj.progress ?? 0) * 100)));

  const isOvertime = Boolean(snapshot?.overtime || obj.overtime);
  const startedAt = Number.isFinite(snapshot?.matchStartedAt) ? snapshot.matchStartedAt : serverNow;
  const elapsed = Math.max(0, serverNow - startedAt);
  const length = Number.isFinite(snapshot?.matchSeconds) ? snapshot.matchSeconds : 300;
  const left = Math.max(0, length - elapsed);
  const mins = Math.floor(left / 60);
  const secs = Math.floor(left % 60).toString().padStart(2, '0');
  const clock = isOvertime ? 'OVERTIME' : `${mins}:${secs}`;

  let stateKey = 'idle';
  let stateLabel = isAttacker ? 'CAPTURE' : 'DEFEND';
  if (obj.completed) {
    stateKey = 'captured';
    stateLabel = 'CAPTURED';
  } else if (isOvertime) {
    stateKey = 'overtime';
    stateLabel = isAttacker ? 'OVERTIME · CAPTURE' : 'OVERTIME · DEFEND';
  } else if (obj.contested) {
    stateKey = 'contested';
    stateLabel = 'CONTESTED';
  } else if (obj.capturing) {
    stateKey = 'capturing';
    stateLabel = isAttacker ? 'CAPTURING' : 'LOSING GROUND';
  } else if (obj.decaying) {
    stateKey = 'decaying';
    stateLabel = isAttacker ? 'DECAYING' : 'RECLAIMING';
  } else if ((obj.defendersCount ?? 0) > 0) {
    stateKey = 'holding';
    stateLabel = isAttacker ? 'FORTIFIED' : 'HOLDING';
  }

  const dist = (local?.position && obj.position)
    ? Math.max(0, Math.round(Math.hypot(obj.position.x - local.position.x, obj.position.z - local.position.z)))
    : null;

  return {
    visible: true,
    team: myTeam,
    teamLabel: isAttacker ? 'ATTACKERS · AZURE' : 'DEFENDERS · CRIMSON',
    directive: isAttacker ? `Capture ${obj.name ?? 'the Objective'}` : `Defend ${obj.name ?? 'the Objective'}`,
    phaseLabel: `OBJECTIVE ${(obj.index ?? 0) + 1} OF ${obj.total ?? 2}`,
    objectiveName: (obj.name ?? 'OBJECTIVE').toUpperCase(),
    progressPct: pct,
    stateKey,
    stateLabel,
    attackersCount: obj.attackersCount ?? 0,
    defendersCount: obj.defendersCount ?? 0,
    clock,
    distanceMeters: dist,
  };
}

export function matchInfoText(snapshot, serverNow) {
  if (snapshot?.tutorial) return 'GREENER PASTURES  ·  TUTORIAL';
  if (snapshot?.mode === 'PRACTICE') return 'PRACTICE YARD  ·  UNTIMED';
  if (snapshot?.suddenDeath) return 'SUDDEN DEATH';
  const startedAt = Number.isFinite(snapshot?.matchStartedAt) ? snapshot.matchStartedAt : serverNow;
  const elapsed = Math.max(0, serverNow - startedAt);
  const length = Number.isFinite(snapshot?.matchSeconds) ? snapshot.matchSeconds : 360;
  const left = Math.max(0, length - elapsed);
  const mins = Math.floor(left / 60);
  const secs = Math.floor(left % 60).toString().padStart(2, '0');
  const clockStr = (snapshot?.overtime || snapshot?.objective?.overtime) ? 'OVERTIME' : `${mins}:${secs}`;
  if (snapshot?.mode === 'BREAKTHROUGH') {
    const obj = snapshot.objective;
    const objName = obj?.name ?? 'OBJECTIVE';
    const pct = Math.round((obj?.progress ?? 0) * 100);
    const status = (snapshot?.overtime || obj?.overtime) ? 'OVERTIME' : obj?.contested ? 'CONTESTED' : `${pct}%`;
    return `BREAKTHROUGH  ·  ${objName.toUpperCase()} [${status}]  ·  ${clockStr}`;
  }
  return `FIRST TO ${snapshot?.scoreToWin ?? 10}  ·  ${mins}:${secs}`;
}

export class HUD {
  constructor() {
    this.root = document.querySelector('#hud');
    this.healthValue = document.querySelector('#health-value');
    this.healthFill = document.querySelector('#health-fill');
    this.healthTrail = document.querySelector('#health-trail');
    this.guardBlock = document.querySelector('#guard-block');
    this.guardLabel = this.guardBlock.querySelector('span');
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
    this.duelScore = document.querySelector('#duel-score');
    this.duelMine = this.duelScore?.querySelector('[data-duel-mine]');
    this.duelTheirs = this.duelScore?.querySelector('[data-duel-theirs]');
    this.breakthroughHud = document.createElement('div');
    this.breakthroughHud.id = 'breakthrough-hud';
    this.breakthroughHud.className = 'breakthrough-hud hidden';
    this.breakthroughHud.innerHTML = `
      <div class="bt-header">
        <span class="bt-team-badge" data-bt-team>ATTACKERS</span>
        <span class="bt-phase" data-bt-phase>OBJECTIVE 1 OF 2</span>
        <span class="bt-clock" data-bt-clock>5:00</span>
      </div>
      <div class="bt-main">
        <strong class="bt-obj-name" data-bt-name>THE OUTER GATE</strong>
        <em class="bt-state-pill" data-bt-state>CAPTURE</em>
      </div>
      <div class="bt-bar-track"><div class="bt-bar-fill" data-bt-fill></div></div>
      <div class="bt-footer">
        <small data-bt-directive>Capture The Outer Gate</small>
        <small data-bt-counts></small>
      </div>
    `;
    if (this.root?.append) {
      this.root.append(this.breakthroughHud);
    } else {
      this.root?.appendChild?.(this.breakthroughHud);
    }

    this.objectiveWaypoint = document.createElement('div');
    this.objectiveWaypoint.id = 'objective-waypoint';
    this.objectiveWaypoint.className = 'objective-waypoint hidden';
    this.objectiveWaypoint.innerHTML = `<i class="wp-diamond"></i><b data-wp-name>OUTER GATE</b><span data-wp-meta>24m</span>`;
    if (this.root?.append) {
      this.root.append(this.objectiveWaypoint);
    } else {
      this.root?.appendChild?.(this.objectiveWaypoint);
    }

    this.rivalWaypoint = document.createElement('div');
    this.rivalWaypoint.id = 'rival-waypoint';
    this.rivalWaypoint.className = 'rival-waypoint hidden';
    this.rivalWaypoint.innerHTML = `<i class="rival-wp-pointer"></i><b data-rival-name>RIVAL</b><span data-rival-dist>34 m</span>`;
    if (this.root?.append) {
      this.root.append(this.rivalWaypoint);
    } else {
      this.root?.appendChild?.(this.rivalWaypoint);
    }
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
    this.preparedPanel = document.createElement('div');
    this.preparedPanel.className = 'prepared-spells';
    this.preparedPanel.hidden = true;
    this.root.append(this.preparedPanel);
    this.preparedSelector = null;
    // with a mouse and keyboard, the prepared spells stand as a rack of tiles over the Q, E and R tiles (on touch they
    // keep their own place: the touch layout has no ability tiles)
    this.abilityRow = this.spell?.parentElement ?? null;
    this.preparedDocked = false;
  }

  show() { this.root.classList.remove('hidden'); this.root.setAttribute('aria-hidden', 'false'); }
  hide() { this.root.classList.add('hidden'); this.root.setAttribute('aria-hidden', 'true'); this.clearHit(); }
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
    this.guardLabel.textContent = (local.staggerUntil ?? 0) > serverNow ? 'GUARD · STAGGERED'
      : local.guarding && local.sprinting ? 'GUARD + SPRINT'
        : local.guarding ? 'GUARDING' : local.sprinting ? 'SPRINTING'
          : guard < SPRINT.restartStamina ? 'GUARD · WINDED' : 'GUARD · STAMINA';
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
    const practice = snapshot?.mode === 'PRACTICE' && !snapshot.tutorial;
    const prepared = preparedSpellView(local, serverNow);
    const currentPrepared = prepared.spells.find((entry) => entry.current);
    const cooling = !prepared.visible && !local.preparedSpellSelected && (local.spellReadyAt ?? 0) - serverNow > 0.01 && !practice;
    this.#preparedSpells(prepared);
    const face = `${spell.id}:${cooling ? 'fist' : 'spell'}`;
    if (this.spell.dataset.face !== face) {
      this.spell.dataset.face = face;
      this.spell.dataset.spell = spell.id;
      this.spell.classList.toggle('fist', cooling);
      this.spellLabel.textContent = cooling ? 'GAUNTLET' : (spell.short ?? spell.label).toUpperCase();
      this.spellIcon.innerHTML = iconSvg(cooling ? 'gauntlet' : spell.id);
      if (this.spellBadge) this.spellBadge.innerHTML = cooling ? iconSvg(spell.id) : '';
    }
    this.#ability(this.spell, prepared.visible ? currentPrepared?.remaining ?? 0 : Math.max(0, (local.spellReadyAt ?? 0) - serverNow), spell.cooldownSec);
    this.spell.classList.toggle('prepared-current', prepared.visible);
    this.spell.classList.toggle('preselect', prepared.phase === 'startup');
    this.#ability(this.dash, Math.max(0, local.dashReadyAt - serverNow));
    // the real cooldown counts down as in a match; the yard's mark says why the key works anyway
    this.spell.classList.toggle('practice', practiceOverride(local, 'spell', serverNow, practice));
    this.dash.classList.toggle('practice', practiceOverride(local, 'dash', serverNow, practice));
    this.#ultimate(local, serverNow, practice);
    this.#armour(steelStrength(local.steel, serverNow), local.steel?.calledAt);
    this.matchInfo.textContent = matchInfoText(snapshot, serverNow);
    const duel = duelScoreView(local, snapshot);
    if (this.duelScore) {
      this.duelScore.classList.toggle('hidden', !duel);
      if (duel) {
        this.duelMine.textContent = String(duel.mine);
        this.duelTheirs.textContent = String(duel.theirs);
        this.duelScore.setAttribute('aria-label', `You ${duel.mine}, ${duel.rival} ${duel.theirs}`);
      }
    }
    const btView = breakthroughHudView(local, snapshot, serverNow);
    this.matchInfo.classList.toggle('hidden', btView.visible);
    this.breakthroughHud.classList.toggle('hidden', !btView.visible);
    if (btView.visible) {
      this.breakthroughHud.dataset.team = btView.team;
      this.breakthroughHud.dataset.state = btView.stateKey;
      this.breakthroughHud.querySelector('[data-bt-team]').textContent = btView.teamLabel;
      this.breakthroughHud.querySelector('[data-bt-phase]').textContent = btView.phaseLabel;
      this.breakthroughHud.querySelector('[data-bt-clock]').textContent = btView.clock;
      this.breakthroughHud.querySelector('[data-bt-name]').textContent = btView.objectiveName;
      this.breakthroughHud.querySelector('[data-bt-state]').textContent = `${btView.stateLabel} ·${btView.progressPct}%`;
      this.breakthroughHud.querySelector('[data-bt-fill]').style.width = `${btView.progressPct}%`;
      this.breakthroughHud.querySelector('[data-bt-directive]').textContent = `${btView.directive} · [V] Mark`;
      const counts = [];
      if (btView.attackersCount > 0) counts.push(`▲ ${btView.attackersCount} ATT`);
      if (btView.defendersCount > 0) counts.push(`⛨ ${btView.defendersCount} DEF`);
      this.breakthroughHud.querySelector('[data-bt-counts]').textContent = counts.join(' · ') || (btView.distanceMeters !== null ? `${btView.distanceMeters}m away` : '');
    } else {
      this.objectiveWaypoint.classList.add('hidden');
    }

    this.deathCard.classList.toggle('hidden', local.alive);
    if (!local.alive) this.deathTimer.textContent = Math.max(0, local.respawnAt - serverNow).toFixed(1);
  }

  setPreparedSelector(view) {
    this.preparedSelector = view;
    if (this.preparedView) this.#preparedSpells(this.preparedView);
  }

  setPreparedInputMode(mode) {
    this.preparedInputMode = mode;
    if (this.preparedView) this.#preparedSpells(this.preparedView);
  }

  #preparedSpells(view) {
    this.preparedView = view;
    this.preparedPanel.hidden = !view.visible;
    if (!view.visible) { this.preparedSelector = null; return; }
    const docked = this.preparedInputMode !== 'touch' && Boolean(this.abilityRow);
    if (docked !== this.preparedDocked) {
      this.preparedDocked = docked;
      (docked ? this.abilityRow : this.root).append(this.preparedPanel);
      this.preparedPanel.classList.toggle('docked', docked);
    }
    this.preparedPanel.classList.toggle('selecting', Boolean(this.preparedSelector));
    const keyboard = this.preparedInputMode !== 'touch' || this.preparedSelector?.mode === 'keyboard';
    this.preparedPanel.dataset.input = keyboard ? 'keyboard' : 'touch';
    this.preparedPanel.classList.toggle('cancelled', Boolean(!keyboard && this.preparedSelector && !this.preparedSelector.highlight));
    const signature = view.spells.map(entry => entry.id).join(':');
    if (signature !== this.preparedSignature) {
      this.preparedSignature = signature;
      this.preparedPanel.innerHTML = '<small><span>Spells & Chivalry</span><b></b></small><div class="prepared-spell-row"></div><em></em>';
      this.preparedHeader = this.preparedPanel.querySelector('small>span');
      this.preparedTimer = this.preparedPanel.querySelector('small>b');
      this.preparedHint = this.preparedPanel.querySelector('em');
      const row = this.preparedPanel.querySelector('.prepared-spell-row');
      this.preparedSlots = new Map();
      for (const entry of view.spells) {
        const tile = document.createElement('div');
        tile.className = 'prepared-spell';
        tile.dataset.spell = entry.id;
        tile.innerHTML = `<kbd></kbd>${iconSvg(entry.id)}<span>${entry.spell.short ?? entry.spell.label}</span><b></b><i></i>`;
        row.append(tile);
        this.preparedSlots.set(entry.id, tile);
      }
    }
    const current = view.spells.find(entry => entry.current);
    const alternates = view.spells.filter(entry => !entry.current);
    const order = (keyboard ? view.spells : [alternates[0], current, alternates[1]].filter(Boolean)).map(entry => entry.id);
    if (this.preparedOrder?.join(':') !== order.join(':')) {
      const row = this.preparedPanel.querySelector('.prepared-spell-row');
      for (const id of order) row.append(this.preparedSlots.get(id));
      this.preparedOrder = order;
    }
    const activeSec = ultimateFor('chivalry').activeSec;
    this.preparedHeader.textContent = keyboard && this.preparedSelector ? 'CHOOSE A PREPARED SPELL' : view.phase === 'startup' ? 'Prepare your spells' : 'Spells & Chivalry';
    // (docked, the R tile beside it already counts Chivalry down)
    this.preparedTimer.textContent = view.phase === 'active' && !docked ? `${view.left.toFixed(1)}s` : '';
    this.preparedPanel.style.setProperty('--chivalry-left', `${Math.min(100, view.left / activeSec * 100)}%`);
    // how to use them, while that is worth saying: preparing, choosing, and the first moments of it
    const fresh = view.phase === 'active' && view.left > activeSec - PREPARED_HINT_SEC;
    this.preparedPanel.classList.toggle('quiet', docked && view.phase === 'active' && !fresh && !this.preparedSelector);
    for (const entry of view.spells) {
      const tile = this.preparedSlots.get(entry.id);
      const highlighted = this.preparedSelector?.highlight === entry.id;
      const status = view.phase === 'startup' ? 'PRESELECT' : entry.available ? 'READY' : entry.remaining > 0.01 ? `${entry.remaining.toFixed(1)}s` : 'GATHER';
      tile.classList.toggle('current', entry.current);
      tile.classList.toggle('highlighted', highlighted);
      tile.classList.toggle('cooling', !entry.available);
      // (its cooldown shades the tile from the top, as the ability tiles' do)
      tile.style.setProperty('--cooldown', String(Math.min(1, entry.remaining / Math.max(0.1, entry.spell.cooldownSec ?? 1))));
      tile.querySelector('kbd').textContent = String(view.spells.indexOf(entry) + 1);
      tile.querySelector('b').textContent = status;
      tile.querySelector('i').textContent = highlighted ? 'SELECTED' : entry.current ? 'EQUIPPED' : '';
      tile.setAttribute('aria-label', `${entry.spell.label}, ${status}${entry.current ? ', equipped' : ''}${highlighted ? ', selected' : ''}`);
    }
    const highlighted = view.spells.find(entry => entry.id === this.preparedSelector?.highlight);
    this.preparedHint.textContent = keyboard
      ? this.preparedSelector ? view.phase === 'startup' ? 'PRESS 1, 2 OR 3 TO PRESELECT' : 'PRESS 1, 2 OR 3 TO CAST · Q OR ESC TO CLOSE' : view.phase === 'startup' ? 'HOLD Q, THEN 1 / 2 / 3 TO PRESELECT' : 'TAP Q TO CAST · HOLD Q, THEN 1 / 2 / 3 TO CHOOSE AND CAST'
      : this.preparedSelector
      ? highlighted ? `${view.phase === 'startup' ? 'RELEASE TO PRESELECT' : highlighted.available ? 'RELEASE TO CAST' : 'RELEASE TO CHOOSE · UNAVAILABLE'} · ESC TO CANCEL` : 'RELEASE TO CANCEL'
      : view.phase === 'startup' ? 'HOLD Q TO PRESELECT' : 'TAP Q TO CAST · HOLD Q TO CHOOSE';
  }

  /** A key pressed that can do nothing yet (the spell cooling with nobody in reach of the gauntlet): the tile says so. */
  denied(ability) {
    const element = ability === 'spell' ? this.spell : ability === 'dash' ? this.dash : ability === 'ultimate' ? this.ultimate : null;
    if (!element) return;
    const touch = document.querySelector(`.touch-btn[data-action="${ability}"]`);
    for (const tile of [element, touch].filter(Boolean)) {
      tile.classList.remove('denied');
      void tile.offsetWidth;
      tile.classList.add('denied');
      clearTimeout(tile.deniedTimer);
      tile.deniedTimer = setTimeout(() => tile.classList.remove('denied'), 320);
    }
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
    value.textContent = ready ? 'READY' : `${remaining.toFixed(1)}s`;
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
   * name: whose they are (none for my own); a new line takes the place of the last. cues: a line said a beat at a time
   * ([{ at, text }]: seconds into it), each beat's words in place of the last as he gets to it, never before.
   */
  subtitle({ text, name = null, delay = 0, seconds = 2, speaker = null, cues = [] } = {}) {
    const line = this.subtitleLine;
    if (!line || !text) return;
    clearTimeout(this.subtitleShow);
    clearTimeout(this.subtitleHide);
    this.#clearCues();
    // (whose words are waiting to be shown, and then whose are up: a speaker cut off takes theirs away)
    this.subtitlePending = speaker;
    this.subtitleShow = setTimeout(() => {
      this.subtitlePending = null;
      this.subtitleSpeaker = speaker;
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
      this.subtitleCues = cues.map((cue) => setTimeout(() => { words.textContent = cue.text; }, Math.max(0, cue.at) * 1000));
    }, Math.max(0, delay) * 1000);
  }

  // the beats of a line not yet reached: never shown once it is over or cut off
  #clearCues() {
    for (const cue of this.subtitleCues ?? []) clearTimeout(cue);
    this.subtitleCues = [];
  }

  /**
   * `speaker` stopped speaking before their line was done (felled, or cut off by something else they say): their
   * caption fades as it always does, now, and one still waiting to be shown never is. Anyone else's stays.
   */
  subtitleCut(speaker) {
    const line = this.subtitleLine;
    if (!line || speaker === null || speaker === undefined) return;
    if (this.subtitlePending === speaker) {
      clearTimeout(this.subtitleShow);
      this.subtitlePending = null;
    }
    if (this.subtitleSpeaker === speaker && line.classList.contains('show')) {
      clearTimeout(this.subtitleHide);
      this.#clearCues();
      line.classList.remove('show');
      this.subtitleSpeaker = null;
    }
  }

  hit(kind = 'hit') {
    const marker = HIT_MARKERS[kind];
    if (!marker || (HIT_MARKERS[this.hitKind]?.priority ?? 0) > marker.priority) return;
    this.clearHit();
    this.hitKind = kind;
    this.crosshair.classList.add(kind);
    this.hitTimer = setTimeout(() => this.clearHit(), marker.milliseconds);
  }

  clearHit() {
    clearTimeout(this.hitTimer);
    this.hitTimer = null;
    this.hitKind = null;
    this.crosshair.classList.remove(...Object.keys(HIT_MARKERS));
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

  updateObjectiveWaypoint(screenPos, local, snapshot) {
    if (!this.objectiveWaypoint) return;
    if (!screenPos || snapshot?.mode !== 'BREAKTHROUGH' || !snapshot.objective || !local?.alive) {
      this.objectiveWaypoint.classList.add('hidden');
      return;
    }
    const obj = snapshot.objective;
    const dist = Math.max(0, Math.round(Math.hypot(obj.position.x - local.position.x, obj.position.z - local.position.z)));
    if (dist <= obj.radius && !screenPos.clamped) {
      this.objectiveWaypoint.classList.add('hidden');
      return;
    }
    const myTeam = local?.team ?? 'ATTACKERS';
    const isAttacker = myTeam === 'ATTACKERS';
    this.objectiveWaypoint.classList.remove('hidden');
    this.objectiveWaypoint.style.left = `${(screenPos.x * 100).toFixed(1)}%`;
    this.objectiveWaypoint.style.top = `${(screenPos.y * 100).toFixed(1)}%`;
    this.objectiveWaypoint.dataset.team = myTeam;
    this.objectiveWaypoint.dataset.clamped = screenPos.clamped ? 'true' : 'false';
    this.objectiveWaypoint.dataset.state = obj.contested ? 'contested' : obj.capturing ? 'capturing' : 'idle';
    this.objectiveWaypoint.querySelector('[data-wp-name]').textContent = (obj.name ?? 'OBJECTIVE').toUpperCase();
    const pct = Math.round((obj.progress ?? 0) * 100);
    this.objectiveWaypoint.querySelector('[data-wp-meta]').textContent = obj.contested
      ? `CONTESTED · ${dist}m`
      : pct > 0
        ? `${isAttacker ? 'CAPTURING' : 'LOSING'} ${pct}% · ${dist}m`
        : `${dist}m`;
  }

  updateRivalWaypoint(marker) {
    if (!this.rivalWaypoint) return;
    if (!marker) {
      this.rivalWaypoint.classList.add('hidden');
      return;
    }
    this.rivalWaypoint.classList.remove('hidden');
    this.rivalWaypoint.style.left = `${(marker.x * 100).toFixed(1)}%`;
    this.rivalWaypoint.style.top = `${(marker.y * 100).toFixed(1)}%`;
    this.rivalWaypoint.dataset.clamped = marker.clamped ? 'true' : 'false';
    if (Number.isFinite(marker.angle)) {
      this.rivalWaypoint.style.setProperty('--wp-angle', `${marker.angle.toFixed(1)}deg`);
    }
    const nameEl = this.rivalWaypoint.querySelector('[data-rival-name]');
    if (nameEl) nameEl.textContent = marker.name ?? 'RIVAL';
    const distEl = this.rivalWaypoint.querySelector('[data-rival-dist]');
    if (distEl) distEl.textContent = Number.isFinite(marker.dist) ? `${Math.round(marker.dist)} m` : '';
  }

  setScoreboard(snapshot, visible) {
    this.scoreboard.classList.toggle('hidden', !visible);
    if (!visible) return;
    if (snapshot.mode === 'BREAKTHROUGH') {
      const attackers = snapshot.players.filter((p) => p.team === 'ATTACKERS').sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      const defenders = snapshot.players.filter((p) => p.team === 'DEFENDERS').sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      const renderTeam = (title, list, cls) => `<h4 class="sb-team-head ${cls}">${title}</h4>` + list.map((p) =>
        `<div class="sb-row ${cls}"><span>${escapeHtml(p.name)}${p.actorKind === 'bot' ? ' <small>[BOT]</small>' : ''}</span><b>${p.kills} K</b><em>${p.deaths} D · ${p.parries ?? 0} P</em></div>`
      ).join('');
      const worldTitle = snapshot.worldId === 'blackbell-foundry' ? 'BLACKBELL FOUNDRY' : 'BASTION BREACH';
      this.scoreboard.innerHTML = `<h3>BREAKTHROUGH · ${worldTitle}</h3>${renderTeam('ATTACKERS · AZURE HOST', attackers, 'team-att')}${renderTeam('DEFENDERS · CRIMSON GUARD', defenders, 'team-def')}`;
      return;

    }
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
