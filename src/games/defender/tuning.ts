/**
 * Every Defender number lives here. World axes: Y up, meters, the bridge runs
 * along -Z from the castle gate, and the walkway sits on the wall above it.
 */

export interface Range { min: number; max: number; }

export const LAYOUT = {
    waterY: -1.2,
    /** Outer face of the curtain wall and the near end of the bridge. */
    wallFrontZ: -0.4,
    wallBackZ: 4.4,
    walkwayY: 5,
    walkwayHalfLength: 9,
    parapetInnerZ: 0,
    crenelHeight: 0.7,
    merlonHeight: 1.05,
    merlonWidth: 0.9,
    merlonSpacing: 1.6,
    /** Open round platforms flanking the gate, overhanging the moat. */
    towerX: 8,
    towerZ: -1.8,
    towerRadius: 3.5,
    /** Stand this far inside the tower rim, clear of the battlements. */
    towerWalkInset: 0.7,
    /** How far the eye may lean past the standing rim. */
    towerLeanExtra: 1.05,
    bridgeHalfWidth: 4,
    bridgeLength: 36,
    railHeight: 0.6,
    gateHalfWidth: 2,
    gateHeight: 3.6,
    courtyardDepth: 40,
    courtyardHalfWidth: 26,
} as const;

export const PLAYER = {
    eyeHeight: 1.6,
    walkSpeed: 3.2,
    /** Walk speed multiplier while the bow is drawn or held. */
    drawWalkFactor: 0.5,
    walk: { x: { min: -8.2, max: 8.2 }, z: { min: 0.3, max: 3.7 } } as { x: Range; z: Range },
    /** Looking down past these pitches leans the eye forward over the battlements. */
    leanStartPitch: -0.35,
    leanFullPitch: -1.05,
    leanDistance: 1.4,
    /** The leaning eye never passes beyond this Z: just past the wall face, so goblins at the gate are in sight. */
    leanLimitZ: -0.75,
    lookSensitivity: 0.0022,
    touchLookSensitivity: 0.005,
    pitchLimit: 1.48,
    fov: 70,
};

export const BOW = {
    /** Seconds from nock to full draw. */
    drawTime: 0.85,
    /** Seconds after a shot before the next arrow is nocked. */
    nockDelay: 0.32,
    speed: { min: 18, max: 62 } as Range,
    damage: { min: 8, max: 34 } as Range,
};

export const ARROW = {
    gravity: 9.81,
    /** Quadratic air drag: deceleration = drag × speed². */
    drag: 0.0012,
    lifetime: 6,
    stuckLifetime: 4,
    length: 0.85,
    /** Spawn distance ahead of the eye along the aim. The first flight segment still starts here, so keep it short. */
    spawnOffset: 0.15,
};

export type EnemyId = 'goblin' | 'runner' | 'brute' | 'shield' | 'caster';

export interface EnemyKind {
    id: EnemyId;
    name: string;
    health: number;
    speed: number;
    /** Speed never grows past this, however deep the run goes. */
    speedCap: number;
    gateDamagePerSecond: number;
    radius: number;
    height: number;
    /** Experience granted on death, before Keen Eye. */
    xp: number;
    /** Visual size relative to a goblin. */
    scale: number;
    /** When true, arrows into the front of the shield do nothing. */
    shield: boolean;
    /** Stops this far short of the gate and attacks from range. 0 walks all the way in. */
    standoff: number;
    castDamage: number;
    castInterval: number;
}

export const GOBLIN: EnemyKind = {
    id: 'goblin',
    name: 'goblin',
    health: 30,
    speed: 1.6,
    speedCap: 3,
    gateDamagePerSecond: 1,
    radius: 0.35,
    height: 1.25,
    xp: 8,
    scale: 1,
    shield: false,
    standoff: 0,
    castDamage: 0,
    castInterval: 0,
};

export const RUNNER: EnemyKind = {
    id: 'runner',
    name: 'runner',
    health: 14,
    speed: 3.15,
    speedCap: 4.4,
    gateDamagePerSecond: 0.55,
    radius: 0.28,
    height: 1.05,
    xp: 9,
    scale: 0.8,
    shield: false,
    standoff: 0,
    castDamage: 0,
    castInterval: 0,
};

export const BRUTE: EnemyKind = {
    id: 'brute',
    name: 'brute',
    health: 120,
    speed: 0.82,
    speedCap: 1.45,
    gateDamagePerSecond: 2.6,
    radius: 0.58,
    height: 1.95,
    xp: 24,
    scale: 1.55,
    shield: false,
    standoff: 0,
    castDamage: 0,
    castInterval: 0,
};

export const SHIELD_BEARER: EnemyKind = {
    id: 'shield',
    name: 'shield',
    health: 52,
    speed: 1.2,
    speedCap: 2.1,
    gateDamagePerSecond: 1.15,
    radius: 0.4,
    height: 1.4,
    xp: 14,
    scale: 1.08,
    shield: true,
    standoff: 0,
    castDamage: 0,
    castInterval: 0,
};

export const CASTER: EnemyKind = {
    id: 'caster',
    name: 'caster',
    health: 26,
    speed: 1.35,
    speedCap: 2.1,
    gateDamagePerSecond: 0.35,
    radius: 0.34,
    height: 1.45,
    xp: 16,
    scale: 1.05,
    shield: false,
    standoff: 13,
    castDamage: 7,
    castInterval: 2.8,
};

export const ENEMIES: Record<EnemyId, EnemyKind> = {
    goblin: GOBLIN,
    runner: RUNNER,
    brute: BRUTE,
    shield: SHIELD_BEARER,
    caster: CASTER,
};

/**
 * Experience is one pool shared by every archer, and the team levels together.
 * Every foe in a wave must fall before the next one comes, so a wave's experience is
 * fixed. Level costs are pinned to it: through `plateauLevel`, each level costs
 * `waveShare` of the wave with the same number, so every wave pays at least one level.
 * Past that, costs grow by `lateGrowth` a level while waves grow by roughly 7%, so the
 * banked surplus carries waves 11 and 12, and from wave 13 a level takes a wave and a half
 * and keeps slowing. `npx tsx scripts/xp-curve.ts` prints the whole curve.
 */
export const XP = {
    waveShare: 0.92,
    plateauLevel: 10,
    lateGrowth: 1.2,
    pointsPerLevel: 2,
} as const;

/** Skill numbers. Ranks start at 1; `per` values add once per rank. */
export const SKILLS = {
    /** Character level each tier opens at: tier 1, 2, 3, and the ultimate. */
    tierLevels: [1, 3, 6, 10],
    slots: 6,
    // Marksman: bleed path
    barbed: { bleedDps: 3, bleedDpsPer: 3, bleedTime: 3 },
    lingering: { timePer: 0.8, woundPer: 0.08 },
    ricochet: { chancePer: 0.08, range: 4.5, damage: 0.7 },
    // Marksman: burst path
    quick: { speedPer: 0.07 },
    heavy: { fullDraw: 0.95, damagePer: 0.15, shovePer: 0.3 },
    power: { cooldown: 11, cooldownPer: -0.6, damage: 40, damagePer: 12, speed: 82 },
    // Marksman ultimate
    rapid: { cooldown: 24, duration: 8, attackSpeed: [0.25, 0.375, 0.5] },
    // Warden: slow path
    chill: { slowPer: 0.08, time: 2.2 },
    tar: { cooldown: 14, cooldownPer: -0.6, duration: 5, durationPer: 1, slow: 0.6, slowPer: -0.05, reach: 3.1, halfWidth: 3.3 },
    frostbite: { damagePer: 0.06 },
    // Warden: support path
    concuss: { cooldown: 9, cooldownPer: -0.5, damage: 12, stun: 0.8, stunPer: 0.2, radius: 1.8, speed: 60 },
    mending: { cooldown: 20, duration: 5, durationPer: 1, heal: 0.06, healPer: 0.01, gateReach: 3.6 },
    shockwave: { cooldown: 16, cooldownPer: -0.8, distance: 4, distancePer: 0.4, stun: 0.6, stunPer: 0.12, range: 9 },
    // Warden ultimate
    winter: { slow: 0.6, chillTime: 2.4, hits: 3, window: 4, freeze: [1.2, 1.6, 2.0] },
} as const;

export const ENEMY_MOTION = {
    spawnZ: -34.5,
    spawnHalfWidth: 3.4,
    /** Center Z where a goblin stands while striking the gate. */
    gateStrikeZ: -1.0,
    /** Within this distance of the gate, goblins funnel toward the door. */
    funnelDistance: 9,
    separationRadius: 1.0,
    separationStrength: 1.6,
    speedJitter: 0.1,
    deathDuration: 0.9,
};

export const WAVES = {
    baseCount: 5,
    countPerWave: 3,
    healthGrowth: 0.08,
    speedGrowth: 0.06,
    maxSpeed: 3,
    gateDamageGrowth: 0.05,
    baseSpawnGap: 1.6,
    spawnGapShrink: 0.1,
    minSpawnGap: 0.45,
    breakSeconds: 6,
    /** Each archer past the first adds this share of every group on a wave. */
    extraPerArcher: 0.25,
    /** Each archer past the first adds this share of every foe's health. */
    healthPerArcher: 0.8,
};

export const NET = {
    port: 2567,
    roomName: 'defender',
    maxArchers: 4,
    /** Milliseconds between state patches sent to clients. */
    patchMs: 33,
    /** Seconds between pose updates a client sends. */
    inputInterval: 1 / 30,
    /** A pose may not move further than walk speed times this, plus `moveSlack`, since the last one. */
    moveTolerance: 1.6,
    moveSlack: 0.35,
    /** Seconds of latency forgiven on the nock delay and the draw. */
    shotSlack: 0.15,
    /** The client snaps its feet to the server when they disagree by more than this. */
    snapDistance: 1.5,
};

/** Cloak colors for archers 1 to 4. */
export const ARCHER_COLORS = [0xb8282e, 0x2d6fb8, 0xd9a321, 0x3f9a4a] as const;

export const GATE = {
    health: 100,
};

export const SIM = {
    step: 1 / 60,
    maxStepsPerFrame: 5,
};

export const BEST_WAVE_KEY = 'defender.bestWave';
