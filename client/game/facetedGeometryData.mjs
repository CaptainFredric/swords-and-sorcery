const DEGENERATE_EPSILON = 1e-12;

function requirePositive(name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite positive number`);
  }
  return value;
}

function requireFinite(name, value) {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  return value;
}

function addTriangle(data, a, b, c) {
  const base = data.positions.length / 3;
  data.positions.push(...a, ...b, ...c);
  data.indices.push(base, base + 1, base + 2);
}

function addQuad(data, a, b, c, d) {
  const base = data.positions.length / 3;
  data.positions.push(...a, ...b, ...c, ...d);
  data.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function prismFaces(bottom, top) {
  const data = { positions: [], indices: [] };
  const [b0, b1, b2, b3] = bottom;
  const [t0, t1, t2, t3] = top;

  addQuad(data, b0, t0, t1, b1); // front (-z)
  addQuad(data, b3, b2, t2, t3); // back (+z)
  addQuad(data, b0, b3, t3, t0); // left (-x)
  addQuad(data, b1, t1, t2, b2); // right (+x)
  addQuad(data, b0, b1, b2, b3); // bottom (-y)
  addQuad(data, t0, t3, t2, t1); // top (+y)

  return data;
}

export function validateGeometryData(data) {
  if (!data || !Array.isArray(data.positions) || !Array.isArray(data.indices)) {
    throw new TypeError('geometry data must contain positions and indices arrays');
  }
  if (data.positions.length < 9 || data.positions.length % 3 !== 0) {
    throw new RangeError('positions must contain complete xyz vertices');
  }
  if (data.indices.length < 3 || data.indices.length % 3 !== 0) {
    throw new RangeError('indices must contain complete triangles');
  }
  if (!data.positions.every(Number.isFinite)) throw new RangeError('positions must be finite');

  const vertexCount = data.positions.length / 3;
  for (const index of data.indices) {
    if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
      throw new RangeError(`index ${index} is outside geometry vertex range`);
    }
  }

  for (let i = 0; i < data.indices.length; i += 3) {
    const ia = data.indices[i] * 3;
    const ib = data.indices[i + 1] * 3;
    const ic = data.indices[i + 2] * 3;
    const ax = data.positions[ia]; const ay = data.positions[ia + 1]; const az = data.positions[ia + 2];
    const abx = data.positions[ib] - ax; const aby = data.positions[ib + 1] - ay; const abz = data.positions[ib + 2] - az;
    const acx = data.positions[ic] - ax; const acy = data.positions[ic + 1] - ay; const acz = data.positions[ic + 2] - az;
    const cx = aby * acz - abz * acy;
    const cy = abz * acx - abx * acz;
    const cz = abx * acy - aby * acx;
    if (cx * cx + cy * cy + cz * cz <= DEGENERATE_EPSILON) {
      throw new RangeError(`degenerate triangle at indices ${i}-${i + 2}`);
    }
  }

  return data;
}

export function geometryBounds(data) {
  validateGeometryData(data);
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };

  for (let i = 0; i < data.positions.length; i += 3) {
    const x = data.positions[i];
    const y = data.positions[i + 1];
    const z = data.positions[i + 2];
    min.x = Math.min(min.x, x); max.x = Math.max(max.x, x);
    min.y = Math.min(min.y, y); max.y = Math.max(max.y, y);
    min.z = Math.min(min.z, z); max.z = Math.max(max.z, z);
  }

  return {
    min,
    max,
    size: { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z },
  };
}

export function taperedPrismData({
  height,
  topWidth,
  bottomWidth,
  topDepth,
  bottomDepth,
  topOffsetX = 0,
  topOffsetZ = 0,
}) {
  requirePositive('height', height);
  requirePositive('topWidth', topWidth);
  requirePositive('bottomWidth', bottomWidth);
  requirePositive('topDepth', topDepth);
  requirePositive('bottomDepth', bottomDepth);
  requireFinite('topOffsetX', topOffsetX);
  requireFinite('topOffsetZ', topOffsetZ);

  const y0 = -height / 2;
  const y1 = height / 2;
  const bottom = [
    [-bottomWidth / 2, y0, -bottomDepth / 2],
    [bottomWidth / 2, y0, -bottomDepth / 2],
    [bottomWidth / 2, y0, bottomDepth / 2],
    [-bottomWidth / 2, y0, bottomDepth / 2],
  ];
  const top = [
    [topOffsetX - topWidth / 2, y1, topOffsetZ - topDepth / 2],
    [topOffsetX + topWidth / 2, y1, topOffsetZ - topDepth / 2],
    [topOffsetX + topWidth / 2, y1, topOffsetZ + topDepth / 2],
    [topOffsetX - topWidth / 2, y1, topOffsetZ + topDepth / 2],
  ];

  return validateGeometryData(prismFaces(bottom, top));
}

export function wedgeData({ width, height, depth, slope = 0.35 }) {
  requirePositive('width', width);
  requirePositive('height', height);
  requirePositive('depth', depth);
  if (!Number.isFinite(slope) || slope < 0 || slope >= 1) {
    throw new RangeError('slope must be finite and in the range [0, 1)');
  }

  const y0 = -height / 2;
  const frontY = height / 2;
  const backY = frontY - height * slope;
  const bottom = [
    [-width / 2, y0, -depth / 2],
    [width / 2, y0, -depth / 2],
    [width / 2, y0, depth / 2],
    [-width / 2, y0, depth / 2],
  ];
  const top = [
    [-width / 2, frontY, -depth / 2],
    [width / 2, frontY, -depth / 2],
    [width / 2, backY, depth / 2],
    [-width / 2, backY, depth / 2],
  ];

  return validateGeometryData(prismFaces(bottom, top));
}

export function bladeData({ length, width, thickness, tipLength, ridge = 0.28 }) {
  requirePositive('length', length);
  requirePositive('width', width);
  requirePositive('thickness', thickness);
  requirePositive('tipLength', tipLength);
  if (tipLength >= length) throw new RangeError('tipLength must be shorter than length');
  if (!Number.isFinite(ridge) || ridge <= 0 || ridge >= 1) {
    throw new RangeError('ridge must be finite and in the range (0, 1)');
  }

  const data = { positions: [], indices: [] };
  const halfWidth = width / 2;
  const halfThickness = thickness / 2;
  const ridgeX = halfWidth * ridge;
  const bodyEnd = length - tipLength;
  const section = [
    [-halfWidth, 0],
    [-ridgeX, halfThickness],
    [ridgeX, halfThickness],
    [halfWidth, 0],
    [ridgeX, -halfThickness],
    [-ridgeX, -halfThickness],
  ];

  for (let i = 0; i < section.length; i += 1) {
    const next = (i + 1) % section.length;
    const [x0, z0] = section[i];
    const [x1, z1] = section[next];
    addQuad(data, [x0, 0, z0], [x1, 0, z1], [x1, bodyEnd, z1], [x0, bodyEnd, z0]);
    addTriangle(data, [x0, bodyEnd, z0], [x1, bodyEnd, z1], [0, length, 0]);
    addTriangle(data, [0, 0, 0], [x1, 0, z1], [x0, 0, z0]);
  }

  return validateGeometryData(data);
}
