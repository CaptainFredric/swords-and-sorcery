import * as THREE from 'three';
import { ULTIMATES } from '../../shared/src/ultimates.mjs';

import { CHIVALRY_SIGNATURES, CHIVALRY_END_SEC, chivalryTellState, chivalryTellStyle } from './chivalryPresentation.mjs';

const _b = new THREE.Vector3();

/** A brief prepared spell commit tell follows the sorcery palm, with no cross body geometry. */
export function createChivalryLink(root, sockets, options = {}) {
  const style = chivalryTellStyle(options);
  const group = new THREE.Group();
  group.name = 'ChivalryCommitSignatures';
  group.visible = false;
  root.add(group);
  const gold = new THREE.MeshBasicMaterial({ color: 0xffd478, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const cyan = gold.clone(); cyan.color.setHex(0x8bf4ff);
  const signatureGeometry = new THREE.OctahedronGeometry(style.signatureRadius, 0);
  const signatures = Array.from({ length: 3 }, () => {
    const mesh = new THREE.Mesh(signatureGeometry, cyan.clone());
    group.add(mesh); return mesh;
  });
  let state = {};
  let endedEventAt = null;
  let activeEventAt = null;
  let disposed = false;

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
      if (!hands?.sorcery) { group.visible = false; return; }
      root.updateWorldMatrix(true, false);
      hands.sorcery.getWorldPosition(_b); root.worldToLocal(_b);
      const collapse = state.active ? 0 : 1 - state.opacity;
      const pulse = 0.86 + 0.14 * Math.sin(now * 9);
      const overlap = Number(concurrent.attack) + Number(concurrent.guard) + Number(concurrent.cast) + Number(concurrent.dash);
      gold.opacity = state.opacity * pulse * style.opacity;
      cyan.opacity = state.opacity * (overlap > 1 ? 0.95 : 0.7) * style.opacity;
      const age = now - (state.committedAt ?? now);
      const commit = state.active && age < 0.55;
      // The active HUD and actual actions carry the ongoing state. No persistent ornament.
      group.visible = commit;
      if (!commit) return;
      for (let i = 0; i < signatures.length; i += 1) {
        const mark = signatures[i];
        mark.material.color.setHex(CHIVALRY_SIGNATURES[state.signatures[i]] ?? CHIVALRY_SIGNATURES.fireball);
        mark.material.opacity = state.opacity * (commit ? 1 : 0.55) * style.opacity;
        mark.position.copy(_b);
        mark.position.x += (i - 1) * style.spacing;
        mark.position.y += style.height;
        mark.position.z -= style.depth;
        mark.position.y += commit ? Math.sin(Math.min(1, age / 0.55) * Math.PI) * style.commitRise : 0;
        mark.rotation.y = now * (1.2 + i * 0.3);
        mark.scale.setScalar(commit ? 1.5 : 0.6 * (1 - collapse));
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true; root.remove(group);
      signatureGeometry.dispose();
      gold.dispose(); cyan.dispose(); for (const mark of signatures) mark.material.dispose();
    },
  };
}
