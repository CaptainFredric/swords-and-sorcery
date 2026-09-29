// Soft textures for effects, each drawn once on a small canvas and shared: a puff (bright in the middle, fading out to
// nothing), a streak of wind (a soft head and a long fading tail, along the texture's v) and a swirl (two arms of air,
// to be seen turning). White, so a material's colour tints them.

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

export function swirlTexture() {
  return drawn('swirl', 64, 64, (g, w) => {
    g.lineCap = 'round';
    g.filter = 'blur(1.5px)';
    for (let arm = 0; arm < 2; arm += 1) {
      const steps = 24;
      for (let i = 0; i < steps; i += 1) {
        // each arm curls inward a little as it trails off behind its head
        const t = i / steps;
        const from = arm * Math.PI + t * Math.PI * 0.95;
        const radius = w * (0.36 - 0.1 * t);
        g.strokeStyle = `rgba(255,255,255,${(1 - t) ** 1.5})`;
        g.lineWidth = w * (0.09 - 0.05 * t);
        g.beginPath();
        g.arc(w / 2, w / 2, radius, from, from + (Math.PI * 0.95) / steps + 0.02);
        g.stroke();
      }
    }
  });
}
