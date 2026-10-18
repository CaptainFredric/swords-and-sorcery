import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, validateArchive } from './archive.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function connection(url) {
  const ws = new WebSocket(url), messages = [];
  ws.addEventListener('message', event => { try { messages.push(JSON.parse(String(event.data))); } catch {} });
  const next = async (predicate, timeout = 12_000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const index = messages.findIndex(predicate);
      if (index >= 0) return messages.splice(index, 1)[0];
      if (ws.readyState === WebSocket.CLOSED) throw new Error('Compatibility probe connection closed');
      await pause(25);
    }
    throw new Error('Compatibility probe timed out waiting for authoritative response');
  };
  try { await next(m => m.type === 'hello'); } catch (error) { ws.close(); throw error; }
  return { ws, next, send: message => ws.send(JSON.stringify(message)) };
}

export async function probeSession(wsUrl) {
  const clients = [];
  try {
    const a = await connection(wsUrl); clients.push(a);
    a.send({ type: 'ping', sentAt: 12345 });
    await a.next(m => m.type === 'pong' && m.sentAt === 12345);
    a.send({ type: 'createRoom', name: 'Release probe' });
    const joined = await a.next(m => m.type === 'joined');
    const b = await connection(wsUrl); clients.push(b);
    b.send({ type: 'joinRoom', code: joined.roomCode, name: 'Release peer' });
    const peer = await b.next(m => m.type === 'joined');
    assert.equal(peer.roomCode, joined.roomCode);
    a.send({ type: 'ready', ready: true }); b.send({ type: 'ready', ready: true });
    await a.next(m => m.type === 'snapshot' && m.roomState === 'PLAYING');
    a.send({ type: 'input', seq: 431, forward: .4, right: 0, yaw: 0, pitch: 0, sprint: false });
    const snapshot = await a.next(m => m.type === 'snapshot' && m.players?.some(p => p.id === joined.playerId && p.lastInputSeq === 431));
    const player = snapshot.players.find(p => p.id === joined.playerId);
    for (const field of ['health', 'guardStamina', 'spellReadyAt', 'lastInputSeq']) assert(Number.isFinite(player[field]), `Missing ${field}`);
    assert(Array.isArray(player.preparedSpells) && Array.isArray(snapshot.projectiles));
    a.send({ type: 'input', seq: 432, forward: 0, right: 0, yaw: 0, pitch: 0 });
    a.send({ type: 'guard', down: true });
    await a.next(m => m.type === 'snapshot' && m.players?.some(p => p.id === joined.playerId && p.guarding));
    a.send({ type: 'guard', down: false });
    a.send({ type: 'attack', down: true });
    await a.next(m => m.type === 'snapshot' && m.players?.some(p => p.id === joined.playerId && p.attackActive));
    a.send({ type: 'attack', down: false });
    // Let the ordinary sword recovery finish before exercising the ordinary cast.
    await pause(1600);
    a.send({ type: 'cast', direction: { x: 0, y: .7, z: -.7 } });
    await a.next(m => m.type === 'snapshot' && (m.players?.some(p => p.id === joined.playerId && p.castingSpell) || m.projectiles?.some(p => p.ownerId === joined.playerId)));
    a.ws.close();
    await pause(150);
    const resumed = await connection(wsUrl); clients.push(resumed);
    resumed.send({ type: 'resume', token: joined.token });
    const restored = await resumed.next(m => m.type === 'joined');
    assert.equal(restored.playerId, joined.playerId);
    assert.equal(restored.roomCode, joined.roomCode);
    return { hello: true, ping: true, privateJoin: true, inputAcknowledged: true, guard: true, sword: true, cast: true, reconnect: true };
  } finally {
    for (const client of clients) {
      if (client.ws.readyState === WebSocket.OPEN) client.send({ type: 'leaveRoom' });
      client.ws.close();
    }
  }
}

export async function checkServer(directory, { base, attempts = 4 } = {}) {
  const report = await validateArchive(directory);
  base ??= report.server.replace(/^wss:/, 'https:').replace(/\/ws$/, '');
  const url = new URL(base);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) throw new Error('Compatibility target must use HTTPS or local testing');
  let healthy = false;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(20_000), cache: 'no-store' });
      healthy = response.ok && (await response.json()).ok === true;
      if (healthy) break;
    } catch { /* bounded Render cold start retry */ }
    if (attempt + 1 < attempts) await pause(5000);
  }
  if (!healthy) throw new Error('Render did not wake within the bounded compatibility check; retry after checking service status');
  // No protocol version exists today. Exact shared runtime + network adapter bytes are
  // a conservative compatibility lock, paired with actual authoritative commands below.
  const sources = report.entries.filter(entry => /^shared\/.*\.mjs$/.test(entry.path) || entry.path === 'client/network/GameSocket.mjs');
  let cursor = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (cursor < sources.length) {
      const entry = sources[cursor++];
      const response = await fetch(`${base}/${entry.path}`, { signal: AbortSignal.timeout(20_000), cache: 'no-store' });
      if (!response.ok || digest(Buffer.from(await response.arrayBuffer())) !== entry.sha256) throw new Error(`Server compatibility mismatch: ${entry.path}. Wait for the matching Render deployment or prepare a compatible candidate.`);
    }
  }));
  const session = await probeSession(base.replace(/^http/, 'ws') + '/ws');
  const result = { passed: true, revision: report.revision, sha256: report.sha256, checkedAt: new Date().toISOString(), server: report.server, sourcesMatched: sources.length, session };
  await writeFile(path.join(directory, 'server-check.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await checkServer(process.argv[2] || 'dist/html5'), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
