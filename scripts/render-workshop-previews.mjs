import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createGameServer } from '../server/src/server.mjs';
import { launchAcceptanceChrome } from './acceptance-chrome.mjs';
import { CdpClient } from './browser-cdp.mjs';

const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = new URL('../client/assets/props/siege-portraits/', import.meta.url);

async function run() {
  const game = createGameServer({ port: 0, host: '127.0.0.1' });
  await game.start();
  const { port } = game.address();
  const profile = join(tmpdir(), `ss-workshop-renders-${Date.now()}`);
  await mkdir(profile, { recursive: true });
  const log = join(profile, 'chrome.log');
  const chrome = launchAcceptanceChrome(CHROME_BIN, profile, log, { width: 1280, height: 760 });
  let cdp = null;

  const evaluate = async (expression) => {
    const res = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, 60000);
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Evaluate failed');
    }
    return res.result?.value;
  };

  try {
    const target = await chrome.target();
    cdp = new CdpClient(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 760,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/?debug=1` });

    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      const ready = await evaluate(`Boolean(document.querySelector('#armory-button') && window.__ssMenu && document.querySelector('#loading-veil')?.classList.contains('done'))`);
      if (ready) break;
      await sleep(150);
    }

    await evaluate(`(() => {
      document.querySelector('#armory-button')?.click();
      document.querySelector('#armory-siege-tab')?.click();
      return true;
    })()`);
    await sleep(300);

    for (const id of ['soFist', 'biBye', 'fightFlight']) {
      await evaluate(`(async () => {
        document.querySelector('[data-siege-tab="${id}"]')?.click();
        const ws = window.__ssMenu?.siegeWorkshop;
        if (!ws) throw new Error('No siegeWorkshop');
        await ws.whenLoaded('${id}');
        const waitEnd = Date.now() + 15000;
        while (Date.now() < waitEnd) {
          if (ws.knight && ws.firstFrameRendered.has('${id}')) break;
          await new Promise(r => setTimeout(r, 80));
        }
        ws.resetRotation();
        return ws.getActiveModelStatus();
      })()`);
      await sleep(500);

      const box = await evaluate(`(() => {
        const img = document.querySelector('#siege-static-preview');
        if (img) img.hidden = true;
        const status = document.querySelector('#siege-model-status');
        if (status) status.hidden = true;
        const el = document.querySelector('#armory-siege .armory-preview');
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
      })()`);

      await sleep(80);
      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 },
      });

      const webpBase64 = await evaluate(`(async () => {
        const img = new Image();
        img.src = 'data:image/png;base64,${shot.data}';
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const url = canvas.toDataURL('image/webp', 0.92);
        return url.split(',')[1];
      })()`);

      const outPath = new URL(`workshop-${id}.webp`, OUT_DIR);
      const buf = Buffer.from(webpBase64, 'base64');
      await writeFile(outPath, buf);
      console.log(`[RENDER] workshop-${id}.webp (${box.width}x${box.height}, ${buf.length} bytes)`);
    }
  } finally {
    cdp?.close();
    chrome.child.kill('SIGKILL');
    await game.stop().catch(() => {});
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
