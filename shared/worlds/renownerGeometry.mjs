// The native asset is 4.5 m high. Restless Day fits it to its wider, taller
// destructible volume while retaining the existing fixed stone podium.
export const RESTLESS_RENOWNER_SCALE = 1.27;
export const RENOWNER_BLADE_TIP = Object.freeze([0.005046820268034935, -1.506389856338501, -0.002698063850402832]);
export const RENOWNER_MOUTH = Object.freeze([0, 0.92, 0.76]);

// One fixed, uniformly enlarged sword for the monumental combat installation.
// Court retains the native weapon. The sword never changes size during a pose.
export const RESTLESS_RENOWNER_SWORD_SCALE = 1.55;
export const RENOWNER_SWORD_LENGTH = Math.hypot(...RENOWNER_BLADE_TIP);

export function restlessRenownerBlade(renowner, now) {
  const { position, yaw, attack } = renowner;
  const sweep = attack.type === 'sweep';
  const progress = Math.min(1, Math.max(0, (now - attack.contactAt) / 0.25));
  const theta = yaw + (sweep ? (progress - 0.5) * 2.3 : 0);
  const pitch = sweep ? -Math.PI * .33 : -Math.PI * (.30 + progress * .12);
  const length = RENOWNER_SWORD_LENGTH * RESTLESS_RENOWNER_SCALE * RESTLESS_RENOWNER_SWORD_SCALE;
  const gripDistance = .75 * RESTLESS_RENOWNER_SCALE;
  const gripHeight = 2.8 * RESTLESS_RENOWNER_SCALE;
  const a = [position.x + Math.sin(theta) * gripDistance, position.y + gripHeight,
    position.z + Math.cos(theta) * gripDistance];
  return { a, b: [a[0] + Math.sin(theta) * Math.cos(pitch) * length,
    a[1] + Math.sin(pitch) * length, a[2] + Math.cos(theta) * Math.cos(pitch) * length] };
}

export function restlessRenownerMouth({position, yaw}) {
  const [x, y, z] = RENOWNER_MOUTH.map(value => value * RESTLESS_RENOWNER_SCALE);
  return { x: position.x + x * Math.cos(yaw) + z * Math.sin(yaw),
    y: position.y + y, z: position.z - x * Math.sin(yaw) + z * Math.cos(yaw) };
}
