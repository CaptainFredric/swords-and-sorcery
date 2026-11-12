// The Sword Techniques in a real room: the room's own tick, movement, Guard, Steel, Stagger and prowess rules, the
// blade swept from the tracks sampled out of the shipped clips. (shared/sim/swordTechnique.mjs, combat.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { applyRoomCommand, serializeSnapshot } from '../../shared/sim/wire.mjs';
import { beginAttack, pressTechnique, setGuard, stepRoom, tryCastSpell, tryUltimate } from '../../shared/sim/combat.mjs';
import { techniqueBladeAt } from '../../shared/sim/swordTechnique.mjs';
import { GAME_MODES } from '../../shared/src/modes.mjs';
import { GAME, SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';
import { MOVEMENT } from '../../shared/src/movement.mjs';
import { PROWESS } from '../../shared/src/prowess.mjs';
import { callSteel } from '../../shared/src/steel.mjs';
import { SWORD_TECHNIQUES, WHIRL_TURN, techniqueBlade, techniqueDuration, techniqueMoment } from '../../shared/src/swordTechniques.mjs';
import { vortexAngle, vortexTune } from '../../shared/src/ultimates.mjs';

const RIPOSTE = SWORD_TECHNIQUES.rigid_riposte;
const WHIRL = SWORD_TECHNIQUES.whirl_like_the_wind;
const DT = 1 / 30;
const floor = { id: 'floor', center: [0, -0.1, 0], size: [120, 0.2, 120], y: 0 };
const flat = () => ({ floors: [floor], ramps: [], solids: [], abyssY: -9,
  spawnPoints: [{ x: 0, y: 0, z: 0, yaw: 0 }, { x: 0, y: 0, z: -30, yaw: Math.PI }] });

// two knights in a room that pays prowess (a duel's rules: FFA), A at the origin facing -z, B where asked
function duel({ technique = 'rigid_riposte', mode = GAME_MODES.FFA, world = flat(), spell = 'fireball', at = { x: 0, z: -40 }, facing = Math.PI } = {}) {
  const room = new Room('TECH', { mode });
  room.world = world;
  const a = room.addPlayer({ id: 'a', token: 'ta', name: 'A', technique, spell }, 0);
  let b = mode === GAME_MODES.PRACTICE ? null : room.addPlayer({ id: 'b', token: 'tb', name: 'B' }, 0);
  let now = 3.1;
  // (the yard is simply open: as the other yard tests have it)
  if (b) { room.setReady('a', true, 0); room.setReady('b', true, 0); room.tick(now); } else room.state = 'PLAYING';
  assert.equal(room.state, 'PLAYING');
  // (the yard's own Training Dummy, added as the yard adds it)
  b ??= room.addServerActor({ id: 'b', name: 'B', actorKind: 'dummy' }, now);
  Object.assign(a.position, { x: 0, y: 0, z: 0 });
  Object.assign(b.position, { x: at.x, y: 0, z: at.z });
  for (const p of [a, b]) { p.spawnProtectionUntil = 0; p.velocity = { x: 0, y: 0, z: 0 }; p.history = []; p.ai = null; }
  a.yaw = 0; a.input = { ...a.input, yaw: 0, pitch: 0 };
  b.yaw = facing; b.input = { ...b.input, yaw: facing, pitch: 0 };
  const events = [];
  const step = (seconds = DT) => {
    for (let n = Math.max(1, Math.round(seconds / DT)); n > 0; n -= 1) {
      now = Math.round((now + DT) * 1e6) / 1e6;
      room.events.length = 0;
      stepRoom(room, DT, now, room.world);
      events.push(...room.events.map((e) => ({ ...e })));
    }
    return now;
  };
  step(DT * 2);
  events.length = 0;
  return { room, a, b, step, events, now: () => now, of: (type) => events.filter((e) => e.type === type),
    damage: () => events.filter((e) => e.type === 'damage' && e.victimId === 'b').map((e) => e.amount) };
}
const press = (t, down = true) => pressTechnique(t.room, 'a', down, t.now());

// --- Rigid Riposte

test('Rigid Riposte runs a knight through for 24, clips one for 20, and lunges about 5.7 m', () => {
  const centred = duel({ at: { x: 0, z: -4.2 } });
  assert.equal(press(centred), true);
  centred.step(techniqueDuration(RIPOSTE) + 0.1);
  assert.deepEqual(centred.damage(), [24]);
  assert.equal(centred.of('techniqueHit')[0].clean, true);

  const clipped = duel({ at: { x: 0.5, z: -4.2 } });
  press(clipped);
  clipped.step(techniqueDuration(RIPOSTE) + 0.1);
  assert.deepEqual(clipped.damage(), [20]);
  assert.equal(clipped.of('techniqueHit')[0].clean, false);

  const wide = duel({ at: { x: 1.4, z: -4.2 } });
  press(wide);
  wide.step(techniqueDuration(RIPOSTE) + 0.1);
  assert.deepEqual(wide.damage(), [], 'a knight beside the thrust is not met');

  const open = duel();
  press(open);
  open.step(techniqueDuration(RIPOSTE) + 0.1);
  assert.ok(Math.abs(-open.a.position.z - RIPOSTE.lungeDistance) < 0.35, `lunged ${(-open.a.position.z).toFixed(2)} m`);
  assert.ok(Math.abs(open.a.position.x) < 0.01);
});

test('the lunge is committed where the knight faced as the brace ended, and stops on what it meets', () => {
  const t = duel();
  press(t);
  t.step(RIPOSTE.enterSec + RIPOSTE.braceSec + DT);
  // turned away after the commit, and pushing that way: the body goes on down the committed line
  t.a.input = { ...t.a.input, yaw: Math.PI / 2, forward: 1 };
  t.step(RIPOSTE.thrustSec - DT);
  assert.ok(-t.a.position.z > 5 && Math.abs(t.a.position.x) < 0.05, `ended at ${t.a.position.x.toFixed(2)}, ${t.a.position.z.toFixed(2)}`);

  // a wall three metres ahead: the point is driven into it and the body stops short of it
  const world = flat();
  world.solids.push({ id: 'wall', center: [0, 1.5, -3.4], size: [8, 3, 0.5], material: 'stone' });
  const walled = duel({ world });
  press(walled);
  walled.step(techniqueDuration(RIPOSTE) + 0.1);
  assert.ok(-walled.a.position.z < 3.2, `stopped at ${(-walled.a.position.z).toFixed(2)} m`);
  assert.equal(walled.of('techniqueWorldContact').length, 1);

  // a knight in the way: the lunge ends at them, not through them
  const blocked = duel({ at: { x: 0, z: -3 } });
  press(blocked);
  blocked.step(techniqueDuration(RIPOSTE) + 0.1);
  assert.ok(-blocked.a.position.z < 3, `stopped at ${(-blocked.a.position.z).toFixed(2)} m`);
  assert.deepEqual(blocked.damage(), [24]);
});

// B cuts at A as A braces. `cut`: 0 the forehand (from B's right), 1 the backhand (from B's left), 2 the chop
function cutAtBrace(cut, at, facing) {
  const t = duel({ at, facing });
  // (a chain that follows straight on from one run through opens with the backhand: the rising chain)
  if (cut === 1) t.b.attackRun = { variant: 0, restartAt: t.now() };
  beginAttack(t.room, 'b', t.now());
  t.b.attackHeld = true;
  const contact = SWORD_STRIKE_TIMES[cut === 2 ? 2 : 0];
  t.step(contact - 0.2);
  t.a.health = 100; t.a.staggerUntil = -Infinity; t.a.stagger.level = 0; t.events.length = 0;
  Object.assign(t.a.position, { x: 0, y: 0, z: 0 }); t.a.velocity = { x: 0, y: 0, z: 0 }; t.a.impulse = { x: 0, z: 0 }; t.a.history = [];
  assert.equal(press(t), true);
  const prowess = t.a.prowess;
  t.step(0.3);
  return { t, prowess, turned: t.of('parry').find((e) => e.defenderId === 'a'), cut: t.events.some((e) => e.type === 'swordHit' && e.targetId === 'a') };
}

test('its raised sword turns a blade that really meets it, and only that', () => {
  // from in front, a backhand and a chop come in across the sword held up there: they are turned
  for (const cut of [1, 2]) {
    const { t, turned, cut: landed, prowess } = cutAtBrace(cut, { x: 0, z: -1.9 }, Math.PI);
    assert.ok(turned, `cut ${cut} from in front was turned`);
    assert.equal(turned.technique, 'rigid_riposte');
    assert.equal(landed, false);
    assert.equal(t.a.health, 100);
    assert.equal(t.a.prowess, prowess, 'turning a blow with a technique earns nothing');
    assert.ok(t.b.staggerUntil > t.now(), 'the one turned is staggered as by a parry');
  }
  // a forehand from dead ahead comes in round the sword's outside (it lies to the right of the middle): it lands.
  // In front is not enough: the blade has to be where the sword is
  const outside = cutAtBrace(0, { x: 0, z: -1.9 }, Math.PI);
  assert.equal(outside.turned, undefined);
  assert.equal(outside.cut, true);
  // the same forehand from the knight's right crosses it
  assert.ok(cutAtBrace(0, { x: 0.9, z: -1.7 }, Math.atan2(0.9, -1.7)).turned);
  // and from behind nothing is in a cut's way
  for (const cut of [0, 1, 2]) {
    const behind = cutAtBrace(cut, { x: 0, z: 1.9 }, 0);
    assert.equal(behind.turned, undefined, `cut ${cut} from behind`);
    assert.equal(behind.cut, true, `cut ${cut} from behind lands`);
  }

  // and before the sword is up, or once the thrust has gone, it turns nothing
  const late = duel({ at: { x: 0, z: -1.9 } });
  press(late);
  late.step(techniqueDuration(RIPOSTE) - 0.2);
  late.b.position.z = late.a.position.z - 1.9;
  late.b.history = [];
  beginAttack(late.room, 'b', late.now());
  late.step(SWORD_STRIKE_TIMES[0] + 0.1);
  assert.equal(late.of('parry').filter((e) => e.defenderId === 'a').length, 0);
});

test('a spell is cut out of the air only where the sword is', () => {
  const t = duel({ at: { x: 0, z: -9 } });
  press(t);
  t.step(RIPOSTE.enterSec);
  // thrown straight down the line the raised sword lies across
  const blade = techniqueBladeAt(t.a, t.now());
  const mid = { x: (blade.base.x + blade.tip.x) / 2, y: (blade.base.y + blade.tip.y) / 2, z: (blade.base.z + blade.tip.z) / 2 };
  t.room.projectiles.set('p1', { id: 'p1', ownerId: 'b', spell: 'fireball', position: { x: mid.x, y: mid.y, z: mid.z - 1.2 }, velocity: { x: 0, y: 0, z: 30 }, bornAt: t.now() });
  // and one at the knees, under it
  t.room.projectiles.set('p2', { id: 'p2', ownerId: 'b', spell: 'fireball', position: { x: 0, y: 0.5, z: -1.6 }, velocity: { x: 0, y: 0, z: 30 }, bornAt: t.now() });
  t.step(DT * 3);
  assert.deepEqual(t.of('techniqueDeflect').map((e) => e.projectileId), ['p1']);
  assert.ok(t.a.health < 100, 'the low one landed');
});

test('a held guard pays for a Riposte and a perfect one turns it; the defender earns as ever, the user never', () => {
  const held = duel({ at: { x: 0, z: -4.2 } });
  setGuard(held.room, 'b', true, held.now() - 2);
  held.b.guardStartedAt = held.now() - 2;
  const stamina = held.b.guardStamina;
  press(held);
  held.step(techniqueDuration(RIPOSTE));
  assert.deepEqual(held.damage(), []);
  assert.equal(held.of('block').length, 1);
  assert.ok(held.b.guardStamina < stamina - 20, 'the guard paid heavily for it');
  assert.equal(held.a.prowess, 0);

  const perfect = duel({ at: { x: 0, z: -4.2 } });
  press(perfect);
  perfect.step(RIPOSTE.enterSec + RIPOSTE.braceSec);
  setGuard(perfect.room, 'b', true, perfect.now());
  perfect.step(RIPOSTE.thrustSec + 0.05);
  assert.equal(perfect.of('parry').filter((e) => e.defenderId === 'b').length, 1);
  assert.equal(perfect.b.prowess, PROWESS.parry);
  assert.equal(perfect.a.prowess, 0);
  assert.ok(perfect.a.staggerUntil > perfect.now());
  assert.equal(perfect.of('techniqueEnd')[0].end, 'parried');
});

test('a Riposte earns its user no prowess; hardened plate blunts it; its victim still earns', () => {
  const t = duel({ at: { x: 0, z: -4.2 } });
  press(t);
  t.step(techniqueDuration(RIPOSTE) + 0.1);
  assert.equal(t.a.prowess, 0);
  assert.ok(Math.abs(t.b.prowess - 24 * PROWESS.taken) < 1e-6);

  const steel = duel({ at: { x: 0, z: -4.2 } });
  steel.b.steel = callSteel(steel.now());
  press(steel);
  steel.step(techniqueDuration(RIPOSTE) + 0.1);
  const [amount] = steel.damage();
  assert.ok(amount > 0 && amount < 24, `plate left ${amount}`);
});

test('in the air a Riposte is the Dash: it needs one ready and takes it', () => {
  const t = duel();
  t.a.position.y = 6; t.a.grounded = false; t.a.velocity.y = 0;
  t.a.dashReadyAt = t.now() + 3;
  assert.equal(press(t), false, 'no Dash, no airborne Riposte');
  t.a.dashReadyAt = 0;
  assert.equal(press(t), true);
  assert.ok(Math.abs(t.a.dashReadyAt - (t.now() + MOVEMENT.dashCooldown)) < 1e-6, 'the Dash is spent');
  assert.ok(!(t.a.dashUntil > t.now()), 'and no second movement is begun');
  // on the ground the Dash is left alone
  const ground = duel();
  press(ground);
  assert.equal(ground.a.dashReadyAt, 0);
});

test('a Riposte has its cooldown from where it ends, a broken balance ends it, and nothing else begins under it', () => {
  const t = duel();
  press(t);
  assert.equal(beginAttack(t.room, 'a', t.now()), false);
  assert.equal(setGuard(t.room, 'a', true, t.now()), false);
  assert.equal(tryCastSpell(t.room, 'a', { x: 0, y: 0, z: -1 }, t.now()), false);
  t.a.prowess = 100;
  assert.equal(tryUltimate(t.room, 'a', t.now()), false);
  t.step(techniqueDuration(RIPOSTE) + 0.05);
  assert.equal(t.a.techniqueState, null);
  const ended = t.of('techniqueEnd')[0].at;
  assert.ok(t.a.techniqueReadyAt > ended + 9.5 && t.a.techniqueReadyAt < ended + 10.1);
  assert.equal(press(t), false, 'cooling down');
  t.step(10);
  assert.equal(press(t), true);

  const broken = duel();
  press(broken);
  broken.step(0.15);
  broken.a.staggerUntil = broken.now() + 0.6;
  broken.step(DT * 2);
  assert.equal(broken.of('techniqueEnd')[0].end, 'interrupted');
  assert.ok(broken.a.techniqueReadyAt > broken.now() + 9);
  assert.ok(-broken.a.position.z < 0.5, 'no lunge came of it');
});

test('without a technique equipped the button is nothing, and a siege operator keeps X for the machine', () => {
  const none = duel({ technique: 'none' });
  assert.equal(press(none), false);
  const t = duel();
  t.a.operatingBallistaId = 'bl';
  applyRoomCommand(t.room, t.a, { type: 'technique', down: true }, t.now());
  assert.equal(t.a.techniqueState, null);
});

// --- Whirl Like the Wind

const whirlDuel = (options = {}) => duel({ technique: 'whirl_like_the_wind', at: { x: 0, z: -1.5 }, ...options });

test('one Whirl is once round for 16, free, and cuts each knight once a turn', () => {
  const t = whirlDuel();
  t.a.prowess = 60;
  press(t); press(t, false);
  t.step(techniqueDuration(WHIRL) + 0.1);
  assert.deepEqual(t.damage(), [16]);
  assert.equal(t.a.prowess, 60, 'the first turn is free, and its blow earns nothing');
  assert.equal(t.of('techniqueEnd')[0].end, 'released');
  assert.equal(t.a.techniqueState, null);
});

test('only the point reaching a knight is a glancing 13', () => {
  const reach = Math.hypot(techniqueBlade(WHIRL.clips.revolution, 0).tip.x, techniqueBlade(WHIRL.clips.revolution, 0).tip.z);
  const t = whirlDuel({ at: { x: 0, z: -(reach + 0.3) } });
  press(t); press(t, false);
  t.step(techniqueDuration(WHIRL) + 0.1);
  assert.deepEqual(t.damage(), [13]);
});

test('held, a Whirl goes round five times on a full meter: one free and four at 25 prowess', () => {
  const t = whirlDuel();
  t.a.prowess = 100;
  t.b.health = 1000;
  press(t);
  // (B is stood back where they were after each blow: what is asked is the count, not where the shove sends them)
  for (let n = 0; n < Math.round((WHIRL.enterSec + WHIRL.revolutionSec * 5 + WHIRL.exitSec + 0.2) / DT); n += 1) {
    t.step();
    Object.assign(t.b.position, { x: 0, y: 0, z: -1.5 }); t.b.velocity = { x: 0, y: 0, z: 0 }; t.b.impulse = { x: 0, z: 0 }; t.b.history = [];
    t.b.staggerUntil = -Infinity; t.b.stagger.level = 0;
  }
  assert.deepEqual(t.damage(), [16, 16, 16, 16, 16]);
  assert.equal(t.a.prowess, 0);
  assert.deepEqual(t.of('techniqueRevolution').map((e) => e.prowess), [75, 50, 25, 0]);
  assert.equal(t.of('techniqueEnd')[0].end, 'spent');
  assert.equal(t.of('techniqueEnd')[0].revolutions, 5);
  // and its cooldown runs from where it ended
  const ended = t.of('techniqueEnd')[0].at;
  assert.ok(t.a.techniqueReadyAt > ended + 9.5 && t.a.techniqueReadyAt < ended + 10.1);
});

test('let go, a Whirl ends at the turn it is on; with too little prowess it does not go round again', () => {
  const t = whirlDuel();
  t.a.prowess = 100;
  press(t);
  t.step(WHIRL.enterSec + WHIRL.revolutionSec * 1.5);
  press(t, false);
  t.step(WHIRL.revolutionSec + WHIRL.exitSec);
  assert.equal(t.of('techniqueEnd')[0].revolutions, 2);
  assert.equal(t.a.prowess, 75);

  const poor = whirlDuel();
  poor.a.prowess = 24;
  press(poor);
  poor.step(techniqueDuration(WHIRL) + 0.2);
  assert.equal(poor.of('techniqueEnd')[0].revolutions, 1);
  assert.equal(poor.a.prowess, 24);
});

test('a Whirl pays no prowess for anything it does, in a crowd or on a guard', () => {
  const t = whirlDuel();
  const c = t.room.addPlayer({ id: 'c', token: 'tc', name: 'C' }, t.now());
  Object.assign(c.position, { x: 1.5, y: 0, z: 0 }); c.spawnProtectionUntil = 0; c.history = [];
  setGuard(t.room, 'c', true, t.now() - 2); c.guardStartedAt = t.now() - 2; c.yaw = Math.PI / 2; c.input = { ...c.input, yaw: Math.PI / 2 };
  press(t); press(t, false);
  t.step(techniqueDuration(WHIRL) + 0.1);
  assert.equal(t.of('techniqueHit').length, 1);
  assert.equal(t.of('block').length, 1);
  assert.equal(t.a.prowess, 0);
});

test('a broken balance stops a Whirl, and its balance does not come back while it spins', () => {
  const t = whirlDuel({ at: { x: 0, z: -40 } });
  t.a.prowess = 100;
  t.a.stagger.level = 50; t.a.stagger.shakenAt = -Infinity;
  press(t);
  t.step(WHIRL.enterSec + WHIRL.revolutionSec * 2);
  assert.ok(t.a.stagger.level > 44, `balance drained to ${t.a.stagger.level} while spinning`);
  t.a.staggerUntil = t.now() + 0.8;
  t.step(DT * 2);
  assert.equal(t.of('techniqueEnd')[0].end, 'interrupted');
  assert.ok(t.a.techniqueReadyAt > t.now() + 9, 'interrupted, it still cools down');
});

test('a Whirl turns a blade only where its own is passing', () => {
  // a cut whose contact comes as the Whirl's blade is on the far side of the knight lands
  let turned = 0, landed = 0;
  for (let k = 0; k < 12; k += 1) {
    const t = whirlDuel({ at: { x: 0, z: -1.9 } });
    t.a.prowess = 100;
    t.b.health = 1000; t.a.health = 1000;
    beginAttack(t.room, 'b', t.now());
    // B's contact falls at a different moment of the turn each time
    t.step(Math.max(DT, SWORD_STRIKE_TIMES[0] - WHIRL.enterSec - 0.3 + k * 0.05));
    press(t);
    t.b.spawnProtectionUntil = Infinity; // (the Whirl's own blows are not what is being asked about)
    t.step(0.9);
    if (t.of('parry').some((e) => e.defenderId === 'a' && e.technique === 'whirl_like_the_wind')) turned += 1;
    else if (t.events.some((e) => e.type === 'swordHit' && e.targetId === 'a')) landed += 1;
  }
  assert.ok(turned >= 1, 'a cut that met the passing blade was turned');
  assert.ok(landed >= 3, `most cuts find the knight open (${landed} landed, ${turned} turned)`);
});

test('a Whirl begun on the ground carries on through a fall; in the air it needs Gale Garner carried', () => {
  const t = whirlDuel({ at: { x: 0, z: -40 } });
  t.a.position.y = 5; t.a.grounded = false;
  assert.equal(press(t), false);
  // (begun on the ground, then the ground is gone)
  const world = flat();
  world.floors = [{ id: 'ledge', center: [0, -0.1, 0], size: [4, 0.2, 4], y: 0 }, { id: 'below', center: [0, -6.1, 0], size: [120, 0.2, 120], y: -6 }];
  const fall = whirlDuel({ world, at: { x: 0, z: 1 } });
  fall.a.prowess = 100;
  press(fall);
  fall.a.input = { ...fall.a.input, forward: 1 };
  fall.step(WHIRL.enterSec + WHIRL.revolutionSec * 1.5);
  assert.equal(fall.a.grounded, false, 'off the ledge');
  assert.equal(techniqueMoment(fall.a.techniqueState, fall.now())?.phase, 'spin', 'still going round');
});

test('with Gale Garner carried a Whirl may begin in the air and climbs on a held Jump, the spell neither cast nor spent', () => {
  const t = whirlDuel({ spell: 'gale', at: { x: 0, z: -40 } });
  t.a.position.y = 5; t.a.grounded = false; t.a.velocity.y = 0;
  t.a.prowess = 100;
  const ready = t.a.spellReadyAt;
  assert.equal(press(t), true);
  t.a.input = { ...t.a.input, jump: true };
  const from = t.a.position.y;
  t.step(WHIRL.enterSec + WHIRL.revolutionSec * 2);
  assert.ok(t.a.position.y > from + 4, `climbed ${(t.a.position.y - from).toFixed(2)} m`);
  assert.equal(t.a.spellReadyAt, ready);
  assert.equal(t.a.gust ?? null, null);
  assert.equal(t.events.filter((e) => /gale|cast|spell/i.test(e.type)).length, 0);
  // without Jump it falls as ever (no slow fall: it is not a Vortex)
  const drop = whirlDuel({ spell: 'gale', at: { x: 0, z: -40 } });
  drop.a.position.y = 5; drop.a.grounded = false;
  press(drop);
  drop.step(0.5);
  assert.ok(drop.a.position.y < 5 - 0.5 * MOVEMENT.gravity * 0.5 * 0.5 * 0.8, `fell to ${drop.a.position.y.toFixed(2)}`);
  // and with another spell carried, a held Jump on the ground is only a jump
  const plain = whirlDuel({ at: { x: 0, z: -40 } });
  plain.a.prowess = 100;
  press(plain);
  plain.a.input = { ...plain.a.input, jump: true };
  plain.step(WHIRL.enterSec + WHIRL.revolutionSec * 2);
  assert.ok(plain.a.position.y < 1.6, `rose only ${plain.a.position.y.toFixed(2)} m`);
});

test('in the Practice Yard a held Whirl goes on and on; in a match it never does', () => {
  const yard = whirlDuel({ mode: GAME_MODES.PRACTICE, at: { x: 0, z: -40 } });
  assert.equal(press(yard), true);
  yard.step(WHIRL.enterSec + WHIRL.revolutionSec * 9.5);
  assert.equal(techniqueMoment(yard.a.techniqueState, yard.now())?.phase, 'spin');
  assert.ok(yard.a.techniqueState.revolutions >= 10);
  // (the yard's meter is the yard's: it is filled there, by the yard, every tick)
  assert.equal(yard.a.prowess, PROWESS.full);

  for (const mode of [GAME_MODES.FFA]) {
    const match = whirlDuel({ mode, at: { x: 0, z: -40 } });
    match.a.prowess = 100;
    press(match);
    match.step(WHIRL.enterSec + WHIRL.revolutionSec * 9.5);
    assert.equal(match.a.techniqueState, null, mode);
    assert.equal(match.of('techniqueEnd')[0].revolutions, 5, mode);
    assert.equal(match.a.prowess, 0, mode);
  }
});

test('a Whirl turns the other way to a Blazing Vortex, and is replicated as one action state', () => {
  // the Whirl's blade, a little into its turn: to the knight's right of where it began (clockwise from above)
  const a = techniqueBlade(WHIRL.clips.revolution, 0).tip, b = techniqueBlade(WHIRL.clips.revolution, 0.05).tip;
  const turn = Math.sign(a.x * b.z - a.z * b.x) * -1; // + when the yaw grows (anticlockwise from above)
  assert.equal(turn, WHIRL_TURN);
  assert.ok(vortexAngle({ angle: 0, angleAt: 0, rate: 2 * Math.PI * vortexTune(0).revPerSec }, 0.05) > 0, 'a Vortex turns the other way');
  // once round exactly, back where it began
  const end = techniqueBlade(WHIRL.clips.revolution, WHIRL.revolutionSec).tip;
  assert.ok(Math.hypot(end.x - a.x, end.y - a.y, end.z - a.z) < 1e-3);

  const t = whirlDuel();
  press(t);
  t.step(0.3);
  const snapshot = serializeSnapshot(t.room, t.now(), 'b');
  const seen = snapshot.players.find((p) => p.id === 'a');
  assert.equal(seen.technique, 'whirl_like_the_wind');
  assert.deepEqual(Object.keys(seen.techniqueState).sort(), ['airborne', 'id', 'lift', 'lifting', 'revolutions', 'spinAt', 'startedAt']);
  assert.equal(techniqueMoment(seen.techniqueState, t.now()).phase, 'spin');
});

test('a technique chosen in the Armory is the knight\'s in the room, and is kept from match to match', () => {
  const t = duel({ technique: 'whirl_like_the_wind' });
  assert.equal(t.a.technique, 'whirl_like_the_wind');
  assert.equal(t.a.startingTechnique, 'whirl_like_the_wind');
  assert.equal(t.b.technique, 'none');
  const odd = new Room('ODD');
  assert.equal(odd.addPlayer({ id: 'x', token: 't', name: 'X', technique: 'not_a_technique' }, 0).technique, 'none');
});
