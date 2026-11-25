import test from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_ROOM_FILTERS, normalizeRoomFilter, applyDraftToRuleForm } from './roomDraft.mjs';

function makeForm() {
  const mkSelect = (name, vals = []) => ({
    name,
    value: vals[0] ?? '',
    options: vals.map((v) => ({ value: v, hidden: false, disabled: false })),
    get selectedOptions() {
      const hit = this.options.find((o) => o.value === this.value);
      return hit ? [hit] : [];
    },
    _html: '',
    set innerHTML(s) {
      this._html = s;
      const matches = [...s.matchAll(/value="([^"]+)"([^>]*)>/g)];
      this.options = matches.map((m) => ({ value: m[1], hidden: false, disabled: false, selected: m[2].includes('selected') }));
      const sel = this.options.find((o) => o.selected) ?? this.options[0];
      if (sel) this.value = sel.value;
    },
    get innerHTML() { return this._html; },
  });
  const nodes = {
    '[data-score-field]': { hidden: false },
    '[data-time-field]': { hidden: false },
    '[data-team-field]': { hidden: true },
    '[data-bot-field]': { hidden: true },
    '[data-siege-field="format"]': { hidden: true },
    '[data-siege-field="rounds"]': { hidden: true },
    '[data-siege-field="cap"]': { hidden: true },
    '[data-siege-field="clash"]': { hidden: true },
  };
  return {
    elements: {
      mode: mkSelect('mode', ['FFA', 'BREAKTHROUGH', 'SIEGE_BLADES', 'HIGH_GROUNDS', 'EDGE_OF_VICTORY']),
      worldId: mkSelect('worldId', []),
      teamSize: mkSelect('teamSize', ['1', '2', '3', '5']),
      team: mkSelect('team', ['AUTO', 'ATTACKERS', 'DEFENDERS']),
      botSkill: mkSelect('botSkill', ['squire', 'knight', 'champion', 'spellblade']),
      scoreToWin: { value: '10' },
      minutes: { value: '6' },
      format: mkSelect('format', ['MATCH', 'ENDLESS']),
      matchRounds: mkSelect('matchRounds', ['3', '5', '7']),
      endlessRoundCap: mkSelect('endlessRoundCap', ['10', '25', '50', '0']),
      clashStarts: mkSelect('clashStarts', ['on', 'off']),
    },
    querySelector(sel) {
      return nodes[sel] ?? null;
    },
  };
}

test('normalizeRoomFilter preserves SIEGE_BLADES and EDGE_OF_VICTORY filters instead of resetting to ALL', () => {
  for (const mode of PUBLIC_ROOM_FILTERS) {
    assert.equal(normalizeRoomFilter(mode), mode);
  }
  assert.equal(normalizeRoomFilter('SIEGE_BLADES'), 'SIEGE_BLADES');
  assert.equal(normalizeRoomFilter('EDGE_OF_VICTORY'), 'EDGE_OF_VICTORY');
  assert.equal(normalizeRoomFilter('UNKNOWN_MODE'), 'ALL');
});

test('applyDraftToRuleForm carries Siege Blades format, rounds, endless cap, arena, size, and difficulty', () => {
  const form = makeForm();
  applyDraftToRuleForm(form, 'SIEGE_BLADES', {
    worldId: 'blackbell-foundry',
    teamSize: 2,
    botSkill: 'champion',
    format: 'ENDLESS',
    matchRounds: 5,
    endlessRoundCap: 50,
  });
  assert.equal(form.elements.mode.value, 'SIEGE_BLADES');
  assert.equal(form.elements.worldId.value, 'blackbell-foundry');
  assert.equal(form.elements.teamSize.value, '2');
  assert.equal(form.elements.botSkill.value, 'champion');
  assert.equal(form.elements.format.value, 'ENDLESS');
  assert.equal(form.elements.matchRounds.value, '5');
  assert.equal(form.elements.endlessRoundCap.value, '50');
  assert.equal(form.querySelector('[data-siege-field="cap"]').hidden, false);
  assert.equal(form.querySelector('[data-siege-field="rounds"]').hidden, true);
  assert.equal(form.querySelector('[data-siege-field="clash"]').hidden, true);

  applyDraftToRuleForm(form, 'SIEGE_BLADES', {
    worldId: 'high-grounds',
    teamSize: 1,
    botSkill: 'knight',
    format: 'ENDLESS',
    endlessRoundCap: 25,
    clashStarts: false,
  });
  assert.equal(form.elements.clashStarts.value, 'off');
  assert.equal(form.querySelector('[data-siege-field="clash"]').hidden, false);
});
