import { ARENAS, BREAKTHROUGH_ARENAS, HIGH_GROUNDS_ARENAS, RESTLESS_DAY_ARENAS, EDGE_OF_VICTORY_ARENAS } from '../../shared/src/modes.mjs';
import { WORLD_NAMES } from './lobbyView.mjs';

const rendered = new WeakMap();
export function stableLobbyMarkup(element, html) {
  if (!element || rendered.get(element) === html) return;
  element.innerHTML = html;
  rendered.set(element, html);
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function arenaOptions(mode, selected) {
  const worlds = mode === 'BREAKTHROUGH' ? BREAKTHROUGH_ARENAS
    : mode === 'HIGH_GROUNDS' ? HIGH_GROUNDS_ARENAS
    : mode === 'RESTLESS_DAY' ? RESTLESS_DAY_ARENAS
    : mode === 'EDGE_OF_VICTORY' ? EDGE_OF_VICTORY_ARENAS
    : ARENAS;
  return worlds.map(id=>`<option value="${id}"${id===selected?' selected':''}>${WORLD_NAMES[id]??id}</option>`).join('');
}
export function lobbyControls(message, localId) {
  if (message.roomState !== 'WAITING' || !['FFA','BREAKTHROUGH','HIGH_GROUNDS','RESTLESS_DAY','EDGE_OF_VICTORY'].includes(message.mode)) return '';
  const host = message.hostId === localId;
  if (!host) {
    const teams=message.mode==='BREAKTHROUGH'||message.mode==='HIGH_GROUNDS';
    return `<div class="lobby-readonly"><p class="small-copy">The room host sets these rules:</p>
      <dl><div><dt>MODE</dt><dd>${message.mode.replaceAll('_',' ')}</dd></div>
      <div><dt>ARENA</dt><dd>${escape(WORLD_NAMES[message.worldId]??message.worldId)}</dd></div>
      <div><dt>TIME</dt><dd>${Math.round((message.matchSeconds??360)/60)} MIN</dd></div>
      ${message.mode==='EDGE_OF_VICTORY'?'<div><dt>VICTORY</dt><dd>LAST KNIGHT STANDING</dd></div>':teams?`<div><dt>TEAMS</dt><dd>${message.teamSize??3}V${message.teamSize??3}</dd></div>
        <div><dt>BOT SKILL</dt><dd>${escape((message.botSkill??'knight').toUpperCase())}</dd></div>`
        :`<div><dt>FIRST TO</dt><dd>${message.scoreToWin??10}</dd></div>`}</dl></div>`;
  }
  const team = message.mode === 'BREAKTHROUGH' || message.mode === 'HIGH_GROUNDS';
  const fields = `<form class="lobby-config" novalidate>
    <label>MODE<select name="mode" class="game-input">
      <option value="FFA"${message.mode==='FFA'?' selected':''}>FREE-FOR-ALL</option>
      <option value="BREAKTHROUGH"${message.mode==='BREAKTHROUGH'?' selected':''}>BREAKTHROUGH</option>
      <option value="HIGH_GROUNDS"${message.mode==='HIGH_GROUNDS'?' selected':''}>HIGH GROUNDS</option>
      <option value="RESTLESS_DAY"${message.mode==='RESTLESS_DAY'?' selected':''}>RESTLESS DAY</option>
      <option value="EDGE_OF_VICTORY"${message.mode==='EDGE_OF_VICTORY'?' selected':''}>EDGE OF VICTORY</option>
    </select></label>
    <label>ARENA<select name="worldId" class="game-input">${arenaOptions(message.mode,message.worldId)}</select></label>
    <label data-score-field${team||message.mode==='EDGE_OF_VICTORY'?' hidden':''}>FIRST TO<input name="scoreToWin" class="game-input" type="number" inputmode="numeric" min="1" max="100" step="1" value="${Number.isFinite(message.scoreToWin)?message.scoreToWin:10}"></label>
    <label>MATCH TIME · MINUTES<input name="minutes" class="game-input" type="number" inputmode="decimal" min="1" max="30" step="any" value="${(message.matchSeconds??(team?300:360))/60}" required></label>
    <label data-team-field${team?'':' hidden'}>SIDES<select name="teamSize" class="game-input"><option value="2"${message.teamSize===2?' selected':''}>2V2</option><option value="3"${message.teamSize===3?' selected':''}>3V3</option><option value="5"${message.teamSize===5?' selected':''}>5V5</option></select></label>
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
