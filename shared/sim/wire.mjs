import { GALE_MODES } from '../src/galeModes.mjs';
import {mountFightFlight,dismountFightFlight} from './fightFlight.mjs';
import {requestFightFlightFire} from './fightFlightWeapons.mjs';
import {requestFightFlightSkill} from './fightFlightSkill.mjs';
import {requestFlightDash} from './fightFlightRun.mjs';
import {setFlightUltimateHold} from './fightFlightTerminal.mjs';
import {mountSoFistication,dismountSoFistication,fireSoFistication,primeSoFistSkill} from './soFistication.mjs';
import { practiceBiByeCommand,practiceSiegeCommand } from './practiceSiege.mjs';
import { setBiByeWeaponFocus,requestBiByeHeavySkill,requestBiByeCombinedSkill } from './biByeWeapons.mjs';
import { biByeDeployProgress } from './biByeComponents.mjs';
// What a host (the game server, or the browser playing alone when the server cannot be reached) says to its
// Spellblades and does with what they send. The same shapes either way, so the client cannot tell who is hosting
// except by asking.

import { tryCastSpell, castPreparedSpell, selectPreparedSpell, beginAttack, endAttack, pressButton, setGuard, tryCastOrGauntlet, tryDash, tryGauntletStrike, tryUltimate } from './combat.mjs';
import { compensatedInputTime } from './history.mjs';
import { readyPracticeUltimate, removePracticeDummy, resetPracticePlayer, setPracticeDummyMode, spawnPracticeDummy } from './practice.mjs';
import { mountBiByeLlista, dismountBiByeLlista, fireBiByeLlista, toggleBiByeDeploy, biByeTargetAim, BI_BYE_LLISTA_CONFIG } from './biByeLlista.mjs';
import { answerPerryDialogue, dismissPerryDialogue, getPlayerPerryDialogue, isCanonizationUnlocked } from './StPerry.mjs';
import { spellFor } from '../src/spells.mjs';
import { GAME_MODES } from '../src/modes.mjs';

export function serializeLobby(room) {
  return {
    type: 'lobby',
    roomCode: room.code,
    hostId: room.hostId(),
    roomState: room.state,
    mode: room.mode,
    worldId: room.worldId,
    isPrivate: room.isPrivate,
    countdownEndsAt: room.countdownEndsAt,
    autoStartAt: room.autoStartAt,
    scoreToWin: room.scoreToWin,
    matchSeconds: room.policy.matchSeconds,
    teamSize: room.policy.teamSize ?? null,
    votes: room.policy.votes ? room.tallyVotes() : null,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team ?? null,
      actorKind: p.actorKind,
      practiceMode: p.practiceMode ?? null,
      connected: p.connected,
      arenaReady: Boolean(p.arenaReady),
      lobbyReady: Boolean(p.lobbyReady),
      kills: p.kills,
      deaths: p.deaths,
    })),
  };
}

export function serializeSnapshot(room, nowSec, recipientId = null) {
  return {
    type: 'snapshot',
    tick: room.tickNumber,
    tutorial: Boolean(room.localTutorial),
    ...(room.localTutorial ? { tutorialBridgeFailures: room.tutorialBridgeFailures ?? 0 } : {}),
    serverTime: nowSec,
    roomCode: room.code,
    hostId: room.hostId(),
    roomState: room.state,
    mode: room.mode,
    worldId: room.worldId,
    countdownEndsAt: room.countdownEndsAt,
    matchStartedAt: room.matchStartedAt,
    scoreToWin: room.scoreToWin,
    matchSeconds: room.policy.matchSeconds,
    teamSize: room.policy.teamSize ?? null,
    finishReason: room.finishReason ?? null,
    winnerId: room.winnerId,
    winnerTeam: room.winnerTeam ?? null,
    rewardMatchId: room.rewardMatchId ?? null,
    suddenDeath: room.suddenDeath,
    overtime: Boolean(room.overtime),
    objective: room.objectiveState ? {
      index: room.objectiveState.index,
      phase: room.objectiveState.phase,
      total: room.objectiveState.objectives.length,
      id: room.objectiveState.objectives[room.objectiveState.index]?.id ?? null,
      name: room.objectiveState.objectives[room.objectiveState.index]?.name ?? null,
      position: room.objectiveState.objectives[room.objectiveState.index]?.position ?? null,
      radius: room.objectiveState.objectives[room.objectiveState.index]?.radius ?? 0,
      progress: room.objectiveState.progress,
      completed: Boolean(room.objectiveState.completed),
      contested: room.objectiveState.contested,
      capturing: room.objectiveState.capturing,
      decaying: room.objectiveState.decaying,
      overtime: Boolean(room.objectiveState.overtime),
      attackersCount: room.objectiveState.attackersCount,
      defendersCount: room.objectiveState.defendersCount,
      lastCapturedId: room.objectiveState.lastCapturedId ?? null,
      lastCapturedName: room.objectiveState.lastCapturedName ?? null,
      lastCapturedAt: Number.isFinite(room.objectiveState.lastCapturedAt) ? room.objectiveState.lastCapturedAt : null,
      objectives: room.objectiveState.objectives.map((o, idx) => ({
        id: o.id,
        name: o.name,
        position: o.position,
        radius: o.radius,
        captured: room.objectiveState.completed || idx < room.objectiveState.index,
        active: !room.objectiveState.completed && idx === room.objectiveState.index,
      })),
    } : null,
    marks: (room.teamMarks ?? []).filter((m) => m.expiresAt > nowSec).map((m) => ({
      id: m.id,
      team: m.team,
      byId: m.byId,
      byName: m.byName,
      kind: m.kind,
      targetId: m.targetId,
      label: m.label,
      position: m.position,
      expiresAt: m.expiresAt,
    })),
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team ?? null,
      actorKind: p.actorKind,
      practiceMode: p.practiceMode ?? null,
      connected: p.connected,
      arenaReady: Boolean(p.arenaReady),
      position: p.position,
      velocity: p.velocity,
      impulse: p.impulse ?? { x: 0, z: 0 },
      yaw: p.yaw,
      pitch: p.pitch,
      health: p.health,
      guardStamina: p.guardStamina,
      guarding: p.guarding,
      sprinting: Boolean(p.sprinting),
      // feet on ground an enemy's Sunder has torn: no sprint while they are (for my own prediction, and the HUD)
      tornGround: Boolean(p.tornGround),
      crouched: Boolean(p.crouched),
      flight: Boolean(p.flight),
      ...(room.inspectionEnabled && p.inspectionFrozen ? { inspectionFrozen: true } : {}),
      ...(room.localTutorial && p.id === room.tutorialRival?.id ? {
        tutorialSwordDrawn:Boolean(p.tutorialSwordDrawn), tutorialDrawAt:p.tutorialDrawAt ?? null,
        ...(Number.isFinite(p.deathAt) ? {deathAt:p.deathAt} : {}),
      } : {}),
      ...(p.presentationRecovery ? { presentationRecovery: {...p.presentationRecovery} } : {}),
      attackActive: p.attackActive,
      attackStartedAt: p.attackStartedAt,
      attackNextStrike: p.attackNextStrike,
      // how many of the chain's strikes are committed (each swing seen beginning: the breath behind it leads it)
      attackCommitted: p.attackCommitted ?? 0,
      ...(p.stPerry ? {
        stPerry: {
          parries: p.stPerry.parries,
          playerCounterParries: p.stPerry.playerCounterParries,
          playerHits: p.stPerry.playerHits,
          canonized: Boolean(p.stPerry.canonized),
          unlocked: isCanonizationUnlocked(room, recipientId),
          unlockedPlayers: [...(room.stPerryState?.byPlayer?.entries() ?? [])]
            .filter(([, prog]) => prog.unlocked)
            .map(([id]) => id),
          dialogue: (() => {
            const d = getPlayerPerryDialogue(room, recipientId) || p.stPerry.dialogue;
            return d ? {
              state: d.state,
              wrongCount: d.wrongCount,
              solved: Boolean(d.solved),
              dismissed: Boolean(d.dismissed),
              lastLine: d.lastLine,
              choices: d.choices ? [...d.choices] : [],
            } : null;
          })(),
        },
      } : {}),
      // a chain begun Sundering: every strike of it a slam (the heavy strike's shape)
      attackSlam: Boolean(p.attackSlam),
      alive: p.alive,
      kills: p.kills,
      deaths: p.deaths,
      parries: p.parries,
      abyssKills: p.abyssKills,
      spell: p.spell,
      startingSpell: p.startingSpell ?? p.spell,
      preparedSpells: [...(p.preparedSpells ?? [])],
      preparedSpellSelected: Boolean(p.preparedSpellSelected),
      spellReadyById: { ...(p.spellReadyById ?? {}) },
      chivalryProjectileReadyAt: p.chivalryProjectileReadyAt ?? 0,
      cloth: p.cloth ?? 'crimson',
      // (the emblem on their back banner: shared/src/heraldry.mjs)
      emblem: p.emblem ?? 'trident',
      spellReadyAt: p.spellReadyAt,
      castingSpell: p.pendingSpell?.spell ?? null,
      castingGaleMode: p.pendingSpell?.galeMode ?? 'balanced',
      gale: p.gust ? { mode: p.gust.mode ?? 'balanced', bornAt: p.gust.bornAt, until: p.gust.until } : null,
      castEndsAt: p.castEndsAt ?? 0,
      castStartedAt: p.pendingSpell ? p.castEndsAt - spellFor(p.pendingSpell.spell).gatherSec : 0,
      // afflictions, for your own prediction (the chill slows you) and everyone's effects
      chill: p.chill ? { slow: p.chill.slow, startedAt: p.chill.startedAt, until: p.chill.until } : null,
      burningUntil: p.burn?.until ?? 0,
      // Sheathed in Steel: when it was called and until when it holds full (it wears off evenly from there)
      steel: p.steel ? { calledAt: p.steel.calledAt, fullUntil: p.steel.fullUntil, struck: Boolean(p.steel.struck) } : null,
      dashReadyAt: p.dashReadyAt,
      dashUntil: p.dashUntil,
      // the Practice Yard's recast gates (practiceRecast.mjs): the real cooldowns above are shown as they are
      practiceGate: p.practiceGate ?? null,
      staggerUntil: p.staggerUntil,
      // balance lost (for the view's unsteadiness and the warning near its break), prowess earned, the ultimate
      stagger: p.stagger ? { level: p.stagger.level, recoverUntil: p.stagger.recoverUntil } : null,
      prowess: p.prowess ?? 0,
      ultimate: p.ultimate ?? null,
      ultimateState: p.ultimateState ? {
        id: p.ultimateState.id, phase: p.ultimateState.phase, commitAt: p.ultimateState.commitAt, until: p.ultimateState.until,
        // (a Vortex: where its blade is, how fast it turns, and what the knight has steered it to)
        ...(p.ultimateState.angle !== undefined ? {
          angle: p.ultimateState.angle, angleAt: p.ultimateState.angleAt, rate: p.ultimateState.rate, emphasis: p.ultimateState.emphasis ?? 0,
        } : {}),
      } : null,
      // dizzy from a Vortex just ended (only seen)
      dizzyUntil: p.dizzyUntil ?? -Infinity,
      recoverUntil: p.recoverUntil ?? -Infinity,
      ultimateLockedUntil: p.ultimateLockedUntil ?? -Infinity,
      spawnProtectionUntil: p.spawnProtectionUntil,
      respawnAt: p.respawnAt,
      lastInputSeq: p.lastInputSeq,
      operatingBallistaId: p.operatingBallistaId ?? null,
      operatingRamId: p.operatingRamId ?? null,
      operatingFightFlightId: p.operatingFightFlightId ?? null,
    })),
    projectiles: [...room.projectiles.values()].map((p) => ({ id: p.id, ownerId: p.ownerId, spell: p.spell, position: p.position, velocity: p.velocity, ...(p.corePhase ? { corePhase: p.corePhase, armedAt: p.armedAt ?? null, detonateAt: p.detonateAt ?? null } : {}) })),
    structures: room.structures,
    fightFlightProjectiles:[...(room.fightFlightProjectiles?.values()??[])].map(p=>({id:p.id,machineId:p.machineId,ownerId:p.ownerId,position:p.position,velocity:p.velocity,bornAt:p.bornAt})),
    fightFlightRevision:room.fightFlightRevision??0,
    flightBurnZones:room.flightBurnZones??[],
    fightFlight:room.fightFlight?{...room.fightFlight,position:{x:room.fightFlight.x,y:room.fightFlight.y,z:room.fightFlight.z}}:null,
    soFistRevision:room.soFistRevision??0,
    soFistication:room.soFistication?{...room.soFistication,skill:{...room.soFistication.skill,failureThreshold:undefined},position:{x:room.soFistication.x,y:room.soFistication.y,z:room.soFistication.z},contacts:undefined,bodyEpisodes:undefined,recentVictims:undefined,strokeVictims:undefined,strokeMachines:undefined}:null,
    bibyeRevision: room.biByeRevision??0,
    bibyeBallista: room.biByeLlista ? {
      skill:{...room.biByeLlista.skill},heavySkill:room.biByeLlista.heavySkill,mainSkillUntil:room.biByeLlista.mainSkillUntil,
      impactReaction:room.biByeLlista.impactReaction,externalVelocity:room.biByeLlista.externalVelocity,
      builtAt:room.biByeLlista.builtAt,
      id: room.biByeLlista.id,
      position: { x: room.biByeLlista.x, y: room.biByeLlista.y, z: room.biByeLlista.z },
      x: room.biByeLlista.x,
      y: room.biByeLlista.y,
      z: room.biByeLlista.z,
      heading: room.biByeLlista.heading,
      chassisPitch:room.biByeLlista.chassisPitch,chassisRoll:room.biByeLlista.chassisRoll,
      wheelOffsets:[...room.biByeLlista.wheelOffsets],stabilizerTilts:[...room.biByeLlista.stabilizerTilts],
      deploymentReason:room.biByeLlista.deploymentReason,deploymentRejectedAt:room.biByeLlista.deploymentRejectedAt,
      mainYaw: room.biByeLlista.mainYaw, mainPitch: room.biByeLlista.mainPitch,
      upperYaw: room.biByeLlista.upperYaw, upperPitch: room.biByeLlista.upperPitch,
      weaponFocus: room.biByeLlista.weaponFocus, focusRevision: room.biByeLlista.focusRevision,
      coupling: room.biByeLlista.coupling, couplingProgress: room.biByeLlista.couplingProgress,
      couplingReleaseFrom: room.biByeLlista.couplingReleaseFrom,
      couplingStartedAt: room.biByeLlista.couplingStartedAt, couplingEndsAt: room.biByeLlista.couplingEndsAt,
      upperReleasedAt: room.biByeLlista.upperReleasedAt, upperFiredAt: room.biByeLlista.upperFiredAt,
      upperShotKind: room.biByeLlista.upperShotKind, mainReleasedAt: room.biByeLlista.mainReleasedAt, heavyDelayTrippedAt: room.biByeLlista.heavyDelayTrippedAt,
      trackingSince:room.biByeLlista.trackingSince,aimLimited:Boolean(room.biByeLlista.aimLimited),
      upperPending: room.biByeLlista.mobileShotPendingAt != null,
      upperQueued:Boolean(room.biByeLlista.pendingIndependent),
      combinedUpperPendingAt:room.biByeLlista.combinedUpperPendingAt,

      yaw: room.biByeLlista.yaw,
      pitch: room.biByeLlista.pitch,
      speed: room.biByeLlista.speed ?? 0,
      steer: room.biByeLlista.steer ?? 0,
      mode: room.biByeLlista.mode,
      deployProgress: biByeDeployProgress(room.biByeLlista, nowSec),
      components: structuredClone(room.biByeLlista.components),
      wheelRolls: [...room.biByeLlista.wheelRolls],
      poseTime: nowSec,
      retractFrom: room.biByeLlista.retractFrom,
      retractAim: room.biByeLlista.retractAim ? {...room.biByeLlista.retractAim} : null,
      modeTransitionEndsAt: Number.isFinite(room.biByeLlista.modeTransitionEndsAt) ? room.biByeLlista.modeTransitionEndsAt : null,
      health: room.biByeLlista.health,
      lastHitAt: room.biByeLlista.lastHitAt,
      maxHealth: room.biByeLlista.maxHealth,
      state: room.biByeLlista.state,
      operatorId: room.biByeLlista.operatorId,
      firedAt: Number.isFinite(room.biByeLlista.firedAt) ? room.biByeLlista.firedAt : null,
      mobileFiredAt: room.biByeLlista.mobileFiredAt,
      smallBoltReadyAt: room.biByeLlista.smallBoltReadyAt,
      reloadStartedAt: Number.isFinite(room.biByeLlista.reloadStartedAt) ? room.biByeLlista.reloadStartedAt : null,
      reloadEndsAt: Number.isFinite(room.biByeLlista.reloadEndsAt) ? room.biByeLlista.reloadEndsAt : null,
      destroyedAt: room.biByeLlista.destroyedAt,
      modeTransitionStartedAt: Number.isFinite(room.biByeLlista.modeTransitionStartedAt) ? room.biByeLlista.modeTransitionStartedAt : null,
      smallBoltReady: nowSec + 1e-8 >= (room.biByeLlista.smallBoltReadyAt ?? 0) && room.biByeLlista.mobileShotPendingAt == null && !(room.biByeLlista.coupling === 'FIRING' && room.biByeLlista.upperReleasedAt == null),
      mainBoltLoaded: Boolean(room.biByeLlista.mainBoltLoaded),
      reloadProgress: room.biByeLlista.state === 'RELOADING'
        ? Math.min(1.0, Math.max(0, (nowSec - room.biByeLlista.reloadStartedAt) / BI_BYE_LLISTA_CONFIG.timing.reloadDurationSec))
        : (room.biByeLlista.state === 'LOADED' ? 1.0 : 0.0),
    } : null,
    bibyeProjectiles: [...(room.bibyeProjectiles?.values() ?? [])].map((p) => ({
      id: p.id,
      subKind: p.subKind,
      bornAt: p.bornAt, ballistaId: p.ballistaId,
      position: p.position,
      velocity: p.velocity,
    })),
  };
}

/**
 * A Spellblade's command inside their room (moving, fighting, readying, the practice yard's controls). Returns what
 * the host should do next: { lobby: true } when everyone's lobby view changed, { rejected: message } when the
 * command is not allowed here, or {} for nothing more.
 */
export function applyRoomCommand(room, player, message, time) {
  // Mounted input belongs to the siege session; personal combat resumes on exit.
  const groundSiege=Boolean(player?.operatingBallistaId||player?.operatingRamId);
  const flightSiege=Boolean(player?.operatingFightFlightId);
  if(groundSiege&&['cast','castPreparedSpell','castPreparedSlot','castCurrentSpell','guard','dash','gauntlet','ultimate'].includes(message.type))return {};
  if(flightSiege&&['cast','castPreparedSpell','castPreparedSlot','castCurrentSpell','dash','gauntlet'].includes(message.type))return {};
  // Gate B3: only the named Chivalry Ultimate may start aboard the flying
  // apparatus; other Ultimates retain their standard unmounted restrictions.
  if(flightSiege&&message.type==='ultimate'&&player.ultimate!=='chivalry')return {};
  switch (message.type) {
    case 'startMatch':
    case 'ready': {
      const ready = message.type === 'startMatch' ? true : Boolean(message.ready);
      return { lobby: room.setReady(player.id, ready, time) };
    }
    case 'configureRoom': {
      const rejected=room.configureRoom(player.id,message.settings,time);
      return rejected ? {rejected} : {lobby:true};
    }
    case 'swapPlayers': {
      const rejected=room.swapPlayers(player.id,message.firstId,message.secondId,time);
      return rejected ? {rejected} : {lobby:true};
    }
    case 'vote': return room.vote(player.id,message.key,message.value) ? {lobby:true} : {rejected:'Choose a valid setting before the countdown.'};
    case 'arenaReady': return { lobby: room.setArenaReady(player.id, Boolean(message.ready), time) };
    case 'input': {
      player.lastInputSeq = Number.isFinite(message.seq) ? message.seq : player.lastInputSeq;
      player.input = {
        siegeTarget:player.operatingBallistaId&&message.siegeTarget&&['x','y','z'].every(k=>Number.isFinite(message.siegeTarget[k]))?Object.fromEntries(['x','y','z'].map(k=>[k,message.siegeTarget[k]])):null,
        forward: Math.max(-1, Math.min(1, Number(message.forward) || 0)),
        right: Math.max(-1, Math.min(1, Number(message.right) || 0)),
        jump: Boolean(message.jump),
        sprint: Boolean(message.sprint),
        crouch: Boolean(message.crouch),
        flight: message.flight !== undefined ? Boolean(message.flight) : Boolean(player.flight),
        // (what is held, beside the presses themselves: a Vortex is steered by it)
        attack: Boolean(message.attack),
        guard: Boolean(message.guard),
        yaw: Number.isFinite(message.yaw) ? message.yaw : player.yaw,
        pitch: Number.isFinite(message.pitch) ? Math.max(-1.45, Math.min(1.45, message.pitch)) : player.pitch,
      };
      return {};
    }
    case 'attack': {
      if(player.operatingRamId&&room.soFistication?.operatorId===player.id){if(message.down&&player.alive)fireSoFistication(room,room.soFistication,time);return {};}
      if (player.operatingBallistaId && room.biByeLlista?.operatorId === player.id) {
        if (message.down) {
          fireBiByeLlista(room, room.biByeLlista, time);
        }
        return {};
      }
      const inputTime = compensatedInputTime(message.clientTime, time);
      pressButton(room, player.id, 'attack', message.down, inputTime);
      if (message.down) beginAttack(room, player.id, inputTime);
      else endAttack(room, player.id, time, inputTime);
      return {};
    }
    case 'guard': {
      if(player.operatingFightFlightId&&room.fightFlight?.operatorId===player.id&&message.down&&!room.fightFlight.grounded)return {};
      const inputTime = compensatedInputTime(message.clientTime, time);
      pressButton(room, player.id, 'guard', message.down, inputTime);
      setGuard(room, player.id, Boolean(message.down), inputTime);
      return {};
    }
    // the spell's key: the spell when it is ready; on its cooldown, the gauntlet if a foe is in reach
    case 'galeMode': {
      if (!player.alive || player.pendingSpell?.spell !== 'gale' || time >= player.castEndsAt || !GALE_MODES.includes(message.mode)) return { rejected: 'Gale can be shaped only while gathering.' };
      player.pendingSpell.galeMode = message.mode;
      return {};
    }
    case 'cast': tryCastOrGauntlet(room, player.id, message.direction || { x: 0, y: 0, z: -1 }, time, compensatedInputTime(message.clientTime, time)); return {};
    case 'selectPreparedSpell': selectPreparedSpell(room, player.id, message.spell ?? message.id, time); return {};
    case 'selectPreparedSlot': {
      if (Number.isInteger(message.slot) && message.slot >= 1 && message.slot <= 3) {
        selectPreparedSpell(room, player.id, player.preparedSpells?.[message.slot - 1], time);
      }
      return {};
    }
    case 'castPreparedSlot':
    case 'castCurrentSpell':
    case 'castPreparedSpell': {
      if (message.type === 'castPreparedSlot' && (!Number.isInteger(message.slot) || message.slot < 1 || message.slot > 3)) return {};
      // Aim is current input intent. Only finite angles enter the authoritative state.
      const yaw = Number.isFinite(message.yaw) ? message.yaw : player.input?.yaw ?? player.yaw;
      const pitch = Number.isFinite(message.pitch) ? Math.max(-1.45, Math.min(1.45, message.pitch)) : player.input?.pitch ?? player.pitch;
      player.input = { ...player.input, yaw, pitch };
      player.yaw = yaw; player.pitch = pitch;
      if (message.type === 'castCurrentSpell') tryCastSpell(room, player.id, message.direction || { x: 0, y: 0, z: -1 }, time);
      else castPreparedSpell(room, player.id, message.type === 'castPreparedSlot' ? player.preparedSpells?.[message.slot - 1] : message.spell ?? message.id, message.direction || { x: 0, y: 0, z: -1 }, time);
      return {};
    }
    // the gauntlet on its own key: the fist, whether or not the spell is ready
    case 'gauntlet': tryGauntletStrike(room, player.id, time, compensatedInputTime(message.clientTime, time)); return {};
    case 'dash':
      if(player.operatingFightFlightId)return {rejected:'Hold Dash to initiate Flight to the Valkyrie.'};
      tryDash(room, player.id, message.direction || { x: 0, z: -1 }, time); return {};
    case 'flightDash': {
      const ok=requestFlightDash(room,room.fightFlight,player,Boolean(message.down),time);
      return ok?{}:{rejected:'Operate Fight-and-Flight to use Flight to the Valkyrie.'};
    }
    // the ultimate's key (a full prowess meter): the brace begins
    case 'ultimate':
      // Preserve legacy/ordinary Chivalry activation for a mounted tap. The
      // separate held chord owns the terminal path; never convert a Dash hold
      // into a normal Ultimate activation or spend its reserved meter.
      if(player.operatingFightFlightId&&(room.fightFlight?.flightDashHeld||room.fightFlight?.terminalPrep||room.fightFlight?.terminalDive))
        return {rejected:'Release Dash before activating ordinary Chivalry.'};
      tryUltimate(room, player.id, time); return {};
    case 'flightUltimateHold': {
      const result=setFlightUltimateHold(room,room.fightFlight,player,Boolean(message.down),time);
      if(result.rejected)return {rejected:result.rejected};
      if(result.tapUltimate&&!message.cancel)tryUltimate(room,player.id,time);
      return {};
    }
    case 'rematch': room.requestRematch(player.id, time); return {};
    case 'switchTeam': return { lobby: room.switchTeam(player.id, message.team ?? null, time) };
    case 'markTarget': room.markTarget(player.id, { targetId: message.targetId ?? null }, time); return {};
    case 'practiceSiege':return practiceSiegeCommand(room,player,message.action,message.machine,time);
    case 'practiceBuildBiBye':return practiceBiByeCommand(room,player,'build',time);
    case 'practiceRebuildBiBye':return practiceBiByeCommand(room,player,'rebuild',time);
    case 'practiceDismantleBiBye':return practiceBiByeCommand(room,player,'dismantle',time);
    case 'practiceResetPlayer':
      return room.mode === GAME_MODES.PRACTICE && resetPracticePlayer(room, player.id, time) ? {} : { rejected: PRACTICE_REJECTED };
    case 'practiceSpawnDummy':
      if (room.mode !== GAME_MODES.PRACTICE) return { rejected: PRACTICE_REJECTED };
      return spawnPracticeDummy(room, message.mode, time, player.id) ? { lobby: true } : { rejected: PRACTICE_REJECTED };
    case 'practiceRemoveDummy':
      return room.mode === GAME_MODES.PRACTICE && removePracticeDummy(room) ? { lobby: true } : { rejected: PRACTICE_REJECTED };
    case 'practiceReadyUltimate':
      return room.mode === GAME_MODES.PRACTICE && readyPracticeUltimate(room, player.id) ? {} : { rejected: PRACTICE_REJECTED };
    case 'practiceSetDummyMode':
      return room.mode === GAME_MODES.PRACTICE && setPracticeDummyMode(room, message.mode, time, player.id) ? { lobby: true } : { rejected: PRACTICE_REJECTED };
    case 'practicePerryAnswer':
      return room.mode === GAME_MODES.PRACTICE && answerPerryDialogue(room, player, message.answer, time) ? {} : { rejected: PRACTICE_REJECTED };
    case 'practicePerryDismiss':
      return room.mode === GAME_MODES.PRACTICE && dismissPerryDialogue(room, player, time) ? {} : { rejected: PRACTICE_REJECTED };
    case 'siegeSkill': {
      const ram=room.soFistication,b=room.biByeLlista,f=room.fightFlight;
      const reason=player.operatingFightFlightId&&f?.operatorId===player.id?requestFightFlightSkill(room,f,player,time):player.operatingRamId&&ram?.operatorId===player.id?primeSoFistSkill(room,ram,player,time):player.operatingBallistaId&&b?.operatorId===player.id?requestBiByeHeavySkill(room,b,player,time,biByeTargetAim):'Operate a siege machine to use its Skill.';
      return reason?{rejected:reason}:{};
    }
    case 'fightFlightFire': {
      const m=room.fightFlight;
      if(!requestFightFlightFire(room,m,player,Boolean(message.down),time))return {rejected:'Operate Fight-and-Flight to fire the repeater.'};
      return {};
    }
    case 'bibyeCombinedFire': {
      const b=room.biByeLlista;
      if(!player.alive||!player.operatingBallistaId||b?.operatorId!==player.id)return {rejected:'Operate the ballista first.'};
      const reason=requestBiByeCombinedSkill(room,b,player,time,biByeTargetAim);
      return reason?{rejected:reason}:{};
    }
    case 'siegeOperate': {
      if(player.operatingFightFlightId){return dismountFightFlight(room,room.fightFlight,player,{at:time})?{}:{rejected:'Land on open ground before leaving Fight-and-Flight.'};}
      if(player.operatingRamId){return dismountSoFistication(room,room.soFistication,player,{at:time})?{}:{rejected:'No safe exit. Move onto supported open ground.'};}
      if(player.operatingBallistaId)return applyRoomCommand(room,player,{type:'bibyeOperate'},time);
      const ram=room.soFistication,b=room.biByeLlista,f=room.fightFlight;
      if(f&&mountFightFlight(room,f,player,time))return {};
      if(ram&&mountSoFistication(room,ram,player,time))return {};
      if(b&&mountBiByeLlista(b,player,time))return {};
      return {rejected:'Approach an available operator station.'};
    }
    case 'bibyeOperate': {
      if(player.operatingFightFlightId)return {rejected:'Land and dismount Fight-and-Flight first.'};
      if(player.operatingRamId)return {rejected:'Leave the ram before operating another machine.'};
      if (!room.biByeLlista) return { rejected: 'No ballista available' };
      if (room.biByeLlista.operatorId === player.id) {
        dismountBiByeLlista(room.biByeLlista, player, true, room.world);
      } else {
        mountBiByeLlista(room.biByeLlista, player, time);
      }
      return {};
    }
    case 'bibyeToggleDeploy': {
      if (!room.biByeLlista) return { rejected: 'No ballista available' };
      if (room.biByeLlista.operatorId !== player.id) return { rejected: 'Must operate ballista to toggle deployment' };
      toggleBiByeDeploy(room.biByeLlista, time, room.world);
      return {};
    }
    case 'bibyeWeaponFocus': {
      const b = room.biByeLlista;
      if (!player.alive || !b || b.operatorId !== player.id) return { rejected: 'Must operate ballista to change weapon' };
      const focus = message.focus ?? (b.weaponFocus === 'MAIN' ? 'UPPER' : 'MAIN');
      if (!setBiByeWeaponFocus(b, focus, time)) return { rejected: 'Deploy before switching weapon focus' };
      player.input = {...player.input,yaw:b.yaw,pitch:b.pitch};
      return {};
    }
    case 'bibyeFire': {
      if (!room.biByeLlista) return { rejected: 'No ballista available' };
      if (room.biByeLlista.operatorId !== player.id) return { rejected: 'Must operate ballista to fire' };
      fireBiByeLlista(room, room.biByeLlista, time);
      return {};
    }
    default: return {};
  }
}

const PRACTICE_REJECTED = 'Practice command unavailable';
