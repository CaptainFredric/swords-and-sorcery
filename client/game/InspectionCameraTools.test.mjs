import test from 'node:test';
import assert from 'node:assert/strict';
import { InspectionCameraTools } from './InspectionCameraTools.mjs';

class MockElement extends EventTarget {
  constructor(tag = 'div') {
    super();
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.style = {};
    this.classSet = new Set();
    this.classList = {
      add: (...names) => names.forEach(n => this.classSet.add(n)),
      remove: (...names) => names.forEach(n => this.classSet.delete(n)),
      toggle: (name, force) => {
        const has = this.classSet.has(name);
        const next = force !== undefined ? Boolean(force) : !has;
        if (next) this.classSet.add(name); else this.classSet.delete(name);
        return next;
      },
      contains: (name) => this.classSet.has(name),
    };
  }

  get className() {
    return [...this.classSet].join(' ');
  }

  set className(val) {
    this.classSet.clear();
    for (const c of String(val).split(/\s+/)) if (c) this.classSet.add(c);
  }

  append(...nodes) {
    for (const n of nodes) {
      this.children.push(n);
      n.parentElement = this;
    }
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  setAttribute(name, val) {
    this.attributes.set(name, String(val));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  dispatchEvent(event) {
    Object.defineProperty(event, 'target', { value: this, configurable: true });
    let curr = this;
    while (curr) {
      super.dispatchEvent.call(curr, event);
      if (!event.bubbles) break;
      curr = curr.parentElement;
    }
    return true;
  }

  closest(selector) {
    if (selector === '[data-camera]') {
      if (this.dataset?.camera) return this;
    }
    if (selector === '[data-bookmark-include]') {
      if (this.dataset?.bookmarkInclude) return this;
    }
    return this.parentElement?.closest(selector) ?? null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const walk = (node) => {
      let isMatch = true;
      if (selector === 'details') {
        isMatch = node.tagName === 'DETAILS';
      } else if (selector === '.inspection-view-labels') {
        isMatch = node.classList?.contains('inspection-view-labels');
      } else {
        const attrs = selector.match(/\[([a-zA-Z0-9_-]+)(?:="?([^"\]]+)"?)?\]/g);
        if (attrs && attrs.length > 0) {
          for (const attr of attrs) {
            const m = attr.match(/\[([a-zA-Z0-9_-]+)(?:="?([^"\]]+)"?)?\]/);
            const rawKey = m[1];
            const expectedVal = m[2];
            let actualVal;
            if (rawKey.startsWith('data-')) {
              const camel = rawKey.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
              actualVal = node.dataset?.[camel];
            } else {
              actualVal = node.getAttribute(rawKey);
            }
            if (actualVal === undefined) { isMatch = false; break; }
            if (expectedVal !== undefined && String(actualVal) !== expectedVal) { isMatch = false; break; }
          }
        } else {
          isMatch = false;
        }
      }
      if (isMatch) matches.push(node);
      for (const child of node.children) walk(child);
    };
    walk(this);
    return matches;
  }

  remove() {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this);
      if (idx >= 0) this.parentElement.children.splice(idx, 1);
      this.parentElement = null;
    }
  }

  set innerHTML(html) {
    this._html = html;
    this.children = [];
    const details = new MockElement('details');
    details.className = 'inspection-camera-tools';

    const camState = new MockElement('span');
    camState.dataset.cameraState = '';
    details.append(camState);

    const readout = new MockElement('div');
    readout.dataset.cameraReadout = '';
    details.append(readout);

    const btnNames = [
      ['actor', 'YOU · 1ST PERSON'],
      ['dummy', 'INHABIT DUMMY'],
      ['fly', 'FLY CAMERA'],
      ['split', 'SPLIT VIEW'],
      ['reset', 'RESET CAMERA'],
      ['hideAllUi', 'HIDE ALL UI [H]'],
      ['cycleUiMode', 'UI: FULL'],
      ['toggleGrid', 'GRID: OFF'],
      ['levelCamera', 'LEVEL HORIZON'],
      ['focusSubject', 'FOCUS SUBJECT'],
      ['freeze', 'FREEZE'],
      ['step', 'STEP 1 TICK'],
      ['playFrames', 'PLAY FRAMES'],
      ['captureSingle', 'CAPTURE PNG'],
      ['captureAll', 'CAPTURE ALL CAMERAS'],
      ['toggleSequence', 'START SEQUENCE'],
    ];

    for (const [id, label] of btnNames) {
      const btn = new MockElement('button');
      btn.dataset.camera = id;
      btn.textContent = label;
      if (id === 'cycleUiMode') btn.dataset.uiModeBtn = '';
      if (id === 'toggleGrid') btn.dataset.gridBtn = '';
      details.append(btn);
    }

    for (const spd of ['slow', 'normal', 'fast']) {
      const btn = new MockElement('button');
      btn.dataset.camera = 'speed';
      btn.dataset.speed = spd;
      details.append(btn);
    }

    const fovDisplay = new MockElement('span');
    fovDisplay.dataset.fovDisplay = '';
    details.append(fovDisplay);

    for (let i = 1; i <= 3; i++) {
      const row = new MockElement('div');
      row.dataset.bookmarkRow = String(i);

      const check = new MockElement('input');
      check.dataset.bookmarkInclude = String(i);
      check.checked = true;

      const setBtn = new MockElement('button');
      setBtn.dataset.camera = 'bookmarkSet';
      setBtn.dataset.slot = String(i);

      const goBtn = new MockElement('button');
      goBtn.dataset.camera = 'bookmarkGo';
      goBtn.dataset.slot = String(i);
      goBtn.disabled = true;

      row.append(check, setBtn, goBtn);
      details.append(row);
    }

    const seqCadence = new MockElement('select');
    seqCadence.dataset.sequenceCadence = '';
    seqCadence.value = '6';

    const seqLimit = new MockElement('select');
    seqLimit.dataset.sequenceLimit = '';
    seqLimit.value = '12';

    const seqProg = new MockElement('div');
    seqProg.dataset.sequenceProgress = '';

    const camHelp = new MockElement('p');
    camHelp.dataset.cameraHelp = '';
    details.append(camHelp);

    details.append(seqCadence, seqLimit, seqProg);
    const labels = new MockElement('div');
    labels.className = 'inspection-view-labels';

    this.append(details, labels);
  }
}

function setup() {
  globalThis.document = {
    createElement: (tag) => new MockElement(tag),
    body: new MockElement('body'),
  };
  const parent = new MockElement('div');
  const calls = [];
  const actions = {
    actor: () => calls.push('actor'),
    dummy: () => calls.push('dummy'),
    fly: () => calls.push('fly'),
    split: () => calls.push('split'),
    reset: () => calls.push('reset'),
    hideAllUi: () => calls.push('hideAllUi'),
    cycleUiMode: () => calls.push('cycleUiMode'),
    toggleGrid: () => calls.push('toggleGrid'),
    speed: (mode) => calls.push(['speed', mode]),
    fovInc: () => calls.push('fovInc'),
    fovDec: () => calls.push('fovDec'),
    fovReset: () => calls.push('fovReset'),
    levelCamera: () => calls.push('levelCamera'),
    focusSubject: () => calls.push('focusSubject'),
    freeze: () => calls.push('freeze'),
    step: () => calls.push('step'),
    playFrames: () => calls.push('playFrames'),
    bookmarkSet: (slot) => calls.push(['bookmarkSet', slot]),
    bookmarkGo: (slot) => calls.push(['bookmarkGo', slot]),
    bookmarkToggleInclude: (slot, inc) => calls.push(['bookmarkToggleInclude', slot, inc]),
    captureSingle: () => calls.push('captureSingle'),
    captureAll: () => calls.push('captureAll'),
    toggleSequence: () => calls.push('toggleSequence'),
  };
  const tools = new InspectionCameraTools(parent, actions);
  return { parent, calls, actions, tools };
}

test('InspectionCameraTools renders all controls and dispatches actions on click', () => {
  const { tools, calls } = setup();

  const clickBtn = (camera, extra = {}) => {
    const el = tools.root.querySelector(`[data-camera="${camera}"]`);
    assert.ok(el, `Button for ${camera} should exist`);
    Object.assign(el.dataset, extra);
    const ev = new Event('click', { bubbles: true });
    el.dispatchEvent(ev);
  };

  clickBtn('hideAllUi');
  assert.equal(calls.at(-1), 'hideAllUi');

  clickBtn('cycleUiMode');
  assert.equal(calls.at(-1), 'cycleUiMode');

  clickBtn('toggleGrid');
  assert.equal(calls.at(-1), 'toggleGrid');

  clickBtn('levelCamera');
  assert.equal(calls.at(-1), 'levelCamera');

  clickBtn('focusSubject');
  assert.equal(calls.at(-1), 'focusSubject');

  clickBtn('captureSingle');
  assert.equal(calls.at(-1), 'captureSingle');

  clickBtn('captureAll');
  assert.equal(calls.at(-1), 'captureAll');

  clickBtn('toggleSequence');
  assert.equal(calls.at(-1), 'toggleSequence');

  // Test speed dispatch
  const slowBtn = tools.root.querySelector('[data-camera="speed"][data-speed="slow"]');
  slowBtn.dispatchEvent(new Event('click', { bubbles: true }));
  assert.deepEqual(calls.at(-1), ['speed', 'slow']);

  // Test bookmark set dispatch
  const setBtn = tools.root.querySelector('[data-camera="bookmarkSet"][data-slot="2"]');
  setBtn.dispatchEvent(new Event('click', { bubbles: true }));
  assert.deepEqual(calls.at(-1), ['bookmarkSet', 2]);

  // Test bookmark go dispatch
  const goBtn = tools.root.querySelector('[data-camera="bookmarkGo"][data-slot="1"]');
  goBtn.dispatchEvent(new Event('click', { bubbles: true }));
  assert.deepEqual(calls.at(-1), ['bookmarkGo', 1]);
});

test('InspectionCameraTools.update updates UI state and authoritative readout', () => {
  const { tools } = setup();

  tools.update({
    available: true,
    focus: 'fly',
    split: false,
    dummy: true,
    controlledDummy: false,
    frozen: true,
    playingFrames: true,
    views: [{ kind: 'fly', controlled: true, x: 0, y: 0, width: 800, height: 600 }],
    controls: 'Fly controls',
    tick: 1245,
    simTime: 41.5,
    uiMode: 'clean',
    gridVisible: true,
    speedMode: 'fast',
    fov: 90,
    bookmarks: [{ position: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, fov: 90 }, null, null],
    sequence: { active: true, capturedMoments: 3, limitMoments: 12, lastCapturedTick: 1245 },
  });

  const readout = tools.root.querySelector('[data-camera-readout]');
  assert.ok(readout.textContent.includes('FROZEN'));
  assert.ok(readout.textContent.includes('1,245'));
  assert.ok(readout.textContent.includes('41.50s'));

  const fovDisplay = tools.root.querySelector('[data-fov-display]');
  assert.equal(fovDisplay.textContent, '90°');

  const uiModeBtn = tools.root.querySelector('[data-ui-mode-btn]');
  assert.equal(uiModeBtn.textContent, 'UI: CLEAN');

  const gridBtn = tools.root.querySelector('[data-grid-btn]');
  assert.equal(gridBtn.textContent, 'GRID: ON');

  const playFramesBtn = tools.root.querySelector('[data-camera="playFrames"]');
  assert.equal(playFramesBtn.textContent, 'STOP FRAMES');

  const seqBtn = tools.root.querySelector('[data-camera="toggleSequence"]');
  assert.equal(seqBtn.textContent, 'STOP SEQUENCE');

  const seqProg = tools.root.querySelector('[data-sequence-progress]');
  assert.ok(seqProg.textContent.includes('Recording: 3 / 12 moments'));

  const goSlot1 = tools.root.querySelector('[data-camera="bookmarkGo"][data-slot="1"]');
  assert.equal(goSlot1.disabled, false);

  const goSlot2 = tools.root.querySelector('[data-camera="bookmarkGo"][data-slot="2"]');
  assert.equal(goSlot2.disabled, true);
});

test('InspectionCameraTools.getSequenceSettings parses select inputs', () => {
  const { tools } = setup();
  const settings = tools.getSequenceSettings();
  assert.equal(settings.intervalTicks, 6);
  assert.equal(settings.limitMoments, 12);
});
