// Reuses the repository's Chrome/CDP transport. Tests only files read from the exported ZIP.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { CdpClient } from '../browser-cdp.mjs';
import { validateArchive, unzip } from './archive.mjs';

const directory = path.resolve(process.argv[2] || 'dist/html5');
const report = await validateArchive(directory);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'castleward-release-'));
const root = path.join(temp, 'export'), profile = path.join(temp, 'chrome');
await fs.mkdir(root); await fs.mkdir(profile);
execFileSync('unzip', ['-qq', report.zip, '-d', root]);
const prefix = '/html/verified/';
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith(prefix)) { res.writeHead(404).end(); return; }
    const relative = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
    const content = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}${prefix}?debug`;
console.log('Testing exported client',url);
const chromeBin = process.env.CHROME_BIN || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const chrome = spawn(chromeBin, [
  '--headless=new',
  '--no-sandbox',
  '--enable-unsafe-swiftshader',
  '--disable-dev-shm-usage',
  '--disable-features=MacAppCodeSignClone',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--disable-ipc-flooding-protection',
  '--remote-allow-origins=*',
  '--window-size=1280,800',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, timeout = 45_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      if (await fn()) return;
    } catch {
      // Ignore transient evaluation/navigation failures during polling
    }
    await sleep(150);
  }
  throw new Error(`Browser check timed out: ${label}`);
}
let cdp;
const errors = [], resources = [], checks = {};
try {
  let port;
  await until(async () => { try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); return port > 0; } catch { return false; } }, 'Chrome launch');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  cdp = new CdpClient(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await cdp.connect();
  const evaluate = async expression => {
    const response = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result?.value;
  };
  cdp.on('Runtime.exceptionThrown', event => errors.push(event.exceptionDetails?.text || 'Fatal client exception'));
  cdp.on('Network.responseReceived', ({ response }) => { if (response.url.startsWith(url.split('?')[0])) resources.push({ url: response.url, status: response.status }); });
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
  const visible = selector => evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)});return !!e && !e.hidden && !e.classList.contains('hidden') && e.getBoundingClientRect().height>0;})()`);
  const click = async selector => {
    if (selector !== '#game-canvas canvas') {
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
      return;
    }
    const point = await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return null; e.scrollIntoView({block:'center',behavior:'instant'}); const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    assert(point, `Missing ${selector}`);
    await cdp.send('Input.dispatchMouseEvent', {type:'mouseMoved',...point});
    for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  };
  const key = (code, down) => cdp.send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', code, key: code === 'Escape' ? 'Escape' : code.replace('Key', '').toLowerCase(), windowsVirtualKeyCode: code === 'Escape' ? 27 : code.replace('Key', '').charCodeAt(0) });
  const state = () => evaluate(`(() => {const r=window.__ssRuntime,p=r?.localAuth;return {position:p?.position,yaw:r?.input.yaw,guard:p?.guarding,attack:p?.attackActive,cast:p?.castingSpell,ready:p?.spellReadyAt,enabled:r?.input.enabled,world:r?.worldId};})()`);
  const screenshot = async name => fs.writeFile(path.join(directory, name), Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  const loadMenu = async () => {
    await cdp.send('Page.navigate', { url });
    await cdp.send('Page.bringToFront');
    await until(() => evaluate("document.querySelector('#loading-veil')?.classList.contains('done') && !!document.querySelector('#menu-spellblade canvas')"), 'main menu and WebGL');
    if (await visible('#tutorial-onboarding')) await click('[data-tutorial-onboarding-skip]');
    if (await visible('#show-menu')) await click('#show-menu');
    checks.menu = true;
  };
  const setName = () => evaluate("(()=>{const e=document.querySelector('#player-name');e.value='Release tester';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  const practice = async () => {
    await setName(); await click('#solo-button'); await until(()=>visible('#solo-menu'),'Solo menu'); await sleep(250); await click('#practice-mode');
    await until(async () => (await visible('#hud')) && (await state()).position, 'Practice Yard');
  };
  await loadMenu(); await until(()=>evaluate("globalThis.__SPELLBLADE_ASSET_STATUS__?.menu?.kind==='glb'"),'production menu GLB'); await screenshot('candidate-menu.png');
  const release = await (await fetch(url.split('?')[0] + 'release.json')).json();
  assert.equal(release.revision, report.revision);
  await practice(); checks.practice = true;
  await until(()=>evaluate("globalThis.__SPELLBLADE_ASSET_STATUS__?.firstPerson?.kind==='glb'"),'production first person GLB');
  await sleep(900);
  console.log('Desktop canvas target', await evaluate(`(()=>{const e=document.querySelector('#game-canvas canvas'),r=e.getBoundingClientRect();return {rect:{x:r.x,y:r.y,width:r.width,height:r.height},hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,200),focused:document.hasFocus(),width:innerWidth,height:innerHeight};})()`));
  await click('#game-canvas canvas');
  await until(() => evaluate('!!document.pointerLockElement'), 'desktop Pointer Lock');
  await until(()=>evaluate('!!window.__ssRuntime?.sound?.running'),'audio gesture activation');
  const before = await state();
  await key('KeyW', true);
  let moved;
  try { await until(async()=>{moved=await state();return Math.hypot(moved.position.x-before.position.x,moved.position.z-before.position.z)>.5;},'authoritative movement while key held',15_000); }
  finally { await key('KeyW',false); }

  assert(Math.hypot(moved.position.x - before.position.x, moved.position.z - before.position.z) > .5, 'Ordinary movement did not reach authority'); checks.movement = true;
  await key('KeyG', true); await until(async () => (await state()).guard, 'Guard'); checks.guard = true; await key('KeyG', false);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 400, button: 'left', buttons: 1, clickCount: 1 });
  await until(async () => (await state()).attack, 'sword attack'); checks.sword = true;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 400, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(1800); const ready = (await state()).ready;
  await key('KeyQ', true); await key('KeyQ', false);
  await until(async () => {const s=await state();return s.cast || s.ready>ready;}, 'Fireball'); checks.fireball = true;
  await screenshot('candidate-practice.png');
  await key('Escape', true); await key('Escape', false);
  await until(() => evaluate('!document.pointerLockElement'), 'release pointer');
  await click('#practice-leave'); await until(() => visible('#menu'), 'leave Practice'); checks.leave = true;
  await click('#solo-button'); await until(()=>visible('#solo-menu'),'Solo menu for tutorial'); await sleep(250); await click('#tutorial-mode');
  await until(() => evaluate("window.__ssRuntime?.worldId==='greener-pastures' && !document.querySelector('#tutorial-overlay')?.hidden"), 'Tutorial world');
  await until(() => evaluate("document.querySelector('[data-tutorial-line]')?.textContent.trim().length>0"), 'Tutorial captions');
  await until(() => resources.some(resource => /tutorial-voice\/.*\.(?:ogg|mp3|m4a|wav)(?:\?|$)/.test(resource.url) && resource.status === 200), 'recorded audio resource');
  await until(()=>evaluate('window.__ssTutorialVoice?.buffers?.size>0'),'tutorial recording decoding');
  checks.tutorial = true; await screenshot('candidate-tutorial.png');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true, screenOrientation: {type:'landscapePrimary',angle:90} });
  await cdp.send('Emulation.setUserAgentOverride', {userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',platform:'Linux armv8l'});
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await loadMenu(); await practice();
  const tap = async (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  console.log('Mobile device',await evaluate('JSON.stringify({touch:navigator.maxTouchPoints,coarse:matchMedia("(pointer:coarse)").matches,classes:document.body.className,controls:!!window.__ssRuntime?.touch})'));
  await tap('touchStart', [{ x: 420, y: 170, id: 1 }]); await sleep(100); await tap('touchEnd', []);
  await until(async () => (await state()).enabled, 'touch arena focus');
  const stick = await evaluate("(()=>{const r=document.querySelector('.touch-stick').getBoundingClientRect();return{x:r.x+r.width*.7,y:r.y+r.height*.5};})()");
  const preTouch = await state();
  await tap('touchStart', [{ ...stick, id: 1 }, { x: 610, y: 145, id: 2 }]);
  await tap('touchMove', [{ x: stick.x, y: stick.y - 45, id: 1 }, { x: 680, y: 160, id: 2 }]);
  let postTouch;
  try { await until(async()=>{postTouch=await state();return Math.hypot(postTouch.position.x-preTouch.position.x,postTouch.position.z-preTouch.position.z)>.5 && Math.abs(postTouch.yaw-preTouch.yaw)>.05;},'simultaneous authoritative touch look and movement',15_000); }
  finally {await tap('touchEnd',[]);}
  assert(Math.hypot(postTouch.position.x - preTouch.position.x, postTouch.position.z - preTouch.position.z) > .5, 'Landscape movement failed');
  assert(Math.abs(postTouch.yaw - preTouch.yaw) > .05, 'Simultaneous landscape look failed'); checks.mobileLookAndMove = true;
  await screenshot('candidate-touch.png');
  assert(resources.some(resource => /spellblade-fp\.glb/.test(resource.url) && resource.status === 200));
  assert(resources.some(resource => /\/spellblade\.glb/.test(resource.url) && resource.status === 200));
  assert(!resources.some(resource => resource.status >= 400), 'Exported dependency failed to load');
  assert.equal(errors.length, 0, errors.join('\n')); checks.assets = true;
  const result = { passed: true, browserInput: 'CDP input events; ordinary menu DOM button activation', audioActivation: 'ordinary desktop arena gesture', revision: report.revision, sha256: report.sha256, nestedPath: prefix, checks, errors, resources: resources.length, desktop: { before, moved }, mobile: { before: preTouch, after: postTouch }, physicalPhone: 'manual acceptance remains required' };
  await fs.writeFile(path.join(directory, 'browser-check.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} catch (error) {
  if (cdp) {
    const shot=await cdp.send('Page.captureScreenshot',{format:'png'}).catch(()=>null);
    if(shot) await fs.writeFile(path.join(directory,'candidate-failure.png'),Buffer.from(shot.data,'base64'));
    const state=await cdp.send('Runtime.evaluate',{expression:'JSON.stringify({text:document.body.innerText.slice(-12000),debug:!!window.__ssRuntime,errors:window.__ssRuntime?.worldError,playing:window.__ssRuntime?.playing,position:window.__ssRuntime?.localAuth?.position,input:window.__ssRuntime?.lastSentInput,enabled:window.__ssRuntime?.input.enabled,locked:!!document.pointerLockElement})',returnByValue:true}).catch(()=>null);
    console.error(JSON.stringify({failure:error.message,state,errors,resources:resources.filter(r=>r.status>=400)},null,2));
  }
  throw error;
} finally {
  cdp?.close(); chrome.kill('SIGTERM'); server.close();
  await fs.rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
