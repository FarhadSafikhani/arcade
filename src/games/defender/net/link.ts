/// <reference types="vite/client" />
import { Client, type Room } from '@colyseus/sdk';
import { DefenderSim, type FxEvent, type Loose, type Pose } from '../sim';
import { NET, SIM } from '../tuning';
import { DefenderState, PROTOCOL } from './schema';

/** A keyed collection the renderer can walk. Both `Map` and Colyseus `MapSchema` fit. */
export interface Table<T> {
    forEach(callback: (value: T, key: string) => void): void;
    get(key: string): T | undefined;
    readonly size: number;
}

export type Seq<T> = Iterable<T> & { readonly length: number };

export interface EnemyView { kind: string; x: number; z: number; facing: number; mode: string; health: number; maxHealth: number; pace: number; charge: number; }
export interface ArrowView { owner: string; seq: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; stuck: boolean; enemy: string; }
export interface BoltView { x: number; y: number; z: number; vx: number; vy: number; vz: number; }
export interface OilView { x: number; z: number; }
export interface PlayerView {
    name: string; slot: number; x: number; z: number; yaw: number; pitch: number; draw: number;
    level: number; xp: number; pending: number;
    offer: Seq<string>; spells: Seq<string>; cooldowns: Seq<number>; cooldownMax: Seq<number>; ranks: Table<number>;
    drawTime: number; nock: number; drawMove: number;
}

/** Everything a client draws and shows. The local sim and the replicated room state both satisfy it. */
export interface WorldView {
    phase: string;
    wave: number;
    gate: number;
    gateMax: number;
    breakLeft: number;
    enemies: Table<EnemyView>;
    arrows: Table<ArrowView>;
    bolts: Table<BoltView>;
    oils: Table<OilView>;
    players: Table<PlayerView>;
}

/** How the game talks to whoever runs the simulation: a sim in this page, or a co-op server. */
export interface Link {
    readonly online: boolean;
    /** This archer's key in `view.players`. */
    readonly me: string;
    readonly view: WorldView;
    /** Shareable room code, empty offline. */
    readonly roomId: string;
    start(): void;
    pose(pose: Pose): void;
    loose(shot: Loose): void;
    cast(slot: number, yaw: number, pitch: number): void;
    pick(index: number): void;
    /** Advances a local sim (unless paused) and returns effects since the last call. */
    update(dt: number, paused: boolean): FxEvent[];
    leave(): void;
    /** Called once if the connection drops. */
    onClose: ((reason: string) => void) | null;
}

export class LocalLink implements Link {
    readonly online = false;
    readonly me = 'you';
    readonly roomId = '';
    onClose: ((reason: string) => void) | null = null;
    private accumulator = 0;

    private constructor(private readonly sim: DefenderSim) {
        sim.addPlayer(this.me, 'You');
    }

    static async create(): Promise<LocalLink> {
        return new LocalLink(await DefenderSim.create());
    }

    get view(): WorldView {
        return this.sim;
    }

    start(): void {
        this.accumulator = 0;
        this.sim.start();
    }

    pose(pose: Pose): void {
        this.sim.pose(this.me, pose, true);
    }

    loose(shot: Loose): void {
        this.sim.loose(this.me, shot);
    }

    cast(slot: number, yaw: number, pitch: number): void {
        this.sim.cast(this.me, slot, yaw, pitch);
    }

    pick(index: number): void {
        this.sim.pick(this.me, index);
    }

    update(dt: number, paused: boolean): FxEvent[] {
        if (!paused) {
            this.accumulator += dt;
            let steps = 0;
            while (this.accumulator >= SIM.step && steps < SIM.maxStepsPerFrame) {
                this.sim.step(SIM.step);
                this.accumulator -= SIM.step;
                steps++;
            }
            if (steps === SIM.maxStepsPerFrame) this.accumulator = 0;
        }
        return this.sim.drain();
    }

    leave(): void { /* nothing to close */ }
}

/**
 * Co-op server base URL. Dev talks to `npm run server` on this machine; a release
 * build bakes in `VITE_DEFENDER_SERVER`, a path such as `/defender/ws` on the game host.
 */
export function serverEndpoint(): string {
    const configured = import.meta.env.VITE_DEFENDER_SERVER as string | undefined;
    if (configured) return new URL(configured, location.origin).href.replace(/\/$/, '');
    return `${location.protocol}//${location.hostname}:${NET.port}/ws`;
}

/**
 * The game host forwards WebSockets only at exactly `<base>/ws`, so the room path
 * Colyseus would put in the URL rides in `?room=` instead. server/defender.ts undoes it.
 */
function routeThroughWs(url: URL): string {
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return url.href;
    const match = url.pathname.match(/^(.*\/ws)\/([^/]+\/[^/]+)$/);
    if (!match) return url.href;
    url.pathname = match[1];
    url.searchParams.set('room', match[2]);
    return url.href;
}

export class NetLink implements Link {
    readonly online = true;
    onClose: ((reason: string) => void) | null = null;
    private fx: FxEvent[] = [];
    private closed = false;

    private constructor(private readonly room: Room<unknown, DefenderState>) {
        room.onMessage('fx', (batch: FxEvent[]) => { this.fx.push(...batch); });
        room.onLeave(() => this.close('Lost the connection to the co-op server.'));
        room.onError((_code, message) => this.close(message ?? 'The co-op server reported an error.'));
    }

    /** Joins the room with this code, or any open room when no code is given. */
    static async connect(roomId: string, name: string): Promise<NetLink> {
        const client = new Client(serverEndpoint(), { urlBuilder: routeThroughWs });
        const options = { name };
        const room = roomId
            ? await client.joinById(roomId, options, DefenderState)
            : await client.joinOrCreate(NET.roomName, options, DefenderState);
        const link = new NetLink(room);
        await link.firstState();
        if (link.view.protocol !== PROTOCOL) {
            link.leave();
            throw new Error('This page is older than the co-op server. Reload to update.');
        }
        return link;
    }

    get me(): string {
        return this.room.sessionId;
    }

    get roomId(): string {
        return this.room.roomId;
    }

    get view(): DefenderState {
        return this.room.state;
    }

    start(): void {
        this.send('start', {});
    }

    pose(pose: Pose): void {
        this.send('pose', pose);
    }

    loose(shot: Loose): void {
        this.send('loose', shot);
    }

    cast(slot: number, yaw: number, pitch: number): void {
        this.send('cast', { slot, yaw, pitch });
    }

    pick(index: number): void {
        this.send('pick', { index });
    }

    update(): FxEvent[] {
        const out = this.fx;
        this.fx = [];
        return out;
    }

    leave(): void {
        if (this.closed) return;
        this.closed = true;
        void this.room.leave(true).catch(() => undefined);
    }

    private send(type: string, message: unknown): void {
        if (!this.closed) this.room.send(type, message);
    }

    private firstState(): Promise<void> {
        if (this.room.state?.phase) return Promise.resolve();
        return new Promise(resolve => {
            const check = (): void => {
                if (this.room.state?.phase) resolve();
                else this.room.onStateChange.once(check);
            };
            this.room.onStateChange.once(check);
        });
    }

    private close(reason: string): void {
        const wasOpen = !this.closed;
        this.closed = true;
        if (wasOpen) this.onClose?.(reason);
    }
}
