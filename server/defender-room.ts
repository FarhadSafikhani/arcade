import { Room, type Client } from '@colyseus/core';
import { ArraySchema } from '@colyseus/schema';
import { DefenderSim, type FxEvent } from '../src/games/defender/sim';
import {
    ArrowState, BoltState, DefenderState, EnemyState, OilState, PlayerState, PROTOCOL, type ClientMessages,
} from '../src/games/defender/net/schema';
import { NET, SIM } from '../src/games/defender/tuning';

type Fields = Record<string, unknown>;

/**
 * One gate, up to four archers. The room owns the only real simulation: clients
 * send poses, shots, casts, and skill points, and receive the replicated state plus
 * a batch of effects after every patch.
 */
export class DefenderRoom extends Room<{ state: DefenderState }> {
    maxClients = NET.maxArchers;
    state = new DefenderState();
    private sim!: DefenderSim;
    private fx: FxEvent[] = [];

    async onCreate(): Promise<void> {
        this.sim = await DefenderSim.create();
        this.state.protocol = PROTOCOL;
        this.patchRate = NET.patchMs;
        this.publish();

        this.onMessage('start', () => {
            if (this.sim.phase === 'lobby' || this.sim.phase === 'over') this.sim.start();
        });
        this.onMessage('pose', (client: Client, message: ClientMessages['pose']) => {
            this.sim.pose(client.sessionId, message);
        });
        this.onMessage('loose', (client: Client, message: ClientMessages['loose']) => {
            this.sim.loose(client.sessionId, message);
        });
        this.onMessage('cast', (client: Client, message: ClientMessages['cast']) => {
            this.sim.cast(client.sessionId, Math.floor(message.slot), message.yaw, message.pitch);
        });
        if (process.env.DEFENDER_CHEATS === '1') {
            this.onMessage('cheat', (_client: Client, message: { levels?: number }) => this.sim.grantLevels(Number(message?.levels) || 1));
        }
        this.onMessage('learn', (client: Client, message: ClientMessages['learn']) => {
            if (typeof message?.skill === 'string') this.sim.learn(client.sessionId, message.skill);
        });

        this.setSimulationInterval(() => {
            this.sim.step(SIM.step);
            this.fx.push(...this.sim.drain());
            this.publish();
        }, SIM.step * 1000);
    }

    onJoin(client: Client, options: { name?: unknown } = {}): void {
        const name = typeof options.name === 'string' && options.name.trim() ? options.name.trim().slice(0, 16) : '';
        this.sim.addPlayer(client.sessionId, name || `Archer ${this.clients.length}`);
        this.publish();
    }

    onLeave(client: Client): void {
        this.sim.removePlayer(client.sessionId);
        this.publish();
    }

    /** Effects ride just ahead of the patch they belong to, collapsed to one gate shudder per batch. */
    onBeforePatch(): void {
        if (this.fx.length === 0) return;
        let shook = false;
        const batch = this.fx.filter(event => {
            if (event.t !== 'gate') return true;
            if (shook) return false;
            shook = true;
            return true;
        });
        this.fx = [];
        this.broadcast('fx', batch);
    }

    private publish(): void {
        const sim = this.sim;
        const state = this.state;
        assign(state, {
            phase: sim.phase, wave: sim.wave, gate: sim.gate, gateMax: sim.gateMax, breakLeft: sim.breakLeft,
            level: sim.level, xp: sim.xp,
        });
        mirror(state.enemies, sim.enemies, () => new EnemyState(), (target, enemy) => assign(target, {
            kind: enemy.kind, x: enemy.x, z: enemy.z, facing: enemy.facing, mode: enemy.mode,
            health: enemy.health, maxHealth: enemy.maxHealth, pace: enemy.pace, charge: enemy.charge, status: enemy.status,
        }));
        mirror(state.arrows, sim.arrows, () => new ArrowState(), (target, arrow) => {
            // A stuck arrow never moves again, so it costs nothing after its last patch.
            assign(target, {
                owner: arrow.owner, seq: arrow.seq, kind: arrow.kind, x: arrow.x, y: arrow.y, z: arrow.z,
                vx: arrow.vx, vy: arrow.vy, vz: arrow.vz, stuck: arrow.stuck, enemy: arrow.enemy,
            });
        });
        mirror(state.bolts, sim.bolts, () => new BoltState(), (target, bolt) => assign(target, {
            x: bolt.x, y: bolt.y, z: bolt.z, vx: bolt.vx, vy: bolt.vy, vz: bolt.vz,
        }));
        mirror(state.oils, sim.oils, () => new OilState(), (target, oil) => assign(target, { x: oil.x, z: oil.z }));
        mirror(state.players, sim.players, () => new PlayerState(), (target, player) => {
            assign(target, {
                name: player.name, slot: player.slot, x: player.x, z: player.z, yaw: player.yaw, pitch: player.pitch,
                draw: player.draw, points: player.points, drawTime: player.drawTime, nock: player.nock,
            });
            list(target.actives, player.actives);
            list(target.cooldowns, player.cooldowns.map(left => Math.round(left * 10) / 10));
            list(target.cooldownMax, player.cooldownMax);
            list(target.buffs, player.buffs);
            list(target.buffLeft, player.buffLeft.map(left => Math.round(left * 10) / 10));
            list(target.buffMax, player.buffMax);
            for (const key of [...target.ranks.keys()]) if (!player.ranks.has(key)) target.ranks.delete(key);
            for (const [key, rank] of player.ranks) if (target.ranks.get(key) !== rank) target.ranks.set(key, rank);
        });
    }
}

/** Writes only fields that changed, so untouched values stay out of the patch. */
function assign(target: object, values: Fields): void {
    const record = target as Fields;
    for (const key in values) if (record[key] !== values[key]) record[key] = values[key];
}

function mirror<S, V>(
    target: { get(key: string): S | undefined; set(key: string, value: S): unknown; delete(key: string): unknown; keys(): Iterable<string> },
    source: Map<string, V>,
    make: () => S,
    write: (target: S, value: V) => void,
): void {
    for (const key of [...target.keys()]) if (!source.has(key)) target.delete(key);
    for (const [key, value] of source) {
        let entry = target.get(key);
        if (!entry) {
            entry = make();
            write(entry, value);
            target.set(key, entry);
        } else write(entry, value);
    }
}

function list<T>(target: ArraySchema<T>, values: readonly T[]): void {
    if (target.length === values.length && values.every((value, index) => target.at(index) === value)) return;
    target.clear();
    target.push(...values);
}
