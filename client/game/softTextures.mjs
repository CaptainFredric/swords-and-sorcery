// Soft textures for effects, each drawn once on a small canvas and shared: a puff (bright in the middle, fading out to
// nothing) and a streak of wind (a soft head and a long fading tail, along the texture's v). White, so a material's
// colour tints them.

import * as THREE from 'three';

const cache = new Map();

function drawn(key, width, height, paint) {
  if (!cache.has(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    paint(canvas.getContext('2d'), width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    cache.set(key, texture);
  }
  return cache.get(key);
}

function radial(g, w, stops) {
  const gradient = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  for (const [at, alpha] of stops) gradient.addColorStop(at, `rgba(255,255,255,${alpha})`);
  g.fillStyle = gradient;
  g.fillRect(0, 0, w, w);
}

export function puffTexture() {
  return drawn('puff', 64, 64, (g, w) => radial(g, w, [[0, 0.9], [0.45, 0.45], [1, 0]]));
}

// the canvas's top row is the texture's v = 1: the streak's head, where it is going
export function windStreakTexture() {
  return drawn('windStreak', 4, 64, (g, w, h) => {
    const streak = g.createLinearGradient(0, 0, 0, h);
    for (const [at, alpha] of [[0, 0], [0.12, 1], [0.45, 0.45], [1, 0]]) streak.addColorStop(at, `rgba(255,255,255,${alpha})`);
    g.fillStyle = streak;
    g.fillRect(0, 0, w, h);
  });
}

// a four-pointed star (a twinkle): a hot middle and four thin rays, the upright pair the longer
export function starTexture() {
  return drawn('star', 128, 128, (g, w) => {
    const c = w / 2;
    g.translate(c, c);
    const ray = (length, width) => {
      const fade = g.createLinearGradient(0, 0, 0, -length);
      fade.addColorStop(0, 'rgba(255,255,255,0.95)');
      fade.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = fade;
      g.beginPath();
      g.moveTo(-width, 0);
      g.quadraticCurveTo(-width * 0.2, -length * 0.3, 0, -length);
      g.quadraticCurveTo(width * 0.2, -length * 0.3, width, 0);
      g.fill();
    };
    for (let i = 0; i < 4; i += 1) {
      ray(i % 2 === 0 ? c * 0.98 : c * 0.62, c * 0.12);
      g.rotate(Math.PI / 2);
    }
    const heart = g.createRadialGradient(0, 0, 0, 0, 0, c * 0.34);
    heart.addColorStop(0, 'rgba(255,255,255,1)');
    heart.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = heart;
    g.fillRect(-c, -c, w, w);
  });
}
