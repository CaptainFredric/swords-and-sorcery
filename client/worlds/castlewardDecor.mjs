function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function jitter(random, amount) {
  return (random() - 0.5) * amount;
}

export function buildCastlewardDecorPlan(seed = 1337) {
  const random = seededRandom(seed);

  const houses = [
    { id: 'north-cottage', x: -18.7, y: 3.6, z: 6.6, sx: 5.3, sz: 5.5, roof: 'thatch', yaw: jitter(random, 0.05) },
    { id: 'south-cottage', x: -18.3, y: 3.4, z: -4.8, sx: 5.8, sz: 5.1, roof: 'slate', yaw: jitter(random, 0.04) },
    { id: 'mid-cottage', x: -12.4, y: 3.0, z: 5.4, sx: 3.6, sz: 3.8, roof: 'thatch', yaw: jitter(random, 0.035) },
    { id: 'west-backdrop-a', x: -25.0, y: 3.2, z: 10.5, sx: 5.2, sz: 4.8, roof: 'slate', yaw: -0.08 },
    { id: 'west-backdrop-b', x: -25.4, y: 2.9, z: -9.7, sx: 4.6, sz: 4.3, roof: 'thatch', yaw: 0.07 },
    { id: 'south-backdrop', x: 8.8, y: 3.0, z: -25.4, sx: 4.8, sz: 4.2, roof: 'slate', yaw: -0.12 },
  ];

  const trees = [
    [-21.8, 11.7], [-16.0, 12.4], [-10.4, 12.2],
    [10.5, 12.6], [15.2, 13.0], [20.3, 13.2], [24.8, 11.6],
    [25.4, 6.0], [25.5, -1.0], [25.3, -8.2],
    [13.0, -9.2], [18.7, -9.5], [23.0, -10.0],
    [-10.2, -10.6], [-15.8, -10.9], [-21.4, -11.1],
  ].map(([x, z], index) => ({
    id: `tree-${index}`,
    x: x + jitter(random, 0.55),
    z: z + jitter(random, 0.55),
    scale: 0.9 + random() * 0.28,
    turn: random() * Math.PI * 2,
  }));

  const torches = [
    [-5.0, 1.7, 15.0], [5.0, 1.7, 15.0],
    [-7.9, 3.3, 24.8], [7.9, 3.3, 24.8],
    [-20.9, 1.7, 3.5], [-20.9, 1.7, -2.8],
    [-4.4, 1.7, -21.6], [4.4, 1.7, -21.6],
  ].map(([x, y, z], index) => ({ id: `torch-${index}`, x, y, z }));

  const castlePieces = [];
  for (const x of [-7.8, -5.9, -4.0, 4.0, 5.9, 7.8]) {
    castlePieces.push({ id: `front-merlon-${x}`, kind: 'merlon', x, y: 4.35, z: 15.8, sx: 1.05, sy: 0.9, sz: 0.8 });
  }
  for (const x of [-7.8, -5.2, -2.6, 0, 2.6, 5.2, 7.8]) {
    castlePieces.push({ id: `back-merlon-${x}`, kind: 'merlon', x, y: 5.8, z: 26.0, sx: 1.15, sy: 0.95, sz: 0.75 });
  }
  castlePieces.push(
    { id: 'west-gate-cap', kind: 'cap', x: -5.8, y: 4.14, z: 15.8, sx: 3.45, sy: 0.25, sz: 2.45 },
    { id: 'east-gate-cap', kind: 'cap', x: 5.8, y: 4.14, z: 15.8, sx: 3.45, sy: 0.25, sz: 2.45 },
  );

  const fences = [
    { id: 'east-north-fence', x: 20.2, y: 0.65, z: 11.4, length: 6.5, axis: 'x' },
    { id: 'east-south-fence', x: 19.0, y: 0.65, z: -7.7, length: 8.5, axis: 'x' },
    { id: 'west-bank-rail', x: -22.0, y: 1.25, z: 0.5, length: 15.0, axis: 'z' },
  ];

  const banners = [
    { id: 'bailey-banner-west', x: -4.6, y: 4.2, z: 25.94, width: 1.15, height: 2.1, color: 0x7a2f27 },
    { id: 'bailey-banner-east', x: 4.6, y: 4.2, z: 25.94, width: 1.15, height: 2.1, color: 0x7a2f27 },
  ];

  const market = [
    { id: 'market-awning', kind: 'awning', x: 4.8, y: 1.65, z: 4.0, sx: 3.15, sy: 0.12, sz: 2.55 },
    { id: 'market-cart', kind: 'cart', x: 6.8, y: 0.55, z: -4.4, yaw: 0.35 },
    { id: 'well-roof', kind: 'well-roof', x: -2.8, y: 2.15, z: -1.0 },
  ];

  return { houses, trees, torches, castlePieces, fences, banners, market };
}
