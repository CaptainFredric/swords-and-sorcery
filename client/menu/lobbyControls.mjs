import { ARENAS, BREAKTHROUGH_ARENAS } from '../../shared/src/modes.mjs';
import { WORLD_NAMES } from './lobbyView.mjs';

const rendered = new WeakMap();
export function stableLobbyMarkup(element, html) {
  if (!element || rendered.get(element) === html) return;
  element.innerHTML = html;
  rendered.set(element, html);
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function arenaOptions(mode, selected) {
  return (mode === 'BREAKTHROUGH' ? BREAKTHROUGH_ARENAS : ARENAS).map(id=>`<option value="${id}"${id===selected?' selected':''}>${WORLD_NAMES[id]??id}</option>`).join('');
}
export function lobbyControls(message, localId) {
  if (message.roomState !== 'WAITING' || !['FFA','BREAKTHROUGH'].includes(message.mode)) return '';
  const privateRoom=message.isPrivate===true,host=message.hostId===localId;
  if (!privateRoom && !message.votes) return '';
  if(privateRoom&&!host)return '<p class="small-copy">The room host sets the battlefield and match rules.</p>';
  const team=message.mode==='BREAKTHROUGH';
  const fields=`<form class="lobby-config" novalidate>
    ${privateRoom?`<label>MODE<select name="mode" class="game-input"><option value="FFA"${!team?' selected':''}>FREE FOR ALL</option><option value="BREAKTHROUGH"${team?' selected':''}>BREAKTHROUGH</option></select></label><label>ARENA<select name="worldId" class="game-input">${arenaOptions(message.mode,message.worldId)}</select></label>`:''}
    <label data-score-field${team?' hidden':''}>FIRST TO<input name="scoreToWin" class="game-input" type="number" inputmode="numeric" min="1" max="100" step="1" value="${Number.isFinite(message.scoreToWin)?message.scoreToWin:10}" required></label>
    <label>MATCH TIME · MINUTES<input name="minutes" class="game-input" type="number" inputmode="decimal" min="1" max="30" step="any" value="${(message.matchSeconds??(team?300:360))/60}" required></label>
    ${privateRoom?`<label data-team-field${!team?' hidden':''}>SIDES<select name="teamSize" class="game-input"><option value="2"${message.teamSize===2?' selected':''}>2v2</option><option value="3"${message.teamSize!==2?' selected':''}>3v3</option></select></label>`:''}
    <button type="submit" class="join-button">${privateRoom?'APPLY SETTINGS':'VOTE FOR THESE RULES'}</button>
    <small>${privateRoom?'Changes clear readiness.':'Majority decides at the start; tied votes keep the current rules.'}</small>
  </form>`;
  if(!privateRoom||!team)return fields;
  const players=message.players??[],opponent=players.find(p=>p.team!==players[0]?.team)?.id;
  const options=selected=>players.map(p=>`<option value="${escape(p.id)}"${p.id===selected?' selected':''}>${escape(p.name)} · ${p.team==='ATTACKERS'?'Attackers':'Defenders'}${p.actorKind==='bot'?' · Bot':''}</option>`).join('');
  return fields+`<details class="lobby-arrange"><summary>ARRANGE TEAMS</summary><form class="lobby-swap"><label>FIRST POSITION<select name="firstId" class="game-input">${options(players[0]?.id)}</select></label><label>OTHER SIDE<select name="secondId" class="game-input">${options(opponent)}</select></label><button type="submit" class="join-button">SWAP POSITIONS</button></form></details>`;
}
