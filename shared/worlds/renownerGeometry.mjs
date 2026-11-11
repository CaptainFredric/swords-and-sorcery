// The native asset is 4.5 m high. Restless Day fits it to its wider, taller
// destructible volume while retaining the existing fixed stone podium.
export const RESTLESS_RENOWNER_SCALE = 1.27;
export const RENOWNER_BLADE_TIP = Object.freeze([0.102362, -1.5810286, -0.0816969]);
export const RENOWNER_MOUTH = Object.freeze([0, 0.92, 0.76]);

export function restlessRenownerBlade(renowner, now) {
  const { position, yaw, attack } = renowner;
  const sweep = attack.type === 'sweep';
  const progress = Math.min(1, Math.max(0, (now - attack.contactAt) / 0.25));
  const theta = yaw + (sweep ? (progress - 0.5) * 2.3 : 0);
  const reach = sweep ? 7.8 : 5.8;
  const point = (distance, y) => [position.x + Math.sin(theta) * distance,
    position.y + y, position.z + Math.cos(theta) * distance];
  return {
    a: point(1.03, 2.9),
    b: point(reach, sweep ? 0.6 : -0.25),
  };
}

export function restlessRenownerMouth({position, yaw}) {
  const [x, y, z] = RENOWNER_MOUTH.map(value => value * RESTLESS_RENOWNER_SCALE);
  return { x: position.x + x * Math.cos(yaw) + z * Math.sin(yaw),
    y: position.y + y, z: position.z - x * Math.sin(yaw) + z * Math.cos(yaw) };
}
