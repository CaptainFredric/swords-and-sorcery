// Centralized configuration and provisional tuning for DRAG-OON.
// Prototyped independently of Neon's production GLB so final dimensions,
// node origins, passenger count, and elemental eligibility rules can be
// calibrated without rewriting combat or thermal logic.

export const DRAG_OON_ID = 'drag-oon';
export const DRAG_OON_KIND = 'dragoon';

export const DRAG_OON_ELEMENTS = Object.freeze(['fire', 'frost', 'gale', 'lightning', 'steel']);

// Production V4.1 geometry manifest (metres, Castleward sim-local frame: -Z forward, +X Right, +Y Up).
// Derived directly from Gemini Neon's drag-oon-v4.1-master.glb (rotated Math.PI around Y):
//   AabbWidth = 4.650, AabbHeight = 2.994, AabbLength = 6.653
//   Sim local box: X in [-2.325, 2.325], Y in [0.0019, 2.9955], Z in [-3.5135, 3.1395] (centerZ = -0.187)
export const DRAG_OON_GEOMETRY = Object.freeze({
  width: 4.650,
  height: 2.994,
  length: 6.653,
  halfWidth: 4.650 / 2,
  halfHeight: 2.994 / 2,
  halfLength: 6.653 / 2,
  centerZOffset: -0.187,
  campFireSettleY: -0.195,
  wheelRadius: 0.382,
  // Eight independently driven wheel stations supporting zero-radius in-place pivoting.
  wheels: Object.freeze([
    Object.freeze({ id: 'Wheel_L1', side: 'L', pivot: Object.freeze([-1.92, 0.382, -1.42]) }),
    Object.freeze({ id: 'Wheel_R1', side: 'R', pivot: Object.freeze([1.92, 0.382, -1.42]) }),
    Object.freeze({ id: 'Wheel_L2', side: 'L', pivot: Object.freeze([-1.92, 0.382, -0.46]) }),
    Object.freeze({ id: 'Wheel_R2', side: 'R', pivot: Object.freeze([1.92, 0.382, -0.46]) }),
    Object.freeze({ id: 'Wheel_L3', side: 'L', pivot: Object.freeze([-1.92, 0.382, 0.54]) }),
    Object.freeze({ id: 'Wheel_R3', side: 'R', pivot: Object.freeze([1.92, 0.382, 0.54]) }),
    Object.freeze({ id: 'Wheel_L4', side: 'L', pivot: Object.freeze([-1.92, 0.382, 1.52]) }),
    Object.freeze({ id: 'Wheel_R4', side: 'R', pivot: Object.freeze([1.92, 0.382, 1.52]) }),
  ]),
  // Low-mounted articulated twin cannon assemblies (CannonMount_* -> CannonAssembly_* -> fx_nozzle_*).
  cannons: Object.freeze({
    left: Object.freeze({
      id: 'CannonMount_L',
      mount: Object.freeze([-1.34, 0.62, -2.34]),
      assemblyOffset: Object.freeze([-0.17, 0, -0.36]),
      nozzles: Object.freeze([
        Object.freeze({ id: 'fx_nozzle_L_outer', local: Object.freeze([-0.324, 0, -1.166]) }),
        Object.freeze({ id: 'fx_nozzle_L_inner', local: Object.freeze([-0.016, 0, -1.166]) }),
      ]),
    }),
    right: Object.freeze({
      id: 'CannonMount_R',
      mount: Object.freeze([1.34, 0.62, -2.34]),
      assemblyOffset: Object.freeze([0.17, 0, -0.36]),
      nozzles: Object.freeze([
        Object.freeze({ id: 'fx_nozzle_R_outer', local: Object.freeze([0.324, 0, -1.166]) }),
        Object.freeze({ id: 'fx_nozzle_R_inner', local: Object.freeze([0.016, 0, -1.166]) }),
      ]),
    }),
  }),
  undersideIgnitionOrigin: Object.freeze([0, 0.38, 0]),
  landingImpactOrigin: Object.freeze([0, 0, 0]),
  destructionCoreOrigin: Object.freeze([0, 1.35, 0.10]),
  infusionCoreOrigin: Object.freeze([0, 1.45, 0]),
  radiantHeatRingOrigin: Object.freeze([0, 0.85, 0]),
  fuelOutletOrigins: Object.freeze([
    Object.freeze([-0.92, 0.36, -0.82]),
    Object.freeze([-0.92, 0.36, 0.65]),
    Object.freeze([0.92, 0.36, -0.82]),
    Object.freeze([0.92, 0.36, 0.65]),
    Object.freeze([-0.75, 0.36, 1.92]),
    Object.freeze([0.75, 0.36, 1.92]),
  ]),
  steamExhaustOrigins: Object.freeze([
    Object.freeze([0, 2.02, -3.12]),
    Object.freeze([-1.95, 2.02, -1.90]),
    Object.freeze([-2.16, 2.02, 0]),
    Object.freeze([-1.95, 2.02, 1.90]),
    Object.freeze([0, 2.02, 2.98]),
    Object.freeze([1.95, 2.02, 1.90]),
    Object.freeze([2.16, 2.02, 0]),
    Object.freeze([1.95, 2.02, -1.90]),
  ]),
  campFireRingOrigins: Object.freeze([
    Object.freeze([0, 0.15, -3.85]),
    Object.freeze([-2.55, 0.15, -2.55]),
    Object.freeze([-3.10, 0.15, 0]),
    Object.freeze([-2.55, 0.15, 2.55]),
    Object.freeze([0, 0.15, 3.85]),
    Object.freeze([2.55, 0.15, 2.55]),
    Object.freeze([3.10, 0.15, 0]),
    Object.freeze([2.55, 0.15, -2.55]),
  ]),
  cameras: Object.freeze({
    fp: Object.freeze([0, 2.15, -1.30]),
    aimExternal: Object.freeze([0, 3.45, 4.40]),
    airborneDown: Object.freeze([0, 3.30, 3.50]),
  }),
  // Authoritative V4.1 crew stations, rear boarding bay, interior aisle, and rally exits.
  stations: Object.freeze({
    operatorSeat: Object.freeze([0, 1.06, -0.72]),
    boardingEntry: Object.freeze([0, 0, 3.85]),
    aisle: Object.freeze([
      Object.freeze([0, 0.68, 2.40]),
      Object.freeze([0, 0.68, 1.00]),
      Object.freeze([0, 0.68, -0.15]),
    ]),
    evacRally: Object.freeze([
      Object.freeze([0, 0, 4.15]),
      Object.freeze([-1.65, 0, 4.35]),
      Object.freeze([1.65, 0, 4.35]),
      Object.freeze([-2.45, 0, 4.75]),
      Object.freeze([2.45, 0, 4.75]),
    ]),
    // Four physical armored sorcery aperture stations (L1 front-port, R1 front-starboard, L2 rear-port, R2 rear-starboard).
    passengers: Object.freeze([
      Object.freeze({
        slot: 0,
        id: 'L1',
        shutterNode: 'Sorcery_Shutter_L1',
        cameraNode: 'cam_passenger_L1',
        seat: Object.freeze([-0.96, 1.06, 0.25]),
        aperture: Object.freeze([-2.08, 1.70, 0.20]),
        camera: Object.freeze([-1.10, 3.25, 0.55]),
        yawOffset: (75 * Math.PI) / 180,
        yawConeHalfRad: (28 * Math.PI) / 180,
        pitchMinRad: (-25 * Math.PI) / 180,
        pitchMaxRad: (30 * Math.PI) / 180,
      }),
      Object.freeze({
        slot: 1,
        id: 'R1',
        shutterNode: 'Sorcery_Shutter_R1',
        cameraNode: 'cam_passenger_R1',
        seat: Object.freeze([0.96, 1.06, 0.25]),
        aperture: Object.freeze([2.08, 1.70, 0.20]),
        camera: Object.freeze([1.10, 3.25, 0.55]),
        yawOffset: (-75 * Math.PI) / 180,
        yawConeHalfRad: (28 * Math.PI) / 180,
        pitchMinRad: (-25 * Math.PI) / 180,
        pitchMaxRad: (30 * Math.PI) / 180,
      }),
      Object.freeze({
        slot: 2,
        id: 'L2',
        shutterNode: 'Sorcery_Shutter_L2',
        cameraNode: 'cam_passenger_L2',
        seat: Object.freeze([-0.96, 1.06, 1.65]),
        aperture: Object.freeze([-2.08, 1.70, 1.70]),
        camera: Object.freeze([-1.10, 3.25, 1.30]),
        yawOffset: (115 * Math.PI) / 180,
        yawConeHalfRad: (28 * Math.PI) / 180,
        pitchMinRad: (-25 * Math.PI) / 180,
        pitchMaxRad: (30 * Math.PI) / 180,
      }),
      Object.freeze({
        slot: 3,
        id: 'R2',
        shutterNode: 'Sorcery_Shutter_R2',
        cameraNode: 'cam_passenger_R2',
        seat: Object.freeze([0.96, 1.06, 1.65]),
        aperture: Object.freeze([2.08, 1.70, 1.70]),
        camera: Object.freeze([1.10, 3.25, 1.30]),
        yawOffset: (-115 * Math.PI) / 180,
        yawConeHalfRad: (28 * Math.PI) / 180,
        pitchMinRad: (-25 * Math.PI) / 180,
        pitchMaxRad: (30 * Math.PI) / 180,
      }),
    ]),
    exits: Object.freeze([
      Object.freeze([0, 0, 4.15]),
      Object.freeze([-1.65, 0, 4.35]),
      Object.freeze([1.65, 0, 4.35]),
      Object.freeze([-2.45, 0, 4.75]),
      Object.freeze([2.45, 0, 4.75]),
      Object.freeze([-3.35, 0, 1.05]),
      Object.freeze([3.35, 0, 1.05]),
      Object.freeze([-3.35, 0, -0.95]),
      Object.freeze([3.35, 0, -0.95]),
      Object.freeze([0, 0, -4.35]),
    ]),
  }),
  heatZones: Object.freeze(['Mat_HeatZone_Cannons', 'Mat_HeatZone_UndersideIgnition', 'Mat_HeatZone_FurnaceInterior', 'Mat_HeatZone_SteamVents']),
});

// Centralized provisional combat, thermal, fuel, and crew tuning.
export const DRAG_OON_TUNING = Object.freeze({
  // Survivability & Mobility (slow armored fortress, turns in place)
  maxHealth: 2200,
  allocationWeight: 2, // Provisional allocation weight config (kept flexible while experimental)
  forwardSpeed: 3.1,
  reverseSpeed: 2.3,
  acceleration: 6.5,
  pivotTurnRate: 1.05, // rad/s in place or moving
  cruiseTurnRate: 0.92,
  maxSlopePitchRad: 0.42, // ~24 deg
  maxSlopeRollRad: 0.36,
  // Perpetual Sheathed in Steel armor values on armored hull
  innateSteelStrength: 0.55,
  // Armor prevents DoTs from damaging hull directly; direct hits still apply.
  hullDotImmuneSources: Object.freeze([
    'burn', 'valkyrie-flame', 'valkyrie-burn', 'fight-flight-burning-ground',
    'one_hit_ground_fire', 'one_hit_air_fire', 'one_hit_charge_fire',
    'dragoon-flame-dot', 'dragoon-raze-dot', 'dragoon-radiant-heat', 'dragoon-steam-fire-dot',
    'brimming-internal-heat',
  ]),

  // Cannon articulation (degrees / radians relative to chassis forward)
  cannonYawMax: Math.PI / 3, // ±60 deg
  cannonPitchMin: -0.45,
  cannonPitchMax: 0.38,
  cannonLandingSafePitch: 0,
  cannonLandingSafeYaw: 0,

  // Shared Thermal & Fuel Model
  fuelMax: 100,
  minEffectiveFuelCap: 25,
  fuelRegenPerSec: 6.5,
  fuelRegenDelaySec: 1.25,
  heatMax: 100,
  overpressureHeatMax: 220, // Heat above 100 represents escalating Brimming overpressure
  coolIdlePerSec: 4.5,
  overheatPenaltyMax: 55, // Flight Like Hell reduces usable cap up to 55 (100 -> 45)
  overheatPenaltyDecayPerSec: 3.2,
  frostHeatGainScale: Object.freeze([1, 0.72, 0.50]), // Tier 0/1/2 heat gain multiplier
  frostCoolingScale: Object.freeze([1, 1.38, 1.85]),  // Tier 0/1/2 cooling multiplier

  // Innate: Desolation Spray
  spray: Object.freeze({
    prepDelaySec: 0.16,
    lightningZeroDelayTier: 2,
    fuelPerSec: 11.5,
    heatPerSec: 8.5,
    baseRange: 10.5,
    baseSpeed: 18,
    lightningSpeedMult: Object.freeze([1, 1.55, 2.05]),
    baseSwathRadius: 0.95,
    fireRadiusMult: Object.freeze([1, 1.38, 1.52]),
    baseSegmentLifetimeSec: 0.42,
    galeLifetimeSec: Object.freeze([0.42, 1.95, 3.6]),
    // Coherent tick accounting: damage applies per exposed victim once per cadence window,
    // never multiplied 4x across the four visual nozzles.
    damagePerSecNear: 28,
    damagePerSecFar: 13,
    minFalloffRatio: 0.46,
    damageTickIntervalSec: 0.25,
    maxActiveSegments: 36, // Bounded server-side representation across all nozzles
    emitIntervalSec: 0.08,
    steelAttenuation: Object.freeze([0, 0.45, 0.68]),
    steelMoveDrag: Object.freeze([0, 0.25, 0.78]), // 0.78 near-solid barricade resistance
    steelSweepImpactDamage: 24,
    steelSweepImpactCooldownSec: 0.75,
    steelSweepMinSpeed: 1.4,
    galePushSpeed: 7.5,
    galeWindSpeed: 11.0,
    radiantHeatRadius: 4.8,
    radiantHeatDpsBase: 6,
    frostRecoveryDurationSec: 2.2,
    frostCooldownScale: 0.45,
    frostStaminaRegenScale: 0.35,
    rareAerosolProbability: 0.008, // Rare gag (<1%), timing/damage/fuel invariant
    radiantBurnIntervalSec: 0.5,
  }),

  // Innate: Fire's the Limit
  leap: Object.freeze({
    fuelCost: 26,
    heatGain: 18,
    cooldownSec: 12,
    prepSec: 0.22,
    launchUpSpeed: 12.8,
    launchForwardSpeed: 13.4,
    airControlAccel: 6.2,
    airControlMaxSpeed: 6.5,
    gravity: 22.0,
    launchBlastRadius: 5.0,
    launchBlastDamage: 28,
    launchKnockback: 11.5,
    slamRadiusBase: 5.6,
    slamRadiusSteel2: 8.2,
    slamDamageBase: 62,
    slamKnockback: 14.0,
    recoverySec: 0.35,
    flightSlamReductionFactor: 0.52, // Flight Like Hell cushions but does not make slam harmless
  }),

  // Innate: Steam the Team
  steam: Object.freeze({
    cooldownSec: 25,
    maxRadius: 12.5,
    baseSpeed: 16.0,
    lightningSpeedMult: Object.freeze([1, 1.45, 1.85]),
    baseThickness: 1.8,
    fireThicknessMult: Object.freeze([1, 1.45, 1.85]),
    baseHeight: 2.8,
    fireHeightMult: Object.freeze([1, 1.45, 1.85]),
    baseDurationSec: 0.85,
    galeDurationBonusSec: Object.freeze([0, 1.35, 2.8]),
    frostContactBonusSec: Object.freeze([0, 0.35, 0.65]),
    coldBaseDamage: 12,
    hotBonusDamage: 46, // Scaled by heat fraction + overpressure
    minDistanceFalloff: 0.35,
    baseKnockback: 15.0,
    ventHeatCapacity: 48, // Meaningfully vents heat but cannot instantly reset extreme overpressure
    partialOverheatRelief: 16,
    fireFrontloadShare: 0.72,
    fireDotPerSec: 16,
    steelProjectileSlow: Object.freeze([0, 0.45, 0.72]),
    steelMoveResist: Object.freeze([0, 0.35, 0.78]),
    galeOutwardWindSpeed: 10.5,
    visualLingerExtraSec: 0.8,
  }),

  // Innate: Burning Brotherhood (Crew & Evacuation)
  crew: Object.freeze({
    defaultPassengerCapacity: 4,
    maxPassengerCapacity: 4,
    boardDurationSec: 0.85,
    disembarkDurationSec: 1.05,
    campFireDisembarkDurationSec: 1.95, // Opening sealed hatches takes longer without trapping occupants forever
    boardReachRadius: 5.4, // Measured against V4.1 rear bay at Z=+3.85 and 4.65m flank width
    pilotContributes: false,
    allowMultiPreparedSpells: false, // Explicit rule: 1 primary equipped spell contribution per passenger by default
    repairAssistBonusFraction: 0.15,
    dangerHeatThreshold: 115, // Triggers crew warning indicators
  }),

  // Experimental Terminal Ability: Rite of Ascension (Flight Like Hell + Full Gale + Spells & Chivalry collective opt-in)
  riteOfAscension: Object.freeze({
    summary: 'Unite the prowess of your crew to ascend upon an inferno. Guide DRAG-OON toward its final destination and unleash a catastrophic explosion.',
    requiredSkillId: 'flightLikeHell',
    requiredGaleTier: 2,
    minParticipants: 3, // Operator + 2 Full Gale passengers (more passengers welcome, none forced)
    ascentUpSpeed: 16.5,
    initialForwardSpeed: 14.0,
    ascentCruiseMinSpeed: 18.0,
    ascentMaxSpeed: 25.0,
    rocketRampSec: 1.05,
    steerPitchMin: -0.78,
    steerPitchMax: 0.65,
    steerTurnRate: 1.85,
    maxFlightSec: 4.0,
    minDetonateDelaySec: 0.35, // Brief ignition lock before deliberate operator trigger can detonate
    exhaustConeLength: 16.5,
    exhaustConeHalfAngleDeg: 30,
    exhaustDps: 84,
    exhaustGuardDrainPerSec: 70,
    blastRadiusBase: 14.5,
    blastDamageBase: 165,
    crewDamageScale: 1.45,
    fireRadiusMult: 1.32,
    fireLingeringDps: 22,
    fireLingeringSec: 8.5,
    steelDamageMult: 1.30,
    frostInterferenceSec: 4.0,
    galePushSpeed: 20.0,
    lightningSpeedMult: 1.25,
  }),

  // Innate: All Abort!
  destruction: Object.freeze({
    baseRadius: 7.0,
    baseDamage: 45,
    heatRadiusScale: 0.025,
    heatDamageScale: 0.38,
    fuelDamageScale: 0.25,
    baseCrewDamage: 32,
    overpressureCrewDamageScale: 0.82, // Extreme Brimming heat approaches lethal crew trauma
    brimmingRadiusMult: 1.42,
    brimmingDamageMult: 1.55,
    brimmingCrewDamageMult: 1.45,
    ejectLaunchSpeed: 8.5,
    ejectLaunchUp: 5.5,
  }),

  // Skill 1: Raze the Pasture
  raze: Object.freeze({
    cooldownSec: 22,
    minRadius: 3.2,
    maxRadius: 11.0,
    growRateInitial: 4.4,
    growDecayPerSec: 0.55, // Diminishing radius growth rate
    maxHoldSec: 4.0,
    ignitionDelaySec: 0.35,
    fuelBaseCost: 14,
    fuelPerSecHeld: 7.5,
    initialDamageSmall: 16,
    initialDamageLarge: 76,
    burnDurationLarge: 4.5,
    burnDurationSmall: 14.5, // Inverse area/duration relationship preserved cleanly
    burnDps: 18,
    burnIntervalSec: 0.5,
    heatGainOnIgnite: 14,
    maxFieldsPerMachine: 4,
  }),

  // Skill 2: Flight Like Hell
  flightLikeHell: Object.freeze({
    cooldownSec: 28,
    fuelPerSec: 34.0,
    hoverGravityCounter: 20.5, // Near-hover with net gentle descent (~1.5 m/s^2)
    maxDescentSpeed: 3.4,
    galeAscentSpeed: 5.2, // Full Gale enables active climb while discharging
    coneLength: 14.0,
    coneHalfAngleDeg: 28,
    damagePerSec: 78, // Highest sustained DoT in Castleward during concentrated exposure
    guardDrainPerSec: 65,
    structureDps: 90,
    heatPerSec: 26,
    overheatCapPenaltyPerSec: 22,
    maxHealthReductionShare: 0.42, // Reversible server-authoritative max HP reduction fraction of damage dealt
    maxHealthFloor: 25, // Provisional prototype floor; cleared on respawn/round reset
    scorchRadius: 5.2,
    scorchDurationSec: 8.0,
    maxScorchZonesPerMachine: 12,
  }),

  // Skill 3: Camp Fire
  campFire: Object.freeze({
    cooldownSec: 24,
    settleSec: 0.45,
    reopenSec: 0.90,
    durationSec: 12.0,
    fuelPerSec: 2.5,
    perimeterRadius: 4.2,
    perimeterDps: 20,
    perimeterIntervalSec: 0.5,
  }),

  // Skill 4: Brimming with Potential
  brimming: Object.freeze({
    cooldownSec: 26,
    heatPerSec: 19.0,
    insulationHeatThreshold: 110, // Above this, crew begins suffering internal thermal damage
    crewDpsMin: 3.5,
    crewDpsMax: 16.0,
    outputBonusMax: 0.65, // Up to +65% flame damage output at peak overpressure
    fullFireCooldownDecayMult: 0.42, // Full Fire halves/slows dissipation, persisted on retained state
  }),
});

export const DRAG_OON_CONTROLS = Object.freeze({
  attack: 'Mouse0 / F (Hold Desolation Spray)',
  leap: 'Space (Fire’s the Limit)',
  steam: 'Right Click / G (Steam the Team)',
  skill: 'U (Equipped Skill)',
  board: 'T / Tap MOUNT (Operator hatch or Passenger aperture)',
  disembark: 'Hold T / Tap LEAVE (Timed evacuation)',
  passengerSpell: 'Q (Cast through aperture)',
});
