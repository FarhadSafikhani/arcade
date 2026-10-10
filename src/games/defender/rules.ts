import { BOW, ENEMIES, LAYOUT, PLAYER, WAVES, XP, type EnemyId, type EnemyKind, type Range } from './tuning';

export interface WaveSpec {
    wave: number;
    count: number;
    health: number;
    speed: number;
    gateDamagePerSecond: number;
    spawnGap: number;
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function lerp(range: Range, t: number): number {
    return range.min + (range.max - range.min) * t;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

/** Draw from 0 to 1. Eased so the last part of the pull is the slowest. */
export function drawFraction(heldSeconds: number, drawTime = BOW.drawTime): number {
    const t = clamp(heldSeconds / drawTime, 0, 1);
    return 1 - (1 - t) * (1 - t);
}

export function arrowSpeed(draw: number): number {
    return lerp(BOW.speed, clamp(draw, 0, 1));
}

export function arrowDamage(draw: number): number {
    return Math.round(lerp(BOW.damage, clamp(draw, 0, 1)));
}

export function walkSpeed(drawing: boolean): number {
    return PLAYER.walkSpeed * (drawing ? PLAYER.drawWalkFactor : 1);
}

/** How far the eye leans forward over the battlements at a given pitch. */
export function leanDistance(pitch: number): number {
    return PLAYER.leanDistance * smoothstep(PLAYER.leanStartPitch, PLAYER.leanFullPitch, pitch);
}

function onTower(x: number, z: number, extra: number): boolean {
    const radius = LAYOUT.towerRadius - LAYOUT.towerWalkInset + extra;
    const limit = radius * radius;
    for (const side of [-1, 1]) {
        const dx = x - side * LAYOUT.towerX;
        const dz = z - LAYOUT.towerZ;
        if (dx * dx + dz * dz <= limit) return true;
    }
    return false;
}

/** Feet may rest on the gate walkway or on either overhanging tower. */
export function canStand(x: number, z: number): boolean {
    const walk = PLAYER.walk;
    if (x >= walk.x.min && x <= walk.x.max && z >= walk.z.min && z <= walk.z.max) return true;
    return onTower(x, z, 0);
}

/** The eye may lean past the battlements, including out over a tower rim. */
export function canLean(x: number, z: number): boolean {
    if (x >= PLAYER.walk.x.min - 0.45 && x <= PLAYER.walk.x.max + 0.45
        && z >= PLAYER.leanLimitZ && z <= PLAYER.walk.z.max + 0.45) return true;
    return onTower(x, z, LAYOUT.towerLeanExtra);
}

/**
 * A shield faces `faceX, faceZ`. The shot is blocked when it travels into that face
 * and is not dropping almost straight down.
 */
export function shieldBlocks(vx: number, vy: number, vz: number, faceX: number, faceZ: number): boolean {
    const horizontal = Math.hypot(vx, vz);
    if (horizontal < 0.8) return false;
    if (vy < -horizontal * 1.2) return false;
    const face = Math.hypot(faceX, faceZ) || 1;
    const intoFace = -(vx * faceX + vz * faceZ) / (horizontal * face);
    return intoFace > 0.78;
}

export function xpToAdvance(level: number): number {
    return XP.base + (Math.max(1, Math.floor(level)) - 1) * XP.perLevel;
}

export function grantXp(xp: number, level: number, gained: number): { xp: number; level: number; gainedLevels: number } {
    let nextXp = xp + Math.max(0, gained);
    let nextLevel = Math.max(1, Math.floor(level));
    let gainedLevels = 0;
    while (nextXp >= xpToAdvance(nextLevel) && gainedLevels < 12) {
        nextXp -= xpToAdvance(nextLevel);
        nextLevel += 1;
        gainedLevels += 1;
    }
    return { xp: nextXp, level: nextLevel, gainedLevels };
}

/** Health, speed, and hitting power for one kind on a given wave. Experience does not scale. */
export function scaleEnemy(kind: EnemyKind, wave: number): EnemyKind {
    const level = Math.max(1, Math.floor(wave)) - 1;
    return {
        ...kind,
        health: Math.round(kind.health * (1 + WAVES.healthGrowth * level)),
        speed: Math.min(kind.speedCap, kind.speed * (1 + WAVES.speedGrowth * level * 0.65)),
        gateDamagePerSecond: kind.gateDamagePerSecond * (1 + WAVES.gateDamageGrowth * level),
        castDamage: kind.castDamage * (1 + WAVES.gateDamageGrowth * level),
        castInterval: kind.castInterval === 0 ? 0 : Math.max(1.15, kind.castInterval * (1 - 0.03 * level)),
    };
}

export interface WaveGroup {
    id: EnemyId;
    count: number;
}

/** Who arrives this wave. Later waves add runners, shields, brutes, then casters. */
export function wavePlan(wave: number): WaveGroup[] {
    const n = Math.max(1, Math.floor(wave));
    const plan: WaveGroup[] = [{ id: 'goblin', count: 4 + n }];
    if (n >= 2) plan.push({ id: 'runner', count: 1 + Math.floor((n - 2) / 2) });
    if (n >= 3) plan.push({ id: 'shield', count: 1 + Math.floor((n - 3) / 3) });
    if (n >= 4) plan.push({ id: 'brute', count: 1 + Math.floor((n - 4) / 4) });
    if (n >= 5) plan.push({ id: 'caster', count: 1 + Math.floor((n - 5) / 4) });
    return plan;
}

/** Round-robin spawn order so a new kind shows up early in the wave, not after the last goblin. */
export function spawnList(wave: number): EnemyId[] {
    const queues = wavePlan(wave).map(group => ({ id: group.id, left: group.count }));
    const list: EnemyId[] = [];
    while (queues.some(group => group.left > 0)) {
        for (const group of queues) {
            if (group.left <= 0) continue;
            list.push(group.id);
            group.left -= 1;
        }
    }
    return list;
}

export function enemyKind(id: EnemyId): EnemyKind {
    return ENEMIES[id];
}

export function waveSpec(wave: number, kind: EnemyKind): WaveSpec {
    const level = Math.max(1, Math.floor(wave)) - 1;
    return {
        wave: level + 1,
        count: WAVES.baseCount + WAVES.countPerWave * level,
        health: Math.round(kind.health * (1 + WAVES.healthGrowth * level)),
        speed: Math.min(WAVES.maxSpeed, kind.speed * (1 + WAVES.speedGrowth * level)),
        gateDamagePerSecond: kind.gateDamagePerSecond * (1 + WAVES.gateDamageGrowth * level),
        spawnGap: Math.max(WAVES.minSpawnGap, WAVES.baseSpawnGap - WAVES.spawnGapShrink * level),
    };
}

/** Gate health after a span of time with goblins striking it at the given rates. */
export function gateAfterStrikes(gate: number, ratesPerSecond: readonly number[], seconds: number): number {
    const damage = ratesPerSecond.reduce((total, rate) => total + rate, 0) * seconds;
    return Math.max(0, gate - damage);
}

export function readBestWave(storage: Pick<Storage, 'getItem'>, key: string): number {
    try {
        const value = Number(storage.getItem(key));
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } catch {
        return 0;
    }
}
