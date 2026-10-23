import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { runBiByeGameplay } from './bibye-browser-inputs.mjs';
export * from './bibye-browser-inputs.mjs';

if (globalThis.process?.argv?.[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    const result = await runBiByeGameplay(page, process.env.BALLISTA_TEST_URL || 'http://127.0.0.1:3228/?debug');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
}
