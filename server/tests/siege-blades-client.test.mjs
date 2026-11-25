import test from 'node:test';
import assert from 'node:assert/strict';
import { siegeBladesHudView, matchInfoText } from '../../client/ui/HUD.mjs';
import { SIEGE_MACHINE_CARDS, siegePickerSeconds, siegePickerMarkup } from '../../client/ui/SiegeMachinePicker.mjs';
import { MenuController } from '../../client/menu/MenuController.mjs';
import { privateRoomPreview, PRIVATE_MODE_DEFAULTS } from '../../client/menu/privateRoomRules.mjs';
import { roomSettings } from '../../shared/src/roomSettings.mjs';
import { LocalHost } from '../../client/network/LocalHost.mjs';
import { GameLink } from '../../client/network/GameLink.mjs';

test('siegeBladesHudView formats Match and Endless formats, countdowns, and overtime correctly', () => {
  const local = { id: 'p1', team: 'ATTACKERS' };
  const baseSnapshot = {
    mode: 'SIEGE_BLADES',
    matchStartedAt: 10,
    matchSeconds: 180,
    siegeBlades: {
      format: 'MATCH',
      roundNumber: 2,
      matchRounds: 5,
      selectionEndsAt: null,
      scores: { ATTACKERS: 1, DEFENDERS: 0 },
      roundWinner: null,
      roundResetCountdown: null,
      clashActive: false,
      overtimeActive: false,
      zone: null,
    },
  };

  // 1. Normal match view
  const v1 = siegeBladesHudView(local, baseSnapshot, 25);
  assert.equal(v1.visible, true);
  assert.equal(v1.format, 'MATCH');
  assert.equal(v1.roundNumber, 2);
  assert.equal(v1.matchRounds, 5);
  assert.equal(v1.selectionEndsAt, null);
  assert.equal(v1.scores.ATTACKERS, 1);
  assert.equal(v1.scores.DEFENDERS, 0);
  assert.equal(v1.isResetting, false);
  assert.equal(v1.clashActive, false);
  assert.equal(v1.overtimeActive, false);
  assert.equal(v1.clock, '2:45');

  // 2. Endless format with 6s countdown reset
  const endlessSnapshot = {
    ...baseSnapshot,
    siegeBlades: {
      ...baseSnapshot.siegeBlades,
      format: 'ENDLESS',
      roundResetCountdown: 5.4,
      roundWinner: 'ATTACKERS',
      clashActive: true,
    },
  };
  const v2 = siegeBladesHudView(local, endlessSnapshot, 50);
  assert.equal(v2.format, 'ENDLESS');
  assert.equal(v2.isResetting, true);
  assert.equal(v2.countdownSec, 6);
  assert.equal(v2.roundWinner, 'ATTACKERS');
  assert.equal(v2.clashActive, true);

  // 3. Overtime Engagement Zone active
  const otSnapshot = {
    ...baseSnapshot,
    overtime: true,
    siegeBlades: {
      ...baseSnapshot.siegeBlades,
      overtimeActive: true,
      zone: {
        controllingTeam: 'ATTACKERS',
        holdPercent: 67,
        contested: false,
      },
    },
  };
  const v3 = siegeBladesHudView(local, otSnapshot, 195);
  assert.equal(v3.overtimeActive, true);
  assert.equal(v3.clock, 'OVERTIME');
  assert.equal(v3.zone.controllingTeam, 'ATTACKERS');
  assert.equal(v3.zone.holdPercent, 67);
  assert.equal(v3.zone.contested, false);
});

test('matchInfoText formats Siege Blades descriptions', () => {
  const matchSnap = {
    mode: 'SIEGE_BLADES',
    matchStartedAt: 0,
    matchSeconds: 180,
    siegeBlades: {
      format: 'MATCH',
      roundNumber: 1,
      matchRounds: 3,
      selectionEndsAt: null,
      scores: { ATTACKERS: 0, DEFENDERS: 0 },
      roundResetCountdown: null,
      clashActive: false,
      overtimeActive: false,
    },
  };
  const text1 = matchInfoText(matchSnap, 30);
  assert.ok(text1.includes('SIEGE BLADES'));
  assert.ok(text1.includes('3 ROUNDS'));
  assert.ok(text1.includes('ROUND 1'));
  assert.ok(text1.includes('AZURE 0 · CRIMSON 0'));
  assert.ok(text1.includes('2:30'));

  const resetSnap = {
    ...matchSnap,
    siegeBlades: {
      ...matchSnap.siegeBlades,
      roundResetCountdown: 4.8,
    },
  };
  const text2 = matchInfoText(resetSnap, 40);
  assert.equal(text2, 'ROUND COMPLETE · AZURE 0 · CRIMSON 0');
});

test('MenuController manages Siege Blades options and dispatches startSolo', () => {
  const storageMap = new Map();
  const mockStorage = {
    getItem: (k) => storageMap.get(k) ?? null,
    setItem: (k, v) => storageMap.set(k, String(v)),
  };

  const dispatched = [];
  const mockSocket = {
    startSolo: (...args) => {
      dispatched.push(args);
      return { ok: true };
    },
  };

  const mc = new MenuController(mockSocket, mockStorage);

  // Format defaults to ENDLESS for casual / play with bots
  assert.equal(mc.siegeFormat(), 'ENDLESS');
  mc.chooseSiegeFormat('MATCH');
  assert.equal(mc.siegeFormat(), 'MATCH');

  // Size defaults to 1 (1v1)
  assert.equal(mc.siegeSize(), 1);
  mc.chooseSiegeSize(2);
  assert.equal(mc.siegeSize(), 2);

  // Machine defaults to random
  assert.equal(mc.siegeMachine(), 'random');
  mc.chooseSiegeMachine('fight-and-flight');
  assert.equal(mc.siegeMachine(), 'fight-and-flight');

  // Rounds defaults to 3 for Match
  assert.equal(mc.siegeRounds(), 3);
  mc.chooseSiegeRounds(5);
  assert.equal(mc.siegeRounds(), 5);

  // Endless cap defaults to 25
  assert.equal(mc.siegeEndlessRounds(), 25);
  mc.chooseSiegeEndlessRounds(50);
  assert.equal(mc.siegeEndlessRounds(), 50);

  // Clash starts defaults to true
  assert.equal(mc.siegeClashStarts(), true);
  mc.chooseSiegeClashStarts(false);
  assert.equal(mc.siegeClashStarts(), false);

  // Launch Siege Blades
  mc.chooseSiegeFormat('ENDLESS');
  mc.chooseSiegeSize(1);
  mc.chooseSiegeClashStarts(true);
  const result = mc.siegeBlades('Champion Aden');
  assert.equal(result.ok, true);

  assert.equal(dispatched.length, 1);
  const [mode, name, arena, skill, team, size, customSettings] = dispatched[0];
  assert.equal(mode, 'SIEGE_BLADES');
  assert.equal(name, 'Champion Aden');
  assert.ok(['high-grounds', 'blackbell-foundry', 'outerworks'].includes(arena));
  assert.equal(size, 1);
  assert.equal(customSettings.format, 'ENDLESS');
  assert.equal(customSettings.teamSize, 1);
  assert.equal(customSettings.clashStarts, true);
});

test('Private room rules and settings support Siege Blades 1v1, 2v2, 3v3', () => {
  assert.ok(PRIVATE_MODE_DEFAULTS.SIEGE_BLADES);
  assert.equal(PRIVATE_MODE_DEFAULTS.SIEGE_BLADES.worldId, 'high-grounds');
  assert.equal(PRIVATE_MODE_DEFAULTS.SIEGE_BLADES.teamSize, 1);

  // Valid 1v1
  const prev1 = privateRoomPreview('SIEGE_BLADES', { teamSize: 1, worldId: 'high-grounds' });
  assert.equal(prev1.ok, true);
  assert.equal(prev1.settings.teamSize, 1);
  // (a Siege room plays rounds on the mode's own clock: its summary names the rounds, never a match time)
  assert.ok(prev1.summary.includes('SIEGE BLADES · 1V1 · 3 ROUNDS'), prev1.summary);

  // Valid 3v3
  const prev3 = privateRoomPreview('SIEGE_BLADES', { teamSize: 3, format: 'ENDLESS', endlessRoundCap: 10, worldId: 'blackbell-foundry' });
  assert.equal(prev3.ok, true);
  assert.equal(prev3.settings.teamSize, 3);
  assert.ok(prev3.summary.includes('SIEGE BLADES · 3V3 · ENDLESS · CAP 10'), prev3.summary);

  // Invalid arena (e.g. ruined-keep)
  const prevBadArena = privateRoomPreview('SIEGE_BLADES', { worldId: 'ruined-keep' });
  assert.equal(prevBadArena.ok, false);
  assert.ok(prevBadArena.error.includes('arena'));
});

test('Launching Siege Blades through LocalHost preserves custom settings on Room and mode state', () => {
  const host = new LocalHost({
    now: () => 0,
    every: () => 1,
    cancel: () => {},
    later: (fn) => fn(),
  });

  const customSettings = {
    format: 'MATCH',
    teamSize: 2,
    matchRounds: 5,
    clashStarts: false,
    botDifficulty: 'champion',
    machineSelection: 'so-fist-ication',
  };

  host.startSolo('SIEGE_BLADES', 'Commander', 'blackbell-foundry', 'champion', false, 'ATTACKERS', 2, customSettings);

  assert.ok(host.room);
  assert.equal(host.room.mode, 'SIEGE_BLADES');
  assert.equal(host.room.worldId, 'blackbell-foundry');
  assert.ok(host.room.siegeBladesSettings);
  assert.equal(host.room.siegeBladesSettings.format, 'MATCH');
  assert.equal(host.room.siegeBladesSettings.matchRounds, 5);
  assert.equal(host.room.siegeBladesSettings.clashStarts, false);

  assert.ok(host.room.siegeBlades);
  assert.equal(host.room.siegeBlades.format, 'MATCH');
  assert.equal(host.room.siegeBlades.matchRounds, 5);
  assert.equal(host.room.siegeBlades.matchRounds, 5);
  assert.equal(host.room.policy.scored, false, 'Siege Blades never inherits the generic 2-kill finish');
  assert.equal(host.room.policy.timed, false, 'only the mode-owned per-round clock decides overtime');
  assert.equal(host.room.siegeBlades.clashStarts, false);
  assert.equal(host.room.siegeBlades.machineSelection, 'so-fist-ication');
});


test('Machine draft has three distinct recognizable selectable portraits, descriptions and authoritative countdown', () => {
  assert.deepEqual(SIEGE_MACHINE_CARDS.map(c=>c.id),[
    'so-fist-ication','bi-bye-llista','fight-and-flight']);
  const html=siegePickerMarkup();
  assert.equal((html.match(/data-siege-pick=/g)||[]).length,3);
  assert.equal((html.match(/role="radio"/g)||[]).length,3,'a radio group of three');
  assert.equal((html.match(/<img src=/g)||[]).length,3);
  assert.match(html,/data-sb-draft-seconds>6/);
  for(const machine of SIEGE_MACHINE_CARDS)assert.ok(html.includes('/siege-portraits/'+machine.id+'.svg'));
  for(const machine of SIEGE_MACHINE_CARDS){
    assert.ok(html.includes(machine.name));
    assert.ok(html.includes(machine.role));
    assert.ok(html.includes(machine.description));
  }
  assert.doesNotMatch(html,/\.glb/);
  assert.equal(siegePickerSeconds(18,10),8);
  assert.equal(siegePickerSeconds(18,17.3),1);
  assert.equal(siegePickerSeconds(18,20),0);
  assert.equal(siegePickerSeconds(null,10),0);
});

test('Siege HUD announces a machine selection phase instead of promising another round within the score pause',()=>{
  const snapshot={
    mode:'SIEGE_BLADES',matchStartedAt:0,matchSeconds:180,
    siegeBlades:{format:'MATCH',roundNumber:4,matchRounds:5,
      scores:{ATTACKERS:2,DEFENDERS:1},selectionEndsAt:18,
      roundResetCountdown:null,overtimeActive:false},
  };
  const view=siegeBladesHudView({id:'local',team:'ATTACKERS'},snapshot,12);
  assert.equal(view.selectionEndsAt,18);
  assert.equal(matchInfoText(snapshot,12),'CHOOSE YOUR SIEGE MACHINE · ROUND 4 · AZURE 2 · CRIMSON 1');
});
