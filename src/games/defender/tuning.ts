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
    towerX: 11,
    towerRadius: 2.4,
    towerHeight: 9.5,
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

export interface EnemyKind {
    name: string;
    health: number;
    speed: number;
    gateDamagePerSecond: number;
    radius: number;
    height: number;
}

export const GOBLIN: EnemyKind = {
    name: 'goblin',
    health: 30,
    speed: 1.6,
    gateDamagePerSecond: 1,
    radius: 0.35,
    height: 1.25,
};

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
};

export const GATE = {
    health: 100,
};

export const SIM = {
    step: 1 / 60,
    maxStepsPerFrame: 5,
};

export const BEST_WAVE_KEY = 'defender.bestWave';
