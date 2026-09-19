import { combatStatusDurationMs } from '../game/combatFeedbackTiming.mjs';

export function matchInfoText(snapshot, serverNow) {
  if (snapshot?.mode === 'PRACTICE') return 'PRACTICE YARD  ·  UNTIMED';
  if (snapshot?.suddenDeath) return 'SUDDEN DEATH';
  const startedAt = Number.isFinite(snapshot?.matchStartedAt) ? snapshot.matchStartedAt : serverNow;
  const elapsed = Math.max(0, serverNow - startedAt);
  const left = Math.max(0, 360 - elapsed);
  const mins = Math.floor(left / 60);
  const secs = Math.floor(left % 60).toString().padStart(2, '0');
  return `FIRST TO 10  ·  ${mins}:${secs}`;
}

export class HUD {
  constructor() {
    this.root = document.querySelector('#hud');
    this.healthValue = document.querySelector('#health-value');
    this.healthFill = document.querySelector('#health-fill');
    this.healthTrail = document.querySelector('#health-trail');
    this.guardBlock = document.querySelector('#guard-block');
    this.guardFill = document.querySelector('#guard-fill');
    this.fireball = document.querySelector('#fireball-ability');
    this.dash = document.querySelector('#dash-ability');
    this.matchInfo = document.querySelector('#match-info');
    this.feed = document.querySelector('#kill-feed');
    this.crosshair = document.querySelector('#crosshair');
    this.flash = document.querySelector('#status-flash');
    this.deathCard = document.querySelector('#death-card');
    this.deathKiller = document.querySelector('#death-killer');
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

    const guard = Math.max(0, Math.min(100, local.guardStamina));
    this.guardFill.style.width = `${guard}%`;
    this.guardBlock.classList.toggle('faded', !local.guarding && guard >= 99.5);

    this.#ability(this.fireball, Math.max(0, local.fireballReadyAt - serverNow));
    this.#ability(this.dash, Math.max(0, local.dashReadyAt - serverNow));
    this.matchInfo.textContent = matchInfoText(snapshot, serverNow);

    this.deathCard.classList.toggle('hidden', local.alive);
    if (!local.alive) this.deathTimer.textContent = Math.max(0, local.respawnAt - serverNow).toFixed(1);
  }

  #ability(element, remaining) {
    const value = element.querySelector('strong');
    const ready = remaining <= 0.01;
    element.classList.toggle('ready', ready);
    element.classList.toggle('cooling', !ready);
    value.textContent = ready ? 'READY' : remaining.toFixed(1);
    element.style.setProperty('--cooldown', String(Math.min(1, remaining / 5)));
  }

  flashText(text, kind = '', durationMs = null) {
    this.flash.textContent = text;
    this.flash.className = `status-flash show ${kind}`;
    clearTimeout(this.flashTimer);
    const duration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : combatStatusDurationMs(text);
    this.flashTimer = setTimeout(() => { this.flash.className = 'status-flash'; }, duration);
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

  setDeathKiller(name) { this.deathKiller.textContent = name || 'THE ABYSS'; }

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
    ].join('\n');
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
}
