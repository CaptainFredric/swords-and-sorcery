// Centralized configuration and provisional tuning for DRAG-OON.
// Prototyped independently of Neon's production GLB so final dimensions,
// node origins, passenger count, and elemental eligibility rules can be
// calibrated without rewriting combat or thermal logic.

export const DRAG_OON_ID = 'drag-oon';
export const DRAG_OON_KIND = 'dragoon';

export const DRAG_OON_ELEMENTS = Object.freeze(['fire', 'frost', 'gale', 'lightning', 'steel']);

// Provisional V3.1 hull envelope (metres); production redesign may adjust dimensions
// without breaking simulation contracts because all clearance & origins read this config.
export const DRAG_OON_GEOMETRY = Object.freeze({
  width: 4.143,
  height: 2.798,
  length: 5.746,
  halfWidth: 4.143 / 2,
  halfHeight: 2.798 / 2,
  halfLength: 5.746 / 2,
  wheelRadius: 0.56,
  // Eight independently driven wheel stations supporting zero-radius in-place pivoting.
  wheels: Object.freeze([
    Object.freeze({ id: 'Wheel_FL1', side: 'L', pivot: Object.freeze([-1.85, 0.56, -2.05]) }),
    Object.freeze({ id: 'Wheel_FR1', side: 'R', pivot: Object.freeze([1.85, 0.56, -2.05]) }),
    Object.freeze({ id: 'Wheel_FL2', side: 'L', pivot: Object.freeze([-1.88, 0.56, -0.72]) }),
    Object.freeze({ id: 'Wheel_FR2', side: 'R', pivot: Object.freeze([1.88, 0.56, -0.72]) }),
    Object.freeze({ id: 'Wheel_RL1', side: 'L', pivot: Object.freeze([-1.88, 0.56, 0.72]) }),
    Object.freeze({ id: 'Wheel_RR1', side: 'R', pivot: Object.freeze([1.88, 0.56, 0.72]) }),
    Object.freeze({ id: 'Wheel_RL2', side: 'L', pivot: Object.freeze([-1.85, 0.56, 2.05]) }),
    Object.freeze({ id: 'Wheel_RR2', side: 'R', pivot: Object.freeze([1.85, 0.56, 2.05]) }),
  ]),
  // Low-mounted articulated twin cannon assemblies (2 barrels each -> 4 nozzles).
  cannons: Object.freeze({
    left: Object.freeze({
      id: 'cannonL',
      mount: Object.freeze([-1.42, 0.78, -2.35]),
      nozzles: Object.freeze([
        Object.freeze({ id: 'nozzle_L1', local: Object.freeze([-0.20, 0.06, -0.82]) }),
        Object.freeze({ id: 'nozzle_L2', local: Object.freeze([0.20, 0.06, -0.82]) }),
      ]),
    }),
    right: Object.freeze({
      id: 'cannonR',
      mount: Object.freeze([1.42, 0.78, -2.35]),
      nozzles: Object.freeze([
        Object.freeze({ id: 'nozzle_R1', local: Object.freeze([-0.20, 0.06, -0.82]) }),
        Object.freeze({ id: 'nozzle_R2', local: Object.freeze([0.20, 0.06, -0.82]) }),
      ]),
    }),
  }),
  undersideIgnitionOrigin: Object.freeze([0, 0.25, 0]),
  fuelOutletOrigins: Object.freeze([
    Object.freeze([-1.95, 0.45, -1.2]),
    Object.freeze([1.95, 0.45, -1.2]),
    Object.freeze([-1.95, 0.45, 1.2]),
    Object.freeze([1.95, 0.45, 1.2]),
  ]),
  steamExhaustOrigins: Object.freeze([
    Object.freeze([0, 1.4, -2.75]),
    Object.freeze([2.05, 1.4, 0]),
    Object.freeze([0, 1.4, 2.75]),
    Object.freeze([-2.05, 1.4, 0]),
  ]),
  landingImpactOrigin: Object.freeze([0, 0.05, 0]),
  // Local stations for crew & disembarkation; recalibrated when Neon delivers final GLB.
  stations: Object.freeze({
    operatorSeat: Object.freeze([0, 1.15, 0.25]),
    boardingEntry: Object.freeze([0, 0, 3.6]),
    passengers: Object.freeze([
      Object.freeze({ slot: 0, seat: Object.freeze([-1.15, 1.25, -0.75]), aperture: Object.freeze([-2.08, 1.45, -0.75]), yawOffset: Math.PI / 2 }),
      Object.freeze({ slot: 1, seat: Object.freeze([1.15, 1.25, -0.75]), aperture: Object.freeze([2.08, 1.45, -0.75]), yawOffset: -Math.PI / 2 }),
      Object.freeze({ slot: 2, seat: Object.freeze([-1.15, 1.25, 0.95]), aperture: Object.freeze([-2.08, 1.45, 0.95]), yawOffset: Math.PI / 2 }),
      Object.freeze({ slot: 3, seat: Object.freeze([1.15, 1.25, 0.95]), aperture: Object.freeze([2.08, 1.45, 0.95]), yawOffset: -Math.PI / 2 }),
      Object.freeze({ slot: 4, seat: Object.freeze([0, 1.35, -1.25]), aperture: Object.freeze([0, 1.65, -2.55]), yawOffset: 0 }),
      Object.freeze({ slot: 5, seat: Object.freeze([0, 1.35, 1.55]), aperture: Object.freeze([0, 1.65, 2.65]), yawOffset: Math.PI }),
    ]),
    exits: Object.freeze([
      Object.freeze([0, 0, 3.7]),
      Object.freeze([-3.1, 0, 1.0]),
      Object.freeze([3.1, 0, 1.0]),
      Object.freeze([-3.1, 0, -1.0]),
      Object.freeze([3.1, 0, -1.0]),
      Object.freeze([0, 0, -3.7]),
      Object.freeze([-3.4, 0, 2.8]),
      Object.freeze([3.4, 0, 2.8]),
    ]),
  }),
  heatZones: Object.freeze(['cannons', 'underside', 'furnaceInterior']),
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
    maxPassengerCapacity: 6,
    boardDurationSec: 0.85,
    disembarkDurationSec: 1.05,
    campFireDisembarkDurationSec: 1.95, // Opening sealed hatches takes longer without trapping occupants forever
    boardReachRadius: 4.8,
    pilotContributes: false,
    allowMultiPreparedSpells: false, // Explicit rule: 1 primary equipped spell contribution per passenger by default
    repairAssistBonusFraction: 0.15,
    dangerHeatThreshold: 115, // Triggers crew warning indicators
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
