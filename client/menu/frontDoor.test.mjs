import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MENU_SHOTS, aimAt } from './menuShots.mjs';
import { FIGHT_SHOT, mixClear } from './tour/tourCamera.mjs';
import { HERALD_NOTICES, heraldDate } from '../ui/heraldNotices.mjs';
import { heraldMarkup } from '../ui/HeraldPanel.mjs';

// The front door's Observation View, its idle yield, the Herald and the banner's foot: the camera given the whole stage
// by the same director, the round never touched, nothing hidden left reachable, Escape in its order.

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const main = source('../main.mjs');
const scene = source('./MenuScene.mjs');
const director = source('./tour/TourDirector.mjs');
const camera = source('./tour/tourCamera.mjs');
const html = source('../index.html');
const css = source('../menu.css');

// where a world point shows across the screen (0 left, 1 right) for a shot
function across(shot, point, aspect) {
  const look = [shot.target[0] - shot.camera[0], shot.target[2] - shot.camera[2]];
  const length = Math.hypot(...look);
  const to = [point[0] - shot.camera[0], point[2] - shot.camera[2]];
  const right = [-look[1] / length, look[0] / length];
  const x = to[0] * right[0] + to[1] * right[1];
  const z = (to[0] * look[0] + to[1] * look[1]) / length;
  return (x / z / (Math.tan((shot.fov * Math.PI) / 360) * aspect) + 1) / 2;
}

test('the front door\'s shot turned to give him the middle of the stage: same camera, same height, same lens', () => {
  const stage = [-1.0, 1.2, 5.5];
  const aspect = 16 / 9;
  assert.ok(across(MENU_SHOTS.main, stage, aspect) > 0.6, 'the front door sets him right of the banner');
  for (const share of [0.5, 0.54, 0.6]) {
    const turned = aimAt(MENU_SHOTS.main, stage, { share, aspect });
    assert.ok(Math.abs(across(turned, stage, aspect) - share) < 0.01, `at ${share}`);
    assert.deepEqual(turned.camera, [...MENU_SHOTS.main.camera]);
    assert.equal(turned.target[1], MENU_SHOTS.main.target[1]);
    assert.equal(turned.fov, MENU_SHOTS.main.fov);
  }
});

test('the stage between the banner\'s and the whole screen\'s: eased, and every fight checked from both cameras', () => {
  assert.deepEqual(mixClear([0.4, 0.96], FIGHT_SHOT.observeClear, 0), [0.4, 0.96]);
  mixClear([0.4, 0.96], FIGHT_SHOT.observeClear, 1).forEach((share, i) => assert.ok(Math.abs(share - FIGHT_SHOT.observeClear[i]) < 1e-9));
  const half = mixClear([0.4, 0.96], FIGHT_SHOT.observeClear, 0.5);
  assert.ok(Math.abs(half[0] - 0.25) < 1e-9 && Math.abs(half[1] - 0.93) < 1e-9);
  assert.ok(FIGHT_SHOT.observeClear[0] >= 0.05 && FIGHT_SHOT.observeClear[1] <= 0.95, 'a margin either side: blades, falls, Fireballs');
  // (placeFight's clear-view check stands a camera where Observation View would too)
  assert.match(camera, /const CHECKED_ON = \[[^\n]*\{ aspect: 16 \/ 9, clear: FIGHT_SHOT\.observeClear \}\];/);
});

test('the same director given a larger stage: its follow and its home recompose; the round itself is never touched', () => {
  // the follow camera's lead to his left eases off as the banner goes; the home shot turns to the middle
  assert.match(director, /addScaledVector\(left, 1\.2 - 0\.85 \* this\.framing\)/);
  assert.match(director, /const homeShot = this\.home && this\.homeObserve && this\.framing > 0/);
  // MenuScene eases the framing and gives the tour its stage every frame (never measured from the moved banner)
  assert.match(scene, /this\.tour\.framing = this\.framing;\n\s+this\.tour\.clear = mixClear\(this\.commandClear, FIGHT_SHOT\.observeClear, this\.framing\);/);
  assert.match(scene, /const PRESENTATION_SEC = 0\.42;/);
  const present = scene.slice(scene.indexOf('setPresentation(observing'), scene.indexOf('/** A choice was made on the front door'));
  for (const never of ['restart', 'setTouring', 'stopTouring', 'startTouring', 'pause', 'tour.time', 'memory']) assert.ok(!present.includes(never), `no ${never}`);
  assert.match(present, /prefers-reduced-motion: reduce/);
  // out on his round the knight cannot be turned by hand: no grab cursor offered
  assert.match(scene, /this\.container\.classList\.add\('touring'\);/);
  assert.match(css, /\.menu-spellblade\.touring \{ cursor: default; \}/);
});

test('the banner drawn aside, rod and all, quick going and a touch slower back; then unreachable', () => {
  assert.match(css, /#menu\.withdrawn \.banner-panel, #menu\.withdrawn::after, #menu\.withdrawn \.herald-tab \{\n\s+transform: translateX/);
  assert.match(css, /transition: transform \.23s cubic-bezier\(\.55, 0, \.8, \.35\), visibility 0s linear \.23s;/);
  assert.match(css, /transition: transform \.26s cubic-bezier\(\.2, \.8, \.25, 1\), visibility 0s linear 0s;/);
  // (its unfurling is the screen's arrival, not this: it is not played again when it comes back)
  assert.doesNotMatch(css, /withdrawn[^{]*\{[^}]*animation/);
  assert.match(main, /menuBanner\.inert = observing;\n\s+heraldTab\.inert = observing;/);
  // reduced motion: at once
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n\s+#menu \.banner-panel, #menu::after, #menu \.herald-tab, #menu\.withdrawn \.banner-panel, #menu\.withdrawn::after, #menu\.withdrawn \.herald-tab \{ transition: none; \}/);
});

test('the yard\'s controls: WATCH THE YARD on the front door, SHOW MENU in the yard, part of the front door screen only', () => {
  const menu = html.slice(html.indexOf('<section id="menu"'), html.indexOf('</section>', html.indexOf('class="yard-controls"')));
  assert.match(menu, /data-yard-watch[^>]*><span>WATCH THE YARD<\/span>/);
  assert.match(menu, /<div class="yard-observe" data-yard-observe hidden>/);
  assert.match(menu, /data-yard-show><span>SHOW MENU<\/span>/);
  // the yard's sound and subtitles are the Settings' own switches, not a sound of its own
  assert.match(menu, /data-toggle-sound/);
  assert.match(main, /for \(const button of document\.querySelectorAll\('\[data-toggle-subtitles\]'\)\) button\.addEventListener\('click', \(\) => settings\.toggle\('audio\.subtitles'\)\);/);
  // the herald's call that challengers await is kept, apart from the Herald's notices
  assert.match(html, /<div id="herald-toast" class="herald-toast hidden" role="status">/);
  assert.match(html, /<section id="herald" class="herald-notice hidden" role="dialog"/);
});

test('the banner yields on its own only on a quiet, eligible front door; a wake never presses what is under it', () => {
  const idle = main.slice(main.indexOf('function yardMayIdle()'), main.indexOf('setInterval(() => presentation.tick'));
  for (const condition of [
    'router.current !== SCREEN_IDS.MAIN_MENU', 'document.hidden', '!menuScene?.touring', 'touchUi', 'fingerOnly()', 'lessMotion()',
    'settingsPanel.isOpen', 'creditsPanel.isOpen', 'heraldPanel?.isOpen', 'seekStatus?.active', "challengeCard.classList.contains('hidden')",
    "arenaGate.classList.contains('hidden')", 'menuErrors.some', "'input, textarea, select, [contenteditable=\"true\"]'", "':focus-visible'",
  ]) assert.ok(idle.includes(condition), condition);
  assert.match(main, /setInterval\(\(\) => presentation\.tick\(nowSec\(\), yardMayIdle\(\)\), 1000\);/);
  // the wake: the press or key that woke it goes no further, nor the click after the press
  assert.match(main, /if \(swallow\) \{\n\s+event\.preventDefault\(\);\n\s+event\.stopPropagation\(\);/);
  assert.match(main, /addEventListener\('click', \(event\) => \{\n\s+if \(!swallowClick\) return;/);
  assert.match(main, /addEventListener\('keydown', \(event\) => yardActivity\(event, 'key'\), \{ capture: true \}\);/);
  // every screen change finds the banner up
  assert.match(main, /function route\(screenId\) \{[\s\S]{0,400}presentation\.reset\(nowSec\(\)\);/);
});

test('Escape closes the topmost thing first: Credits, Settings, the Herald, the yard; then the screen', () => {
  const escape = main.slice(main.indexOf("if (event.key !== 'Escape' || event.repeat) return;"), main.indexOf('rematchButton.addEventListener'));
  const order = ['creditsPanel.isOpen', 'settingsPanel.isOpen', 'heraldPanel?.isOpen', 'presentation.observing', 'SCREEN_IDS.SOLO_MENU'].map((needle) => escape.indexOf(needle));
  assert.ok(order.every((at) => at >= 0), 'all of them');
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  // and each gives the focus back to whatever opened it
  for (const path of ['../ui/CreditsPanel.mjs', '../settings/SettingsPanel.mjs', '../ui/HeraldPanel.mjs']) assert.match(source(path), /opener\.focus\(\{ preventScroll: true \}\)/, path);
});

test('the Herald: shipped changes only, dated as they shipped, newest first; no versions, no counts, no spoilers', () => {
  const { latest, changes, note } = HERALD_NOTICES;
  assert.ok(latest.title && latest.text.length);
  assert.ok(changes.length >= 4 && changes.length <= 12);
  for (const change of changes) {
    assert.match(change.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(change.text.length > 10 && change.text.length < 160, change.text);
  }
  const dates = changes.map((change) => change.date);
  assert.deepEqual(dates, [...dates].sort().reverse(), 'newest first');
  const all = JSON.stringify(HERALD_NOTICES);
  assert.doesNotMatch(all, /\bv\d+\.\d|version|players online|coming soon|Sky-?Bait|Slush/i);
  assert.equal(note, null, 'the maker\'s note is theirs to write');
  assert.equal(heraldDate('2026-10-08', { year: 2026 }), '8 October');
  assert.equal(heraldDate('2025-12-31', { year: 2026 }), '31 December 2025');
  // drawn safely
  const markup = heraldMarkup({ latest: { title: '<b>', text: ['a & b'] }, changes: [{ date: '2026-01-02', text: '"x"' }], note: null }, { year: 2026 });
  assert.match(markup, /&lt;b&gt;/);
  assert.match(markup, /a &amp; b/);
  assert.match(markup, /<time datetime="2026-01-02">2 January<\/time><span>&quot;x&quot;<\/span>/);
});

test('the banner\'s foot says the server\'s real state in a word; the old detail and retry stay', () => {
  assert.match(main, /const LINK_MARK = Object\.freeze\(\{ online: 'Multiplayer online', waking: 'Multiplayer waking', offline: 'Multiplayer offline', connecting: 'Reaching multiplayer' \}\);/);
  assert.match(main, /linkMark\.dataset\.tone = view\.tone;/);
  assert.match(html, /<div id="link-status" class="link-status hidden" aria-live="polite">/);
  assert.match(html, /<footer class="banner-foot">[\s\S]*data-open-herald[\s\S]*data-open-credits[\s\S]*<\/footer>/);
});
