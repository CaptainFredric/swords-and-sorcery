import { SoFisticationRenderer } from './SoFisticationRenderer.mjs';
import { BiByeLlistaRenderer } from './BiByeLlistaRenderer.mjs';
import { FightFlightRenderer } from './FightFlightRenderer.mjs';
import { BiByeMotion } from './biByeMotion.mjs';
import { getMachineKind } from '../../shared/sim/fleetGeometry.mjs';

/**
 * MachineFleetRenderer manages Three.js rendering for multiple simultaneous
 * siege machines of any class (SoFistication, Bi-Bye-llista, Fight-and-Flight),
 * supporting arbitrary fleet sizes and mirror matches.
 */
export class MachineFleetRenderer {
  constructor(scene) {
    this.scene = scene;
    // Map of id -> { id, type, renderer, motion }
    this.fleet = new Map();
  }

  getRenderer(id) {
    const entry = this.fleet.get(id);
    if (entry?.renderer) return entry.renderer;
    if (typeof this.options?.getPrimaryRenderer === 'function') {
      return this.options.getPrimaryRenderer(id);
    }
    return null;
  }

  getComponentWorldPosition(machineId, componentId) {
    const entry = this.fleet.get(machineId);
    if (!entry?.renderer?.getComponentWorldPosition) return null;
    return entry.renderer.getComponentWorldPosition(componentId);
  }

  hit(event) {
    const targetId = event.targetMachineId || event.machineId || event.ballistaId || event.flightId;
    if (targetId && this.fleet.has(targetId)) {
      this.fleet.get(targetId).renderer.hit?.(event);
      return true;
    }
    return false;
  }

  update(serverNow, snapshot, dt = 1 / 60, options = {}) {
    this.options = options;
    if (!snapshot) return;
    const machines = Array.isArray(snapshot.machines) ? snapshot.machines : [];
    const activeIds = new Set();
    const primaryIds = new Set(options.primaryIds || []);

    for (const machine of machines) {
      if (!machine || !machine.id) continue;
      // Skip if explicitly designated as primary handled by legacy world/runtime renderers
      if (primaryIds.has(machine.id)) continue;

      activeIds.add(machine.id);
      let entry = this.fleet.get(machine.id);
      const kind = getMachineKind(machine) || (machine.kind ?? 'ram');

      if (!entry || entry.kind !== kind) {
        if (entry) {
          entry.renderer?.dispose?.();
        }
        let renderer = null;
        let motion = null;
        if (kind === 'flight') {
          renderer = new FightFlightRenderer(this.scene);
        } else if (kind === 'ballista') {
          renderer = new BiByeLlistaRenderer(this.scene);
          motion = new BiByeMotion();
        } else {
          renderer = new SoFisticationRenderer(this.scene);
          motion = new BiByeMotion();
        }
        entry = { id: machine.id, kind, type: kind, renderer, motion };
        this.fleet.set(machine.id, entry);
      }

      if (kind === 'flight') {
        const proj = (snapshot.fightFlightProjectiles || []).filter(p => p.flightId === machine.id || p.machineId === machine.id || !p.flightId);
        const burns = (snapshot.flightBurnZones || []).filter(b => b.flightId === machine.id || b.machineId === machine.id || !b.flightId);
        entry.renderer.update(
          serverNow,
          machine,
          proj,
          snapshot.serverTime ?? serverNow,
          burns,
          options.localAim ?? null,
          options.operators?.get?.(machine.operatorId) ?? null
        );
      } else if (kind === 'ballista') {
        const proj = (snapshot.bibyeProjectiles || []).filter(p => p.ballistaId === machine.id || p.machineId === machine.id || !p.ballistaId);
        entry.motion.push(machine, proj, snapshot.serverTime ?? serverNow, machine.revision ?? 0);
        const view = entry.motion.sample(serverNow, options.playingLocally ?? true, options.frozen ?? false);
        entry.renderer.update(view.clock, view.ballista, view.projectiles);
      } else {
        entry.motion.push(machine, [], snapshot.serverTime ?? serverNow, machine.revision ?? 0);
        const view = entry.motion.sample(serverNow, options.playingLocally ?? true, options.frozen ?? false, dt);
        entry.renderer.update(view.clock, view.ballista);
      }
    }

    for (const [id, entry] of this.fleet) {
      if (!activeIds.has(id)) {
        entry.renderer?.dispose?.();
        this.fleet.delete(id);
      }
    }
  }

  dispose() {
    for (const entry of this.fleet.values()) {
      entry.renderer?.dispose?.();
    }
    this.fleet.clear();
  }
}
