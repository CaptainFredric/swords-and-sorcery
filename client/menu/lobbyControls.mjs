import { arenasForMode } from '../../shared/src/modes.mjs';
import { WORLD_NAMES, modeLabel } from './lobbyView.mjs';
import { SIEGE_ROOM_RULES } from '../../shared/src/roomSettings.mjs';

const rendered = new WeakMap();
export function stableLobbyMarkup(element, html) {
  if (!element || rendered.get(element) === html) return;
  element.innerHTML = html;
  rendered.set(element, html);
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function arenaOptions(mode, selected) {
  const worlds = arenasForMode(mode);
  return worlds.map(id=>`<option value="${id}"${id===selected?' selected':''}>${WORLD_NAMES[id]??id}</option>`).join('');
}
const TEAM_RULE_MODES = ['BREAKTHROUGH', 'HIGH_GROUNDS', 'SIEGE_BLADES'];
/** A Siege Blades room's rules in words: a fixed number of rounds, or an endless exhibition and its cap. */
export function siegeRulesText(rules) {
  if (rules?.format === 'ENDLESS') return rules.endlessRoundCap ? `ENDLESS · CAP ${rules.endlessRoundCap}` : 'ENDLESS · NO CAP';
  return `${rules?.matchRounds ?? 3} ROUNDS`;
}
const choice = (name, values, selected, label) => `<select name="${name}" class="game-input">${values.map((value) =>
  `<option value="${value}"${String(value) === String(selected) ? ' selected' : ''}>${label(value)}</option>`).join('')}</select>`;
/** Siege Blades plays rounds on its own clock: its format and rounds stand in for a match time. */
export function siegeRuleFields(rules = {}, shown = false, teamSize = 1) {
  const r = { ...SIEGE_ROOM_RULES.defaults, ...(rules ?? {}) }, hide = (on) => (on ? '' : ' hidden');
  const clashShown = shown && r.format === 'ENDLESS' && Number(teamSize) === 1;
  return `<label data-siege-field="format"${hide(shown)}>FORMAT${choice('format', SIEGE_ROOM_RULES.formats, r.format, (v) => (v === 'MATCH' ? 'MATCH' : 'ENDLESS EXHIBITION'))}</label>
    <label data-siege-field="rounds"${hide(shown && r.format !== 'ENDLESS')}>ROUNDS${choice('matchRounds', SIEGE_ROOM_RULES.matchRounds, r.matchRounds, (v) => `${v} ROUNDS`)}</label>
    <label data-siege-field="cap"${hide(shown && r.format === 'ENDLESS')}>ROUND CAP${choice('endlessRoundCap', [10, 25, 50, 0], r.endlessRoundCap, (v) => (v ? `${v} ROUNDS` : 'NO CAP'))}</label>
    <label data-siege-field="clash"${hide(clashShown)}>CLASH STARTS${choice('clashStarts', ['on', 'off'], r.clashStarts === false ? 'off' : 'on', (v) => (v === 'on' ? 'ENABLED' : 'DISABLED'))}</label>`;
}
/** Shows the fields a mode's rules use on a room form (score, time, sides, bots, Siege rounds); resetTime restores its default clock. */
export function syncRuleForm(form, mode, { resetTime = false } = {}) {
  const team = TEAM_RULE_MODES.includes(mode), siege = mode === 'SIEGE_BLADES', show = (sel, on) => { const el = form.querySelector(sel); if (el) el.hidden = !on; };
  show('[data-score-field]', mode === 'FFA');
  show('[data-time-field]', !siege);
  show('[data-team-field]', team);
  show('[data-bot-field]', team || mode === 'EDGE_OF_VICTORY');
  for (const option of form.elements.teamSize?.options ?? []) {
    const fits = option.value === '1' ? siege : option.value === '5' ? mode === 'RESTLESS_DAY' : true;
    option.hidden = option.disabled = !fits;
  }
  if (team && form.elements.teamSize?.selectedOptions[0]?.disabled) form.elements.teamSize.value = siege ? '1' : '3';
  const endless = form.elements.format?.value === 'ENDLESS';
  const clash = siege && endless && Number(form.elements.teamSize?.value ?? 1) === 1;
  show('[data-siege-field="format"]', siege);
  show('[data-siege-field="rounds"]', siege && !endless);
  show('[data-siege-field="cap"]', siege && endless);
  show('[data-siege-field="clash"]', clash);
  if (resetTime && form.elements.minutes) form.elements.minutes.value = mode === 'HIGH_GROUNDS' ? 12 : mode === 'BREAKTHROUGH' ? 5 : 6;
}
/** The settings a room form asks the server for, or the reason it cannot. */
export function ruleFormSettings(form, mode) {
  const f = form.elements, siege = mode === 'SIEGE_BLADES';
  const minutes = Number(f.minutes?.value), score = Number(f.scoreToWin?.value);
  if (!siege && (!f.minutes?.value || !Number.isFinite(minutes) || minutes < 1 || minutes > 30))
    return { error: 'Choose a match time from 1 to 30 minutes.' };
  if (mode === 'FFA' && (!Number.isInteger(score) || score < 1 || score > 100)) return { error: 'Choose a Free-for-All score from 1 to 100.' };
  const settings = { mode, worldId: f.worldId.value, ...(siege ? {} : { matchSeconds: Math.round(minutes * 60) }) };
  if (mode === 'FFA') settings.scoreToWin = score;
  else if (mode === 'EDGE_OF_VICTORY') settings.botSkill = f.botSkill.value;
  else Object.assign(settings, { teamSize: Number(f.teamSize.value), botSkill: f.botSkill.value });
  if (siege) {
    const endlessOne = f.format.value === 'ENDLESS' && Number(f.teamSize.value) === 1;
    Object.assign(settings, {
      format: f.format.value,
      matchRounds: Number(f.matchRounds.value),
      endlessRoundCap: Number(f.endlessRoundCap.value),
      clashStarts: endlessOne && f.clashStarts ? f.clashStarts.value === 'on' : null,
    });
  }
  return { settings };
}
export function lobbyControls(message, localId) {
  if (message.roomState !== 'WAITING' || !['FFA','BREAKTHROUGH','HIGH_GROUNDS','RESTLESS_DAY','EDGE_OF_VICTORY','SIEGE_BLADES'].includes(message.mode)) return '';
  const host = message.hostId === localId;
  if (!host) {
    const teams=message.mode==='BREAKTHROUGH'||message.mode==='HIGH_GROUNDS'||message.mode==='SIEGE_BLADES';
    return `<div class="lobby-readonly"><p class="small-copy">The room host sets these rules:</p>
      <dl><div><dt>MODE</dt><dd>${modeLabel(message.mode)}</dd></div>
      <div><dt>ARENA</dt><dd>${escape(WORLD_NAMES[message.worldId]??message.worldId)}</dd></div>
      ${message.mode==='SIEGE_BLADES'?`<div><dt>ROUNDS</dt><dd>${siegeRulesText(message.siegeRules)}${message.teamSize===1&&message.siegeRules?.format==='ENDLESS'&&typeof message.siegeRules?.clashStarts==='boolean'?(message.siegeRules.clashStarts?' · CLASH ON':' · CLASH OFF'):''}</dd></div>`
        :`<div><dt>TIME</dt><dd>${Math.round((message.matchSeconds??360)/60)} MIN</dd></div>`}
      ${message.mode==='EDGE_OF_VICTORY'?'<div><dt>VICTORY</dt><dd>LAST KNIGHT STANDING</dd></div>':teams?`<div><dt>TEAMS</dt><dd>${message.teamSize??3}V${message.teamSize??3}</dd></div>
        <div><dt>BOT SKILL</dt><dd>${escape((message.botSkill??'knight').toUpperCase())}</dd></div>`
        :`<div><dt>FIRST TO</dt><dd>${message.scoreToWin??10}</dd></div>`}</dl></div>`;
  }
  const team = message.mode === 'BREAKTHROUGH' || message.mode === 'HIGH_GROUNDS' || message.mode === 'SIEGE_BLADES';
  const fields = `<form class="lobby-config" novalidate>
    <label>MODE<select name="mode" class="game-input">
      <option value="FFA"${message.mode==='FFA'?' selected':''}>FREE-FOR-ALL</option>
      <option value="BREAKTHROUGH"${message.mode==='BREAKTHROUGH'?' selected':''}>BREAKTHROUGH</option>
      <option value="HIGH_GROUNDS"${message.mode==='HIGH_GROUNDS'?' selected':''}>HIGH GROUNDS</option>
      <option value="RESTLESS_DAY"${message.mode==='RESTLESS_DAY'?' selected':''}>RESTLESS DAY</option>
      <option value="EDGE_OF_VICTORY"${message.mode==='EDGE_OF_VICTORY'?' selected':''}>EDGE OF VICTORY</option>
      <option value="SIEGE_BLADES"${message.mode==='SIEGE_BLADES'?' selected':''}>SIEGE BLADES</option>
    </select></label>
    <label>ARENA<select name="worldId" class="game-input">${arenaOptions(message.mode,message.worldId)}</select></label>
    <label data-score-field${team||message.mode==='EDGE_OF_VICTORY'?' hidden':''}>FIRST TO<input name="scoreToWin" class="game-input" type="number" inputmode="numeric" min="1" max="100" step="1" value="${Number.isFinite(message.scoreToWin)?message.scoreToWin:10}"></label>
    <label data-time-field${message.mode==='SIEGE_BLADES'?' hidden':''}>MATCH TIME · MINUTES<input name="minutes" class="game-input" type="number" inputmode="decimal" min="1" max="30" step="any" value="${(message.matchSeconds??(team?300:360))/60}"></label>
    ${siegeRuleFields(message.siegeRules, message.mode==='SIEGE_BLADES', message.teamSize)}
    <label data-team-field${team?'':' hidden'}>SIDES<select name="teamSize" class="game-input"><option value="1"${message.teamSize===1?' selected':''}${message.mode==='SIEGE_BLADES'?'':' hidden disabled'}>1V1</option><option value="2"${message.teamSize===2?' selected':''}>2V2</option><option value="3"${message.teamSize===3?' selected':''}>3V3</option><option value="5"${message.teamSize===5?' selected':''} hidden disabled>5V5</option></select></label>
    <label data-bot-field${team||message.mode==='EDGE_OF_VICTORY'?'':' hidden'}>BOT DIFFICULTY<select name="botSkill" class="game-input">
    ${[['squire','SQUIRE'],['knight','KNIGHT'],['champion','CHAMPION'],['spellblade','THE SPELLBLADE']].map(([key,label])=>`<option value="${key}"${key===(message.botSkill??'knight')?' selected':''}>${label}</option>`).join('')}
    </select></label>
    <button type="submit" class="join-button">APPLY SETTINGS</button>
    <small>Only the host may change rules. Changes clear readiness.</small>
  </form>`;
  if (!team) return fields;
  const players = message.players??[], opponent=players.find(p=>p.team!==players[0]?.team)?.id;
  const options=selected=>players.map(p=>`<option value="${escape(p.id)}"${p.id===selected?' selected':''}>${escape(p.name)} · ${p.team==='ATTACKERS'?'Attackers':'Defenders'}${p.actorKind==='bot'?' · Bot':''}</option>`).join('');
  return fields+`<details class="lobby-arrange"><summary>ARRANGE TEAMS</summary><form class="lobby-swap">
    <label>FIRST POSITION<select name="firstId" class="game-input">${options(players[0]?.id)}</select></label>
    <label>OTHER SIDE<select name="secondId" class="game-input">${options(opponent)}</select></label>
    <button type="submit" class="join-button">SWAP POSITIONS</button></form></details>`;
}
