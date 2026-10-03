import * as THREE from 'three';
import { ULTIMATES } from '../../shared/src/ultimates.mjs';

import { CHIVALRY_SIGNATURES, CHIVALRY_END_SEC, chivalryTellState, chivalryTellStyle } from './chivalryPresentation.mjs';

const _up = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _delta = new THREE.Vector3();

/** A restrained heraldic link follows the real sword and sorcery hands. */
export function createChivalryLink(root, sockets, options = {}) {
  const style = chivalryTellStyle(options);
  const group = new THREE.Group();
  group.name = 'ChivalryHeraldicLink';
  group.visible = false;
  root.add(group);
  const gold = new THREE.MeshBasicMaterial({ color: 0xffd478, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const cyan = gold.clone(); cyan.color.setHex(0x8bf4ff);
  const segmentGeometry = new THREE.CylinderGeometry(style.thickness, style.thickness, 1, 5);
  const segments = Array.from({ length: 8 }, (_, i) => {
    const mesh = new THREE.Mesh(segmentGeometry, i % 2 ? cyan : gold);
    group.add(mesh); return mesh;
  });
  const crestGeometry = new THREE.OctahedronGeometry(style.crestRadius, 0);
  const crest = new THREE.Mesh(crestGeometry, gold); group.add(crest);
  const signatureGeometry = new THREE.OctahedronGeometry(style.signatureRadius, 0);
  const signatures = Array.from({ length: 3 }, () => {
    const mesh = new THREE.Mesh(signatureGeometry, cyan.clone());
    group.add(mesh); return mesh;
  });
  let state = {};
  let endedEventAt = null;
  let activeEventAt = null;
  let disposed = false;
  const points = Array.from({ length: 9 }, () => new THREE.Vector3());

  return {
    event(event) {
      if (event.type === 'death') { endedEventAt = event.at; activeEventAt = null; return; }
      if (event.ultimate !== 'chivalry') return;
      if (event.type === 'ultimateActive') { activeEventAt = event.at; endedEventAt = null; }
      if (event.type === 'ultimateEnded' || event.type === 'ultimateInterrupted') { endedEventAt = event.at; activeEventAt = null; }
    },
    set(player, now, concurrent = {}) {
      if (disposed) return;
      if (!player?.alive) activeEventAt = null;
      state = chivalryTellState(player, now, state);
      // Events clear stale buffered snapshots immediately; snapshots recover a missed event.
      if (endedEventAt !== null && (player?.ultimateState?.commitAt ?? -Infinity) <= endedEventAt) {
        state = { ...state, active: false, endedAt: endedEventAt, opacity: Math.max(0, 1 - (now - endedEventAt) / CHIVALRY_END_SEC) };
      }
      if (activeEventAt !== null && player?.alive && now >= activeEventAt && now < activeEventAt + ULTIMATES.chivalry.activeSec && (!player.ultimateState || player.ultimateState.phase === 'startup')) {
        state = { ...state, active: true, committedAt: activeEventAt, opacity: 1 };
      }
      group.visible = state.opacity > 0.001;
      if (!group.visible) return;
      const hands = sockets();
      if (!hands?.sword || !hands?.sorcery) { group.visible = false; return; }
      root.updateWorldMatrix(true, false);
      hands.sword.getWorldPosition(_a); root.worldToLocal(_a);
      hands.sorcery.getWorldPosition(_b); root.worldToLocal(_b);
      const collapse = state.active ? 0 : 1 - state.opacity;
      const pulse = 0.86 + 0.14 * Math.sin(now * 9);
      const overlap = Number(concurrent.attack) + Number(concurrent.guard) + Number(concurrent.cast) + Number(concurrent.dash);
      gold.opacity = state.opacity * pulse * style.opacity;
      cyan.opacity = state.opacity * (overlap > 1 ? 0.95 : 0.7) * style.opacity;
      // Both endpoints remain tied to the sockets, folding into the sorcery palm on expiry.
      _a.lerp(_b, collapse);
      for (let i = 0; i < points.length; i += 1) {
        const t = i / (points.length - 1);
        points[i].copy(_a).lerp(_b, t);
        points[i].y += Math.sin(t * Math.PI) * style.archY * (1 - collapse);
        points[i].z += Math.sin(t * Math.PI) * style.archZ;
      }
      for (let i = 0; i < segments.length; i += 1) {
        _delta.subVectors(points[i + 1], points[i]);
        segments[i].position.copy(points[i]).add(points[i + 1]).multiplyScalar(0.5);
        segments[i].quaternion.setFromUnitVectors(_up, _delta.clone().normalize());
        segments[i].scale.set(1, _delta.length(), 1);
      }
      crest.position.copy(style.palmMarks ? _b : points[4]);
      if (style.palmMarks) crest.position.y -= 0.024;
      crest.rotation.z = Math.PI / 4;
      crest.scale.setScalar((overlap > 1 ? 1.2 : 1) * (1 - collapse));
      const age = now - (state.committedAt ?? now);
      const commit = state.active && age < 0.55;
      for (let i = 0; i < signatures.length; i += 1) {
        const mark = signatures[i];
        mark.material.color.setHex(CHIVALRY_SIGNATURES[state.signatures[i]] ?? CHIVALRY_SIGNATURES.fireball);
        mark.material.opacity = state.opacity * (commit ? 1 : 0.55) * style.opacity;
        mark.position.copy(style.palmMarks ? _b : points[2 + i * 2]);
        if (style.palmMarks) { mark.position.x += (i - 1) * 0.022; mark.position.y += 0.018; mark.position.z -= 0.014; }
        mark.position.y += commit ? Math.sin(Math.min(1, age / 0.55) * Math.PI) * style.commitRise : 0;
        mark.rotation.y = now * (1.2 + i * 0.3);
        mark.scale.setScalar(commit ? 1.5 : 0.6 * (1 - collapse));
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true; root.remove(group);
      segmentGeometry.dispose(); crestGeometry.dispose(); signatureGeometry.dispose();
      gold.dispose(); cyan.dispose(); for (const mark of signatures) mark.material.dispose();
    },
  };
}
