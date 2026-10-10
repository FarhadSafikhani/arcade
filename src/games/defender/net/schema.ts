import { schema, t, type SchemaType } from '@colyseus/schema';

/**
 * The replicated Defender room. Field names match the sim's public shapes in
 * sim.ts, so the renderer reads either one. Shared by the server and the client.
 */

/** Bump when the wire format changes, so stale tabs refuse a newer server instead of misreading it. */
export const PROTOCOL = 1;

export const EnemyState = schema({
    kind: t.string(),
    x: t.float32(),
    z: t.float32(),
    facing: t.float32(),
    mode: t.string(),
    health: t.float32(),
    maxHealth: t.float32(),
    pace: t.float32(),
    charge: t.float32(),
}, 'EnemyState');
export type EnemyState = SchemaType<typeof EnemyState>;

export const ArrowState = schema({
    owner: t.string(),
    seq: t.uint32(),
    x: t.float32(),
    y: t.float32(),
    z: t.float32(),
    vx: t.float32(),
    vy: t.float32(),
    vz: t.float32(),
    stuck: t.boolean(),
    enemy: t.string(),
}, 'ArrowState');
export type ArrowState = SchemaType<typeof ArrowState>;

export const BoltState = schema({
    x: t.float32(),
    y: t.float32(),
    z: t.float32(),
    vx: t.float32(),
    vy: t.float32(),
    vz: t.float32(),
}, 'BoltState');
export type BoltState = SchemaType<typeof BoltState>;

export const OilState = schema({
    x: t.float32(),
    z: t.float32(),
}, 'OilState');
export type OilState = SchemaType<typeof OilState>;

export const PlayerState = schema({
    name: t.string(),
    slot: t.uint8(),
    x: t.float32(),
    z: t.float32(),
    yaw: t.float32(),
    pitch: t.float32(),
    draw: t.float32(),
    level: t.uint16(),
    xp: t.float32(),
    pending: t.uint8(),
    offer: t.array('string'),
    spells: t.array('string'),
    cooldowns: t.array('float32'),
    cooldownMax: t.array('float32'),
    ranks: t.map('uint8'),
    drawTime: t.float32(),
    nock: t.float32(),
    drawMove: t.float32(),
}, 'PlayerState');
export type PlayerState = SchemaType<typeof PlayerState>;

export const DefenderState = schema({
    protocol: t.uint8(),
    phase: t.string(),
    wave: t.uint16(),
    gate: t.float32(),
    gateMax: t.float32(),
    breakLeft: t.float32(),
    enemies: t.map(EnemyState),
    arrows: t.map(ArrowState),
    bolts: t.map(BoltState),
    oils: t.map(OilState),
    players: t.map(PlayerState),
}, 'DefenderState');
export type DefenderState = SchemaType<typeof DefenderState>;

/** Messages a client sends. */
export interface ClientMessages {
    start: Record<string, never>;
    pose: { x: number; z: number; yaw: number; pitch: number; draw: number };
    loose: { draw: number; yaw: number; pitch: number; x: number; z: number; seq: number };
    cast: { slot: number; yaw: number; pitch: number };
    pick: { index: number };
}
