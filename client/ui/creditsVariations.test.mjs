import test from 'node:test';
import assert from 'node:assert/strict';
import { entryGroupKey, groupShelfEntries, CreditsPanel } from './CreditsPanel.mjs';
import { VOICE_LIBRARY, librarySections } from './voiceLibrary.mjs';

test('entryGroupKey correctly groups variations by family and numbered suffix', () => {
  assert.equal(entryGroupKey({ line: 'rotorMoralityV1', family: 'rotorMorality' }), 'rotorMorality');
  assert.equal(entryGroupKey({ line: 'rotorMoralityV2', family: 'rotorMorality' }), 'rotorMorality');
  assert.equal(entryGroupKey({ line: 'enjoyRestV1', family: 'enjoyRest' }), 'enjoyRest');
  assert.equal(entryGroupKey({ line: 'enjoyRestV2', family: 'enjoyRest' }), 'enjoyRest');
  assert.equal(entryGroupKey({ line: 'apparatusFairnessV1' }), 'apparatusFairness');
  assert.equal(entryGroupKey({ line: 'apparatusFairnessV2' }), 'apparatusFairness');
  assert.equal(entryGroupKey({ line: 'gloryWitnessV1' }), 'gloryWitness');
  assert.equal(entryGroupKey({ line: 'gloryWitnessV2' }), 'gloryWitness');
  assert.equal(entryGroupKey({ line: 'gloryWitnessV3' }), 'gloryWitness');
  assert.equal(entryGroupKey({ line: 'lateLine' }), 'lateLine');
  assert.equal(entryGroupKey({ line: 'effort' }), 'effort');
});

test('groupShelfEntries consolidates Moral Rotation from 4 separate entries to 1 entry with 4 variations', () => {
  const remarks = VOICE_LIBRARY.filter((e) => e.section === 'Remarks & Oddities');
  const moralLines = remarks.filter((e) => e.line.startsWith('rotorMorality'));
  assert.equal(moralLines.length, 4, 'there are 4 declared moral rotation lines');

  const groups = groupShelfEntries(remarks);
  const moralGroup = groups.find((g) => g.key === 'rotorMorality');
  assert.ok(moralGroup, 'rotorMorality group exists');
  assert.equal(moralGroup.variations.length, 4, 'contains all 4 variations');
  assert.equal(moralGroup.primary.line, 'rotorMoralityV1');
  assert.deepEqual(
    moralGroup.variations.map((v) => v.line),
    ['rotorMoralityV1', 'rotorMoralityV2', 'rotorMoralityV3', 'rotorMoralityV4']
  );
  // Ensure the section list length is reduced by consolidating duplicates
  assert.equal(groups.length, remarks.length - 5, 'consolidates moral rotation, prowess, and machine loan');
});

test('groupShelfEntries consolidates enjoyRest variations', () => {
  const kills = VOICE_LIBRARY.filter((e) => e.section === 'Kills & Triumphs');
  const groups = groupShelfEntries(kills);
  const enjoyGroup = groups.find((g) => g.key === 'enjoyRest');
  assert.ok(enjoyGroup, 'enjoyRest group exists');
  assert.equal(enjoyGroup.variations.length, 2);
  assert.equal(enjoyGroup.primary.line, 'enjoyRestV1');
  assert.equal(enjoyGroup.variations[1].line, 'enjoyRestV2');
});

test('CreditsPanel renders variation toggle and drawer markup for grouped lines', () => {
  const root = {
    classList: { contains: () => false, remove: () => {}, add: () => {} },
    querySelector: (selector) => {
      if (selector === '[data-credits-body]') return body;
      if (selector === '[data-credits-attribution]') return attribution;
      if (selector === '[data-credits-library]') return library;
      return null;
    },
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  const body = {
    addEventListener: () => {},
    querySelector: () => null,
  };
  const attribution = { innerHTML: '' };
  const library = { innerHTML: '', querySelectorAll: () => [] };

  const voice = {
    recorded: new Map([
      ['rotorMoralityV1', 1],
      ['rotorMoralityV2', 1],
      ['rotorMoralityV3', 1],
      ['rotorMoralityV4', 1],
    ]),
    takes: new Map([
      ['rotorMoralityV1', [0]],
      ['rotorMoralityV2', [0]],
      ['rotorMoralityV3', [0]],
      ['rotorMoralityV4', [0]],
    ]),
  };

  const panel = new CreditsPanel({ root, voice });
  panel.open();

  // Moral Rotation markup checks
  const html = library.innerHTML;
  assert.ok(html.includes('data-line-group="rotorMorality"'), 'renders grouped line container');
  assert.ok(html.includes('data-toggle-variation="rotorMorality"'), 'renders variation toggle button');
  assert.ok(html.includes('4 variations'), 'displays variation count pill');
  assert.ok(html.includes('voice-variation-arrow'), 'displays disclosure arrow');
  assert.ok(html.includes('data-drawer-variation="rotorMorality"'), 'renders variations drawer');
  assert.ok(html.includes('Variation 1') && html.includes('Variation 4'), 'renders each variation inside drawer');
  assert.ok(html.includes('data-play-line="rotorMoralityV1"') && html.includes('data-play-line="rotorMoralityV4"'), 'renders play buttons for all variations');

  // When a specific variation matches a unique search, that variation is rendered directly
  panel.query = 'fun'; // unique to rotorMoralityV3
  panel.open();
  const funHtml = library.innerHTML;
  assert.ok(funHtml.includes('As long as it’s <mark>fun</mark>'), 'directly displays the matching variation');

  // When a search term matches multiple variations in a group, the drawer is auto-expanded
  panel.query = 'spinning'; // present in all rotorMorality variations
  panel.open();
  const spinningHtml = library.innerHTML;
  assert.ok(spinningHtml.includes('id="drawer-rotorMorality" class="voice-variations-drawer"'), 'drawer is expanded without hidden class');
  assert.ok(spinningHtml.includes('voice-variation-arrow open'), 'arrow points up');
  assert.ok(spinningHtml.includes('aria-expanded="true"'));
});

test('CreditsPanel toggle click expands and collapses the variation drawer', () => {
  let clickHandler = null;
  const drawerClasses = new Set(['hidden']);
  const arrowClasses = new Set();
  const attrs = new Map([['aria-expanded', 'false']]);

  const fakeDrawer = {
    children: [1, 2, 3, 4],
    classList: {
      remove: (c) => drawerClasses.delete(c),
      add: (c) => drawerClasses.add(c),
    },
  };
  const fakeArrow = {
    classList: {
      remove: (c) => arrowClasses.delete(c),
      add: (c) => arrowClasses.add(c),
    },
  };
  const fakeToggle = {
    dataset: { toggleVariation: 'rotorMorality' },
    closest: (sel) => (sel === '[data-toggle-variation]' ? fakeToggle : null),
    querySelector: (sel) => (sel === '.voice-variation-arrow' ? fakeArrow : null),
    setAttribute: (k, v) => attrs.set(k, v),
  };

  const body = {
    addEventListener: (type, fn) => {
      if (type === 'click') clickHandler = fn;
    },
    querySelector: (sel) => {
      if (sel === '[data-drawer-variation="rotorMorality"]') return fakeDrawer;
      return null;
    },
  };

  const root = {
    classList: { contains: () => false, remove: () => {}, add: () => {} },
    querySelector: (selector) => {
      if (selector === '[data-credits-body]') return body;
      return { innerHTML: '', addEventListener: () => {} };
    },
    querySelectorAll: () => [],
    addEventListener: () => {},
  };

  const panel = new CreditsPanel({ root, voice: null });
  assert.ok(clickHandler, 'click handler registered');

  // First click: expands drawer
  clickHandler({
    target: fakeToggle,
    preventDefault: () => {},
  });
  assert.equal(drawerClasses.has('hidden'), false, 'drawer is no longer hidden');
  assert.equal(arrowClasses.has('open'), true, 'arrow points up');
  assert.equal(attrs.get('aria-expanded'), 'true');
  assert.equal(panel.unfoldedVariations.has('rotorMorality'), true);

  // Second click: collapses drawer
  clickHandler({
    target: fakeToggle,
    preventDefault: () => {},
  });
  assert.equal(drawerClasses.has('hidden'), true, 'drawer is hidden again');
  assert.equal(arrowClasses.has('open'), false, 'arrow points down');
  assert.equal(attrs.get('aria-expanded'), 'false');
  assert.equal(panel.unfoldedVariations.has('rotorMorality'), false);
});
