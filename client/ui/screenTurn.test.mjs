import assert from 'node:assert/strict';
import test from 'node:test';
import { gameSize, sideFromGravity, toGamePoint, toGameVector, TURN, turnAngle } from './screenTurn.mjs';

// where the CSS in mobile.css puts a point of the game on the screen (transform-origin 0 0)
function cssTransform(angle, width, height, x, y) {
  // 90: translateX(screen width) rotate(90deg); -90: translateY(screen height) rotate(-90deg)
  if (angle === 90) return { x: width - y, y: x };
  if (angle === -90) return { x: y, y: height - x };
  return { x, y };
}

test('the game lies sideways only when asked to, on a screen taller than wide, and never while typing', () => {
  assert.equal(turnAngle({ width: 390, height: 844, mode: 'auto' }), 0);
  assert.equal(turnAngle({ width: 390, height: 844, mode: 'sideways' }), 90, 'phone top to the left by default');
  assert.equal(turnAngle({ width: 390, height: 844, mode: 'sideways', side: 'right' }), -90);
  assert.equal(turnAngle({ width: 844, height: 390, mode: 'sideways' }), 0, 'an app that does turn needs no help');
  assert.equal(turnAngle({ width: 390, height: 844, mode: 'sideways', typing: true }), 0, 'upright for the keyboard');
  assert.deepEqual(gameSize(90, 390, 844), { width: 844, height: 390 });
  assert.deepEqual(gameSize(0, 390, 844), { width: 390, height: 844 });
});

test('a touch lands where the player sees it: screen points map back through the CSS turn exactly', () => {
  const width = 390;
  const height = 844;
  for (const angle of [90, -90, 0]) {
    const size = gameSize(angle, width, height);
    for (const [x, y] of [[0, 0], [size.width, 0], [0, size.height], [120, 45], [size.width - 10, size.height - 20]]) {
      const screen = cssTransform(angle, width, height, x, y);
      assert.ok(screen.x >= -1e-9 && screen.x <= width + 1e-9 && screen.y >= -1e-9 && screen.y <= height + 1e-9, 'the game fills the screen');
      assert.deepEqual(toGamePoint(angle, width, height, screen.x, screen.y), { x, y }, `angle ${angle} point ${x},${y}`);
    }
  }
});

test('a drag turns with the game: a thumb moving right across the sideways game is a move to the right', () => {
  for (const angle of [90, -90, 0]) {
    const from = cssTransform(angle, 390, 844, 100, 100);
    const to = cssTransform(angle, 390, 844, 160, 100);
    assert.deepEqual(toGameVector(angle, to.x - from.x, to.y - from.y), { x: 60, y: 0 }, `angle ${angle}`);
    const down = cssTransform(angle, 390, 844, 100, 140);
    assert.deepEqual(toGameVector(angle, down.x - from.x, down.y - from.y), { x: 0, y: 40 });
  }
});

test('which way the phone is held, from gravity: sides need a clear tilt, and a flat phone has no opinion', () => {
  assert.equal(sideFromGravity(0, 9.8), 'upright');
  assert.equal(sideFromGravity(9.8, 0), 'left', 'the top turned to the left: gravity pulls toward the left edge');
  assert.equal(sideFromGravity(-9.8, 0), 'right');
  assert.equal(sideFromGravity(0, -9.8), 'down');
  assert.equal(sideFromGravity(0.5, 0.4), null, 'lying on a table');
  // just past the threshold either side
  const lean = (degrees) => sideFromGravity(Math.sin((degrees * Math.PI) / 180) * 9.8, Math.cos((degrees * Math.PI) / 180) * 9.8);
  assert.equal(lean(TURN.enterDeg + 2), 'left');
  assert.equal(lean(TURN.enterDeg - 5), 'upright');
  assert.equal(lean(-(TURN.enterDeg + 2)), 'right');
});
