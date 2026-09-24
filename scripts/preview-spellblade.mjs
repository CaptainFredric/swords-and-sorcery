// Local review only: serve candidate assets without changing promotion or the tracked manifest.
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { createGameServer } from '../server/src/server.mjs';

const directory = path.resolve(process.argv[2] || 'artifacts/spellblade-assets');
const port = Number(process.env.PREVIEW_PORT || 3100);
const report = JSON.parse(fs.readFileSync(path.join(directory, 'spellblade-build-report.json'), 'utf8'));
const contract = JSON.parse(fs.readFileSync(new URL('../tools/blender/characters/spellblade/contract.json', import.meta.url), 'utf8'));
const revision = report.sourceRevision;
if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error('Candidate report requires sourceRevision');
for (const file of ['spellblade.glb', 'spellblade-fp.glb']) {
  if (!fs.statSync(path.join(directory, file)).isFile()) throw new Error(`Missing ${file}`);
}
const base = '/client/assets/characters/spellblade';
const manifest = {
  version: 1, sourceRevision: revision, reviewOnly: true,
  thirdPerson: { url: `${base}/spellblade.glb?v=${revision}`, clips: contract.clips },
  firstPerson: { url: `${base}/spellblade-fp.glb?v=${revision}`, clips: contract.firstPersonClips },
  sockets: contract.sockets, mutableMaterials: contract.mutableMaterials,
  firstPersonMutableMaterials: contract.firstPersonMutableMaterials,
};
const game = createGameServer({ host: '127.0.0.1', port: 0 });
await game.start();
const upstream = game.address().port;
const proxy = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === `${base}/manifest.json`) {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(manifest));
  } else if ([`${base}/spellblade.glb`, `${base}/spellblade-fp.glb`].includes(pathname)) {
    response.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Cache-Control': 'no-store' });
    fs.createReadStream(path.join(directory, path.basename(pathname))).pipe(response);
  } else {
    const forwarded = http.request({ hostname: '127.0.0.1', port: upstream, method: request.method, path: request.url, headers: request.headers }, (reply) => {
      response.writeHead(reply.statusCode, reply.headers);
      reply.pipe(response);
    });
    forwarded.on('error', () => { response.writeHead(502); response.end(); });
    request.pipe(forwarded);
  }
});
proxy.on('upgrade', (request, socket, head) => {
  const target = net.connect(upstream, '127.0.0.1', () => {
    target.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n`);
    for (let i = 0; i < request.rawHeaders.length; i += 2) target.write(`${request.rawHeaders[i]}: ${request.rawHeaders[i + 1]}\r\n`);
    target.write('\r\n');
    if (head.length) target.write(head);
    socket.pipe(target).pipe(socket);
  });
  target.on('error', () => socket.destroy());
  socket.on('error', () => target.destroy());
  socket.on('close', () => target.destroy());
});
proxy.listen(port, '127.0.0.1', () => console.log(`Spellblade candidate review: http://127.0.0.1:${port}\nSource revision: ${revision}\nTracked promotion state is unchanged.`));
async function close() { proxy.close(); await game.stop(); process.exit(0); }
process.on('SIGINT', close);
process.on('SIGTERM', close);
