import { BOW, EnemyKind, PLAYER, Range, WAVES } from './tuning';

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
export function drawFraction(heldSeconds: number): number {
    const t = clamp(heldSeconds / BOW.drawTime, 0, 1);
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
