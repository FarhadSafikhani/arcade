import RAPIER from '@dimforge/rapier3d-compat';
import { applyCard, combatMods, dealCards, emptyBuild, rolledDamage, spellCooldown, type CardId, type CombatMods, type RunBuild, type ShotProfile, type SpellId } from './cards';
import { buildCastleColliders } from './castle';
import {
    aimDirection, arrowDamage, arrowSpeed, canStand, clamp, drawFraction, eyePosition, grantXp, scaleEnemy, shieldBlocks,
    spawnList, turnAboutY, waveSpec, type Point3, type WaveSpec,
} from './rules';
import { ARROW, BOW, ENEMIES, ENEMY_MOTION, GATE, GOBLIN, LAYOUT, NET, PLAYER, SPELL, WAVES, type EnemyId, type EnemyKind } from './tuning';

/**
 * The whole Defender run with nothing drawn: waves, foes, arrows, spells, the gate,
 * and every archer on the wall. The co-op server runs one per room; solo play runs
 * one in the page. Renderers read the public fields, which match the network schema.
 */

export type Phase = 'lobby' | 'playing' | 'break' | 'over';
export type EnemyMode = 'walking' | 'striking' | 'casting' | 'stunned' | 'dying';

/** Something worth a flash, a puff, or a sound. Sent to clients alongside the state. */
export type FxEvent =
    | { t: 'hit'; enemy: string }
    | { t: 'kill'; enemy: string }
    | { t: 'block'; enemy: string }
    | { t: 'stick' }
    | { t: 'puff'; x: number; y: number; z: number; color: number; r: number }
    | { t: 'spark'; ax: number; az: number; bx: number; bz: number }
    | { t: 'gate' }
    | { t: 'loose'; owner: string; draw: number }
    | { t: 'spell'; owner: string }
    | { t: 'wave'; wave: number; fresh: EnemyId | '' }
    | { t: 'level'; owner: string }
    | { t: 'over'; wave: number };

export interface Pose { x: number; z: number; yaw: number; pitch: number; draw: number; }
export interface Loose { draw: number; yaw: number; pitch: number; x: number; z: number; seq: number; }

export interface SimEnemy {
    id: string;
    kind: EnemyId;
    x: number;
    z: number;
    facing: number;
    mode: EnemyMode;
    health: number;
    maxHealth: number;
    /** Walking pace this step, for the stride. */
    pace: number;
    /** Caster wind-up from 0 to 1. */
    charge: number;
}

export interface SimArrow {
    id: string;
    owner: string;
    /** The owner's shot number, so the shooter can match it to the arrow they already drew. 0 for spells. */
    seq: number;
    x: number; y: number; z: number;
    /** Velocity in flight. Once stuck, the unit direction it points. */
    vx: number; vy: number; vz: number;
    stuck: boolean;
    /** Foe the arrow rides in. Its position and direction are then in that foe's frame. */
    enemy: string;
}

export interface SimBolt { id: string; x: number; y: number; z: number; vx: number; vy: number; vz: number; }
export interface SimOil { id: string; x: number; z: number; }

export interface SimPlayer {
    id: string;
    name: string;
    slot: number;
    x: number;
    z: number;
    yaw: number;
    pitch: number;
    draw: number;
    level: number;
    xp: number;
    pending: number;
    offer: CardId[];
    spells: SpellId[];
    /** Seconds left on each slotted spell, aligned with `spells`. */
    cooldowns: number[];
    cooldownMax: number[];
    /** Rank of every card taken, passives and spells alike. */
    ranks: Map<string, number>;
    drawTime: number;
    nock: number;
    drawMove: number;
}

interface Enemy extends SimEnemy {
    spec: EnemyKind;
    body: RAPIER.RigidBody;
    collider: RAPIER.Collider;
    laneX: number;
    speed: number;
    clock: number;
    deathTime: number;
    castTimer: number;
    burn: number;
    burnDps: number;
    slow: number;
    slowMul: number;
    stun: number;
}

interface Arrow extends SimArrow {
    profile: ShotProfile;
    age: number;
    ignore: Set<number>;
}

interface Bolt extends SimBolt { damage: number; }
interface Oil extends SimOil { left: number; }

interface Archer extends SimPlayer {
    build: RunBuild;
    mods: CombatMods;
    brand: number;
    barrage: number;
    lastShot: number;
    lastPose: number;
}

export class DefenderSim {
    readonly enemies = new Map<string, SimEnemy>();
    readonly arrows = new Map<string, SimArrow>();
    readonly bolts = new Map<string, SimBolt>();
    readonly oils = new Map<string, SimOil>();
    readonly players = new Map<string, SimPlayer>();
    phase: Phase = 'lobby';
    wave = 0;
    gate: number = GATE.health;
    gateMax: number = GATE.health;
    breakLeft = 0;
    /** Running sim clock in seconds. */
    time = 0;

    private readonly physics: RAPIER.World;
    private readonly enemyByCollider = new Map<number, Enemy>();
    private fx: FxEvent[] = [];
    private spec: WaveSpec = waveSpec(1, GOBLIN);
    private queue: EnemyId[] = [];
    private spawnTimer = 0;
    private casterSide = 1;
    private nextId = 1;
    private struck = false;

    private constructor(private readonly random: () => number) {
        this.physics = new RAPIER.World({ x: 0, y: 0, z: 0 });
        buildCastleColliders(this.physics);
    }

    static async create(random: () => number = Math.random): Promise<DefenderSim> {
        await RAPIER.init();
        return new DefenderSim(random);
    }

    get archers(): number {
        return this.players.size;
    }

    get aliveCount(): number {
        let count = 0;
        for (const enemy of this.enemies.values()) if (enemy.mode !== 'dying') count++;
        return count;
    }

    /** Events since the last drain, oldest first. */
    drain(): FxEvent[] {
        const out = this.fx;
        this.fx = [];
        return out;
    }

    addPlayer(id: string, name: string): SimPlayer {
        const taken = new Set([...this.players.values()].map(player => player.slot));
        let slot = 0;
        while (taken.has(slot)) slot++;
        const spread = [0, -2.6, 2.6, -5.2][slot] ?? 0;
        const build = emptyBuild();
        const archer: Archer = {
            id, name, slot,
            x: spread, z: PLAYER.walk.z.min + 0.3, yaw: 0, pitch: -0.22, draw: 0,
            level: 1, xp: 0, pending: 0, offer: [], spells: [], cooldowns: [], cooldownMax: [], ranks: new Map(),
            drawTime: 1, nock: 1, drawMove: 1,
            build, mods: combatMods(build), brand: 0, barrage: 0, lastShot: -10, lastPose: this.time,
        };
        this.players.set(id, archer);
        this.refreshGateMax();
        return archer;
    }

    removePlayer(id: string): void {
        this.players.delete(id);
        this.refreshGateMax();
        if (this.players.size === 0 && this.phase !== 'lobby') this.toLobby();
    }

    /** Begins a fresh run. Archers keep their places and lose their upgrades. */
    start(): void {
        this.clearField();
        for (const archer of this.archerList()) {
            archer.build = emptyBuild();
            archer.level = 1;
            archer.xp = 0;
            archer.pending = 0;
            archer.offer = [];
            archer.brand = 0;
            archer.barrage = 0;
            archer.lastShot = -10;
            this.refreshArcher(archer);
        }
        this.refreshGateMax();
        this.gate = this.gateMax;
        this.startWave(1);
    }

    /** Where an archer stands and looks. A server checks the stride; solo play trusts it. */
    pose(id: string, pose: Pose, trusted = false): void {
        const archer = this.archer(id);
        if (!archer || !finitePose(pose)) return;
        archer.yaw = pose.yaw;
        archer.pitch = clamp(pose.pitch, -PLAYER.pitchLimit, PLAYER.pitchLimit);
        archer.draw = clamp(pose.draw, 0, 1);
        const elapsed = Math.max(0, this.time - archer.lastPose);
        archer.lastPose = this.time;
        const reach = PLAYER.walkSpeed * archer.drawMove * elapsed * NET.moveTolerance + NET.moveSlack;
        const moved = Math.hypot(pose.x - archer.x, pose.z - archer.z);
        if (trusted || (moved <= reach && canStand(pose.x, pose.z))) {
            archer.x = pose.x;
            archer.z = pose.z;
        }
    }

    /** Looses an arrow for an archer. Returns false when the bow was not ready. */
    loose(id: string, shot: Loose): boolean {
        const archer = this.archer(id);
        if (!archer || !this.active || archer.offer.length > 0 || !finitePose({ ...shot, draw: shot.draw })) return false;
        const nock = BOW.nockDelay * archer.mods.nock;
        const since = this.time - archer.lastShot;
        if (since < nock - NET.shotSlack) return false;
        const maxDraw = drawFraction(since - nock + NET.shotSlack, BOW.drawTime * archer.mods.drawTime);
        const draw = clamp(Math.min(shot.draw, maxDraw), 0, 1);
        archer.lastShot = this.time;
        archer.yaw = shot.yaw;
        archer.pitch = clamp(shot.pitch, -PLAYER.pitchLimit, PLAYER.pitchLimit);
        if (Math.hypot(shot.x - archer.x, shot.z - archer.z) < NET.snapDistance && canStand(shot.x, shot.z)) {
            archer.x = shot.x;
            archer.z = shot.z;
        }
        const profile = this.looseProfile(archer, draw);
        this.fire(archer, profile, 0, Math.max(0, Math.floor(shot.seq)));
        const extras = (this.random() < archer.mods.twinChance ? 1 : 0) + (archer.barrage > 0 ? SPELL.barrage.extra : 0);
        for (let index = 0; index < extras; index++) {
            const sign = index % 2 === 0 ? 1 : -1;
            const step = Math.ceil((index + 1) / 2);
            this.fire(archer, profile, sign * step * 0.08, 0);
        }
        this.fx.push({ t: 'loose', owner: id, draw });
        return true;
    }

    cast(id: string, slot: number, yaw: number, pitch: number): boolean {
        const archer = this.archer(id);
        if (!archer || this.phase !== 'playing' || archer.offer.length > 0) return false;
        if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return false;
        const spell = archer.build.spells[slot];
        const index = archer.spells.indexOf(spell);
        if (!spell || index < 0 || archer.cooldowns[index] > 0) return false;
        archer.yaw = yaw;
        archer.pitch = clamp(pitch, -PLAYER.pitchLimit, PLAYER.pitchLimit);
        this.castSpell(archer, spell);
        archer.cooldowns[index] = spellCooldown(spell, archer.build);
        this.fx.push({ t: 'spell', owner: id });
        return true;
    }

    pick(id: string, index: number): boolean {
        const archer = this.archer(id);
        const card = archer?.offer[index];
        if (!archer || !card) return false;
        const before = this.gateMax;
        applyCard(archer.build, card);
        this.refreshArcher(archer);
        this.refreshGateMax();
        this.gate = Math.min(this.gateMax, this.gate + Math.max(0, this.gateMax - before));
        archer.pending = Math.max(0, archer.pending - 1);
        archer.offer = [];
        if (archer.pending > 0) this.deal(archer);
        return true;
    }

    step(dt: number): void {
        if (!this.active) return;
        this.time += dt;
        for (const archer of this.archerList()) {
            archer.brand = Math.max(0, archer.brand - dt);
            archer.barrage = Math.max(0, archer.barrage - dt);
            for (let index = 0; index < archer.cooldowns.length; index++) {
                archer.cooldowns[index] = Math.max(0, archer.cooldowns[index] - dt);
            }
        }
        for (const [id, oil] of this.oils as Map<string, Oil>) {
            oil.left -= dt;
            if (oil.left <= 0) this.oils.delete(id);
        }

        if (this.phase === 'playing' && this.queue.length > 0) {
            this.spawnTimer -= dt;
            if (this.spawnTimer <= 0) {
                const id = this.queue.shift();
                if (id) this.spawnEnemy(scaleEnemy(ENEMIES[id], this.wave, this.archers));
                this.spawnTimer = this.spec.spawnGap;
            }
        }

        this.struck = false;
        this.moveEnemies(dt);
        this.moveBolts(dt);
        this.physics.timestep = dt;
        this.physics.step();
        this.moveArrows(dt);
        if (this.struck) this.fx.push({ t: 'gate' });
        if (this.gate <= 0) {
            this.phase = 'over';
            this.fx.push({ t: 'over', wave: this.wave });
            return;
        }

        if (this.phase === 'playing' && this.queue.length === 0 && this.aliveCount === 0) {
            this.phase = 'break';
            this.breakLeft = WAVES.breakSeconds;
            for (const archer of this.archerList()) if (archer.pending > 0) this.deal(archer);
        }
        if (this.phase === 'break' && !this.archerList().some(archer => archer.offer.length > 0)) {
            this.breakLeft -= dt;
            if (this.breakLeft <= 0) this.startWave(this.wave + 1);
        }
    }

    private get active(): boolean {
        return this.phase === 'playing' || this.phase === 'break';
    }

    private archer(id: string): Archer | undefined {
        return this.players.get(id) as Archer | undefined;
    }

    private archerList(): Archer[] {
        return [...this.players.values()] as Archer[];
    }

    private toLobby(): void {
        this.clearField();
        this.phase = 'lobby';
        this.wave = 0;
    }

    private clearField(): void {
        for (const enemy of [...this.enemies.values()] as Enemy[]) this.removeEnemy(enemy);
        this.arrows.clear();
        this.bolts.clear();
        this.oils.clear();
        this.queue = [];
        this.casterSide = 1;
        this.breakLeft = 0;
    }

    private startWave(wave: number): void {
        this.wave = wave;
        this.spec = waveSpec(wave, GOBLIN);
        const earlier = new Set(wave > 1 ? spawnList(wave - 1, this.archers) : []);
        this.queue = spawnList(wave, this.archers);
        this.spawnTimer = 0.6;
        this.phase = 'playing';
        const fresh = this.queue.find(id => id !== 'goblin' && !earlier.has(id)) ?? '';
        this.fx.push({ t: 'wave', wave, fresh });
    }

    private deal(archer: Archer): void {
        archer.offer = dealCards(this.random, archer.build);
        if (archer.offer.length === 0) {
            archer.pending = 0;
            this.gate = Math.min(this.gateMax, this.gate + 12);
        }
    }

    private refreshArcher(archer: Archer): void {
        archer.mods = combatMods(archer.build);
        const spells = [...archer.build.spells];
        archer.cooldowns = spells.map(spell => {
            const index = archer.spells.indexOf(spell);
            return index >= 0 ? archer.cooldowns[index] ?? 0 : 0;
        });
        archer.spells = spells;
        archer.cooldownMax = spells.map(spell => spellCooldown(spell, archer.build));
        archer.ranks = new Map(Object.entries({ ...archer.build.ranks, ...archer.build.spellRanks }));
        archer.drawTime = archer.mods.drawTime;
        archer.nock = archer.mods.nock;
        archer.drawMove = archer.mods.drawMove;
    }

    /** Masons on the wall each strengthen the shared gate. */
    private refreshGateMax(): void {
        const bonus = this.archerList().reduce((sum, archer) => sum + archer.mods.gateBonus, 0);
        this.gateMax = GATE.health + bonus;
        if (this.phase === 'lobby') this.gate = this.gateMax;
        else this.gate = Math.min(this.gateMax, this.gate);
    }

    /** The sturdiest gate wright on the wall sets how much of each blow lands. */
    private gateTaken(): number {
        const archers = this.archerList();
        return archers.length === 0 ? 1 : Math.min(...archers.map(archer => archer.mods.gateTaken));
    }

    private damageGate(amount: number): void {
        this.gate = Math.max(0, this.gate - amount * this.gateTaken());
        this.struck = true;
    }

    private looseProfile(archer: Archer, draw: number): ShotProfile {
        const mods = archer.mods;
        return {
            damage: arrowDamage(draw) * mods.damage,
            speed: arrowSpeed(draw) * mods.arrowSpeed,
            pierce: this.random() < mods.pierceChance ? 1 : 0,
            ignoreShield: this.random() < mods.shieldBreak,
            explode: 0,
            burn: mods.burn,
            slow: mods.slow,
            chain: 0,
            knockback: mods.knockback,
            aura: 0,
            vs: mods.vs,
            critChance: mods.critChance,
            critMul: mods.critMul,
        };
    }

    private spellShot(archer: Archer, damage: number, speed: number, extra: Partial<ShotProfile> = {}): ShotProfile {
        const mods = archer.mods;
        return {
            damage: damage * mods.damage,
            speed: speed * mods.arrowSpeed,
            pierce: extra.pierce ?? 0,
            ignoreShield: extra.ignoreShield ?? false,
            explode: extra.explode ?? 0,
            burn: extra.burn ?? 0,
            slow: extra.slow ?? 0,
            chain: extra.chain ?? 0,
            knockback: extra.knockback ?? 0,
            aura: extra.aura ?? 0,
            vs: extra.vs ?? mods.vs,
            critChance: mods.critChance,
            critMul: mods.critMul,
        };
    }

    /** Looses an arrow from the archer's eye. `yawOffset` fans it sideways, in radians. */
    private fire(archer: Archer, profile: ShotProfile, yawOffset: number, seq: number): void {
        let direction = aimDirection(archer.yaw, archer.pitch);
        if (yawOffset !== 0) direction = turnAboutY(direction, yawOffset);
        const eye = eyePosition(archer.x, archer.z, archer.yaw, archer.pitch);
        const shot: ShotProfile = { ...profile };
        if (archer.brand > 0) shot.burn += SPELL.brand.burn;
        this.launch(archer.id, seq, shot, {
            x: eye.x + direction.x * ARROW.spawnOffset,
            y: eye.y + direction.y * ARROW.spawnOffset,
            z: eye.z + direction.z * ARROW.spawnOffset,
        }, { x: direction.x * shot.speed, y: direction.y * shot.speed, z: direction.z * shot.speed });
    }

    private launch(owner: string, seq: number, profile: ShotProfile, position: Point3, velocity: Point3): void {
        const id = String(this.nextId++);
        const arrow: Arrow = {
            id, owner, seq,
            x: position.x, y: position.y, z: position.z,
            vx: velocity.x, vy: velocity.y, vz: velocity.z,
            stuck: false, enemy: '',
            profile, age: 0, ignore: new Set(),
        };
        this.arrows.set(id, arrow);
    }

    private castSpell(archer: Archer, id: SpellId): void {
        switch (id) {
            case 'volley': {
                const shot = this.spellShot(archer, SPELL.volley.damage, SPELL.volley.speed);
                const span = SPELL.volley.shots - 1;
                for (let index = 0; index < SPELL.volley.shots; index++) {
                    this.fire(archer, shot, (index - span / 2) * (SPELL.volley.spread / span), 0);
                }
                break;
            }
            case 'bolt':
                this.fire(archer, this.spellShot(archer, SPELL.bolt.damage, SPELL.bolt.speed, { pierce: SPELL.bolt.pierce, ignoreShield: true }), 0, 0);
                break;
            case 'blast':
                this.fire(archer, this.spellShot(archer, SPELL.blast.damage, SPELL.blast.speed, {
                    explode: SPELL.blast.radius, ignoreShield: true, knockback: 1.4,
                }), 0, 0);
                break;
            case 'rain':
                this.rain(archer);
                break;
            case 'repel':
                this.repel();
                break;
            case 'mend':
                this.gate = Math.min(this.gateMax, this.gate + SPELL.mend.heal);
                break;
            case 'brand':
                archer.brand = SPELL.brand.duration;
                break;
            case 'frost':
                this.fire(archer, this.spellShot(archer, SPELL.frost.damage, SPELL.frost.speed, { slow: SPELL.frost.slow, aura: SPELL.frost.aura }), 0, 0);
                break;
            case 'spark':
                this.fire(archer, this.spellShot(archer, SPELL.spark.damage, SPELL.spark.speed, { chain: SPELL.spark.jumps, ignoreShield: true }), 0, 0);
                break;
            case 'snipe':
                this.fire(archer, this.spellShot(archer, SPELL.snipe.damage, SPELL.snipe.speed, {
                    vs: { ...archer.mods.vs, caster: archer.mods.vs.caster * SPELL.snipe.casterBonus },
                }), 0, 0);
                break;
            case 'barrage':
                archer.barrage = SPELL.barrage.duration;
                break;
            case 'oil': {
                const aim = this.aimOnBridge(archer);
                const id = String(this.nextId++);
                const oil: Oil = { id, x: aim.x, z: aim.z, left: SPELL.oil.duration };
                this.oils.set(id, oil);
                break;
            }
            default:
                break;
        }
    }

    private rain(archer: Archer): void {
        const aim = this.aimOnBridge(archer);
        for (let index = 0; index < SPELL.rain.arrows; index++) {
            const shot = this.spellShot(archer, SPELL.rain.damage, 16);
            this.launch(archer.id, 0, shot, {
                x: clamp(aim.x + (this.random() - 0.5) * 6, -LAYOUT.bridgeHalfWidth + 0.3, LAYOUT.bridgeHalfWidth - 0.3),
                y: 7.5 + this.random() * 2,
                z: aim.z + (this.random() - 0.5) * 7,
            }, { x: (this.random() - 0.5) * 1.5, y: -10, z: (this.random() - 0.5) * 1.5 });
        }
    }

    private repel(): void {
        const limit = ENEMY_MOTION.gateStrikeZ - SPELL.repel.range;
        for (const enemy of this.enemies.values() as Iterable<Enemy>) {
            if (enemy.mode === 'dying' || enemy.z < limit) continue;
            enemy.z = Math.max(ENEMY_MOTION.spawnZ + 1, enemy.z - SPELL.repel.distance);
            enemy.stun = SPELL.repel.stun;
            enemy.mode = 'stunned';
        }
        this.puff(0, 1.2, ENEMY_MOTION.gateStrikeZ - 1, 0xf4e2b0, 1.4);
    }

    private aimOnBridge(archer: Archer): Point3 {
        const direction = aimDirection(archer.yaw, archer.pitch);
        const eye = eyePosition(archer.x, archer.z, archer.yaw, archer.pitch);
        if (direction.y > -0.08) return { x: 0, y: 0.1, z: -12 };
        const distance = (0.15 - eye.y) / direction.y;
        return {
            x: clamp(eye.x + direction.x * distance, -LAYOUT.bridgeHalfWidth + 0.4, LAYOUT.bridgeHalfWidth - 0.4),
            y: 0.1,
            z: clamp(eye.z + direction.z * distance, LAYOUT.wallFrontZ - LAYOUT.bridgeLength + 2, -1.6),
        };
    }

    private spawnEnemy(kind: EnemyKind): void {
        let x = (this.random() * 2 - 1) * ENEMY_MOTION.spawnHalfWidth;
        if (kind.standoff > 0) {
            this.casterSide = -this.casterSide;
            x = this.casterSide * (LAYOUT.bridgeHalfWidth - 1.05);
        }
        const z = ENEMY_MOTION.spawnZ;
        const halfHeight = Math.max(0.05, kind.height / 2 - kind.radius);
        const body = this.physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(x, kind.height / 2, z));
        const collider = this.physics.createCollider(RAPIER.ColliderDesc.capsule(halfHeight, kind.radius), body);
        const jitter = 1 + (this.random() * 2 - 1) * ENEMY_MOTION.speedJitter;
        const id = String(this.nextId++);
        const enemy: Enemy = {
            id, kind: kind.id, x, z, facing: 0, mode: 'walking',
            health: kind.health, maxHealth: kind.health, pace: 0, charge: 0,
            spec: kind, body, collider, laneX: x,
            speed: kind.speed * jitter,
            clock: this.random() * 10, deathTime: 0,
            castTimer: kind.castInterval, burn: 0, burnDps: 0, slow: 0, slowMul: 1, stun: 0,
        };
        this.enemies.set(id, enemy);
        this.enemyByCollider.set(collider.handle, enemy);
    }

    private moveEnemies(dt: number): void {
        const limitX = LAYOUT.bridgeHalfWidth - 0.2;
        const doorX = LAYOUT.gateHalfWidth - 0.3;
        const all = [...this.enemies.values()] as Enemy[];
        for (const enemy of all) {
            enemy.clock += dt;
            if (enemy.burn > 0) {
                enemy.burn -= dt;
                if (this.wound(enemy, enemy.burnDps * dt, false)) continue;
            }
            if (enemy.mode === 'dying') {
                enemy.deathTime += dt;
                if (enemy.deathTime >= ENEMY_MOTION.deathDuration) this.removeEnemy(enemy);
                continue;
            }
            enemy.charge = 0;
            if (enemy.stun > 0) {
                enemy.stun -= dt;
                enemy.mode = enemy.stun > 0 ? 'stunned' : 'walking';
                enemy.pace = 0.2;
                enemy.body.setNextKinematicTranslation({ x: enemy.x, y: enemy.spec.height / 2, z: enemy.z });
                continue;
            }
            if (enemy.mode === 'striking') {
                this.damageGate(enemy.spec.gateDamagePerSecond * dt);
                continue;
            }
            if (enemy.mode === 'casting') {
                enemy.charge = clamp(1 - enemy.castTimer / Math.max(0.3, enemy.spec.castInterval), 0, 1);
                enemy.castTimer -= dt;
                if (enemy.castTimer <= 0) {
                    this.launchBolt(enemy);
                    enemy.castTimer = enemy.spec.castInterval;
                }
                enemy.body.setNextKinematicTranslation({ x: enemy.x, y: enemy.spec.height / 2, z: enemy.z });
                continue;
            }

            const goalZ = enemy.spec.standoff > 0
                ? ENEMY_MOTION.gateStrikeZ - enemy.spec.standoff
                : ENEMY_MOTION.gateStrikeZ;
            const toGoal = goalZ - enemy.z;
            const funnel = enemy.spec.standoff > 0 ? 0 : clamp(1 - toGoal / ENEMY_MOTION.funnelDistance, 0, 1);
            let desiredX = enemy.laneX + (clamp(enemy.laneX, -doorX, doorX) - enemy.laneX) * funnel;
            if (enemy.kind === 'runner') desiredX += Math.sin(enemy.clock * 4.2 + enemy.laneX * 3) * 0.55;
            let steerX = (desiredX - enemy.x) * 1.2;
            let advance = 1;
            for (const other of all) {
                if (other === enemy || other.mode === 'dying') continue;
                const dx = enemy.x - other.x;
                const dz = enemy.z - other.z;
                const distance = Math.hypot(dx, dz);
                const reach = enemy.spec.radius + other.spec.radius + 0.2;
                if (distance < reach) {
                    const push = (1 - distance / reach) * ENEMY_MOTION.separationStrength;
                    steerX += distance > 0.001 ? (dx / distance) * push : (this.random() - 0.5) * push;
                }
                const ahead = other.z - enemy.z;
                if (ahead > 0 && ahead < reach && Math.abs(dx) < reach * 0.65) {
                    advance = Math.min(advance, clamp((ahead - reach * 0.45) / (reach * 0.4), 0, 1));
                }
            }
            let pace = enemy.speed;
            if (enemy.slow > 0) {
                enemy.slow = Math.max(0, enemy.slow - dt);
                pace *= enemy.slowMul;
            }
            for (const oil of this.oils.values()) {
                if (Math.abs(enemy.z - oil.z) < SPELL.oil.reach && Math.abs(enemy.x - oil.x) < 3.3) {
                    pace *= SPELL.oil.slow;
                    break;
                }
            }
            steerX = clamp(steerX, -pace, pace);
            enemy.x = clamp(enemy.x + steerX * dt, -limitX, limitX);
            enemy.z = Math.min(goalZ, enemy.z + pace * advance * dt);
            if (enemy.z >= goalZ - 0.001) {
                enemy.z = goalZ;
                enemy.mode = enemy.spec.standoff > 0 ? 'casting' : 'striking';
                enemy.castTimer = enemy.spec.castInterval * 0.55;
            }
            enemy.facing = Math.atan2(steerX, Math.max(0.2, pace * advance)) * 0.6;
            enemy.pace = pace * Math.max(0.3, advance);
            enemy.body.setNextKinematicTranslation({ x: enemy.x, y: enemy.spec.height / 2, z: enemy.z });
        }
    }

    private launchBolt(enemy: Enemy): void {
        const from = { x: enemy.x, y: 1.2, z: enemy.z + 0.3 };
        const to = { x: 0, y: 1.35, z: ENEMY_MOTION.gateStrikeZ + 0.15 };
        const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) || 1;
        const id = String(this.nextId++);
        const bolt: Bolt = {
            id, ...from,
            vx: (to.x - from.x) / length * 8.4, vy: (to.y - from.y) / length * 8.4, vz: (to.z - from.z) / length * 8.4,
            damage: enemy.spec.castDamage,
        };
        this.bolts.set(id, bolt);
    }

    private moveBolts(dt: number): void {
        for (const [id, bolt] of this.bolts as Map<string, Bolt>) {
            bolt.x += bolt.vx * dt;
            bolt.y += bolt.vy * dt;
            bolt.z += bolt.vz * dt;
            const near = Math.hypot(bolt.x, bolt.y - 1.35, bolt.z - ENEMY_MOTION.gateStrikeZ) < 0.75;
            if (near || bolt.z > ENEMY_MOTION.gateStrikeZ) {
                this.damageGate(bolt.damage);
                this.puff(bolt.x, bolt.y, bolt.z, 0xff8a3a, 0.45);
                this.bolts.delete(id);
            }
        }
    }

    private moveArrows(dt: number): void {
        for (const [id, arrow] of this.arrows as Map<string, Arrow>) {
            if (arrow.stuck) {
                arrow.age += dt;
                if (arrow.age > ARROW.stuckLifetime) this.arrows.delete(id);
                continue;
            }
            if (!this.advanceArrow(arrow, dt)) this.arrows.delete(id);
        }
    }

    /** Returns false when the arrow should vanish: expired or fallen into the moat. */
    private advanceArrow(arrow: Arrow, dt: number): boolean {
        arrow.age += dt;
        const speed = Math.hypot(arrow.vx, arrow.vy, arrow.vz);
        const drag = 1 - ARROW.drag * speed * dt;
        arrow.vx *= drag;
        arrow.vy = arrow.vy * drag - ARROW.gravity * dt;
        arrow.vz *= drag;
        const start = { x: arrow.x, y: arrow.y, z: arrow.z };
        const next = { x: start.x + arrow.vx * dt, y: start.y + arrow.vy * dt, z: start.z + arrow.vz * dt };
        const distance = Math.hypot(next.x - start.x, next.y - start.y, next.z - start.z);
        const direction = distance > 0
            ? { x: (next.x - start.x) / distance, y: (next.y - start.y) / distance, z: (next.z - start.z) / distance }
            : { x: 0, y: -1, z: 0 };
        this.clipBolts(start, next);

        let traveled = 0;
        let guard = 0;
        while (distance > 0 && traveled < distance - 0.0001 && guard++ < 6) {
            const origin = {
                x: start.x + direction.x * traveled, y: start.y + direction.y * traveled, z: start.z + direction.z * traveled,
            };
            const hit = this.physics.castRay(
                new RAPIER.Ray(origin, direction),
                distance - traveled,
                true,
                undefined,
                undefined,
                undefined,
                undefined,
                collider => !arrow.ignore.has(collider.handle),
            );
            if (!hit) break;
            const impact = traveled + hit.timeOfImpact;
            const point = {
                x: start.x + direction.x * (impact + 0.08),
                y: start.y + direction.y * (impact + 0.08),
                z: start.z + direction.z * (impact + 0.08),
            };
            arrow.x = point.x; arrow.y = point.y; arrow.z = point.z;
            const enemy = this.enemyByCollider.get(hit.collider.handle);
            if (!enemy) {
                this.burstAt(arrow, point, null);
                this.embed(arrow, direction, null);
                this.fx.push({ t: 'stick' });
                return true;
            }
            const blocked = enemy.spec.shield && !arrow.profile.ignoreShield
                && shieldBlocks(arrow.vx, arrow.vy, arrow.vz, Math.sin(enemy.facing), Math.cos(enemy.facing));
            if (blocked) {
                this.fx.push({ t: 'block', enemy: enemy.id });
                this.burstAt(arrow, point, null);
                this.embed(arrow, direction, enemy);
                return true;
            }
            this.hurt(enemy, arrow.profile.damage, arrow.profile);
            this.burstAt(arrow, point, enemy);
            if (arrow.profile.pierce > 0) {
                arrow.profile.pierce -= 1;
                arrow.ignore.add(hit.collider.handle);
                traveled = impact + 0.4;
                continue;
            }
            this.embed(arrow, direction, enemy);
            return true;
        }

        arrow.x = next.x; arrow.y = next.y; arrow.z = next.z;
        return !(next.y < LAYOUT.waterY || arrow.age > ARROW.lifetime);
    }

    /** Leaves the arrow where it hit. In a foe, its place is kept in the foe's frame so it rides along. */
    private embed(arrow: Arrow, direction: Point3, enemy: Enemy | null): void {
        arrow.stuck = true;
        arrow.age = 0;
        arrow.vx = direction.x; arrow.vy = direction.y; arrow.vz = direction.z;
        if (!enemy) return;
        const cos = Math.cos(enemy.facing);
        const sin = Math.sin(enemy.facing);
        const dx = arrow.x - enemy.x;
        const dz = arrow.z - enemy.z;
        arrow.enemy = enemy.id;
        arrow.x = dx * cos - dz * sin;
        arrow.z = dx * sin + dz * cos;
        const vx = direction.x * cos - direction.z * sin;
        const vz = direction.x * sin + direction.z * cos;
        arrow.vx = vx; arrow.vz = vz;
    }

    private burstAt(arrow: Arrow, point: Point3, primary: Enemy | null): void {
        const profile = arrow.profile;
        if (profile.explode > 0) {
            this.puff(point.x, point.y, point.z, 0xff8a3a, profile.explode * 0.45);
            for (const enemy of this.enemies.values() as Iterable<Enemy>) {
                if (enemy === primary || enemy.mode === 'dying') continue;
                if (Math.hypot(enemy.x - point.x, enemy.z - point.z) > profile.explode + enemy.spec.radius) continue;
                this.hurt(enemy, profile.damage * 0.6, { ...profile, explode: 0, pierce: 0, chain: 0 });
            }
        }
        if (profile.aura > 0) {
            this.puff(point.x, 0.4, point.z, 0xb7e6ff, profile.aura * 0.4);
            for (const enemy of this.enemies.values() as Iterable<Enemy>) {
                if (enemy.mode === 'dying') continue;
                if (Math.hypot(enemy.x - point.x, enemy.z - point.z) > profile.aura + enemy.spec.radius) continue;
                enemy.slow = Math.max(enemy.slow, 2.6);
                enemy.slowMul = profile.slow;
            }
        }
        if (profile.chain > 0 && primary) this.chainFrom(primary, profile);
    }

    private chainFrom(first: Enemy, profile: ShotProfile): void {
        const hit = new Set<Enemy>([first]);
        let current = first;
        let power = profile.damage * 0.72;
        for (let jump = 0; jump < profile.chain; jump++) {
            const next = this.nearest(current, SPELL.spark.range, hit);
            if (!next) break;
            this.fx.push({ t: 'spark', ax: current.x, az: current.z, bx: next.x, bz: next.z });
            this.hurt(next, power, { ...profile, chain: 0, explode: 0 });
            hit.add(next);
            current = next;
            power *= 0.72;
        }
    }

    private nearest(from: Enemy, range: number, skip: Set<Enemy>): Enemy | null {
        let best: Enemy | null = null;
        let bestDistance = range;
        for (const enemy of this.enemies.values() as Iterable<Enemy>) {
            if (skip.has(enemy) || enemy.mode === 'dying') continue;
            const distance = Math.hypot(enemy.x - from.x, enemy.z - from.z);
            if (distance < bestDistance) {
                best = enemy;
                bestDistance = distance;
            }
        }
        return best;
    }

    private hurt(enemy: Enemy, amount: number, profile: ShotProfile): void {
        if (enemy.mode === 'dying') return;
        const rolled = rolledDamage({ ...profile, damage: amount }, enemy.kind, this.random());
        if (profile.burn > 0) {
            enemy.burn = Math.max(enemy.burn, 3.2);
            enemy.burnDps = Math.max(enemy.burnDps, profile.burn);
        }
        if (profile.slow > 0) {
            enemy.slow = Math.max(enemy.slow, 2.4);
            enemy.slowMul = profile.slow;
        }
        if (profile.knockback > 0) {
            const shove = profile.knockback * (enemy.kind === 'brute' ? 0.35 : 1);
            enemy.z = Math.max(ENEMY_MOTION.spawnZ + 1, enemy.z - shove);
            if (enemy.mode === 'striking') enemy.mode = 'walking';
        }
        this.wound(enemy, rolled.damage);
    }

    /** Returns true when this blow drops the foe. Every archer learns from every kill. */
    private wound(enemy: Enemy, amount: number, flash = true): boolean {
        if (enemy.mode === 'dying') return false;
        enemy.health -= amount;
        if (flash) this.fx.push({ t: 'hit', enemy: enemy.id });
        if (enemy.health > 0) return false;
        enemy.health = 0;
        enemy.mode = 'dying';
        enemy.deathTime = 0;
        enemy.charge = 0;
        this.fx.push({ t: 'kill', enemy: enemy.id });
        this.enemyByCollider.delete(enemy.collider.handle);
        this.physics.removeRigidBody(enemy.body);
        for (const archer of this.archerList()) this.grant(archer, enemy.spec.xp * archer.mods.xpGain);
        return true;
    }

    private grant(archer: Archer, amount: number): void {
        const granted = grantXp(archer.xp, archer.level, amount);
        archer.xp = granted.xp;
        archer.level = granted.level;
        if (granted.gainedLevels <= 0) return;
        archer.pending += granted.gainedLevels;
        this.fx.push({ t: 'level', owner: archer.id });
    }

    private clipBolts(from: Point3, to: Point3): void {
        for (const [id, bolt] of this.bolts) {
            if (!segmentNear(from, to, bolt, 0.48)) continue;
            this.puff(bolt.x, bolt.y, bolt.z, 0xffe7a8, 0.35);
            this.bolts.delete(id);
            this.fx.push({ t: 'hit', enemy: '' });
        }
    }

    private puff(x: number, y: number, z: number, color: number, r: number): void {
        this.fx.push({ t: 'puff', x, y, z, color, r });
    }

    private removeEnemy(enemy: Enemy): void {
        this.enemies.delete(enemy.id);
        for (const [id, arrow] of this.arrows) if (arrow.enemy === enemy.id) this.arrows.delete(id);
        if (enemy.mode !== 'dying') {
            this.enemyByCollider.delete(enemy.collider.handle);
            this.physics.removeRigidBody(enemy.body);
        }
    }
}

function finitePose(pose: Pose): boolean {
    return [pose.x, pose.z, pose.yaw, pose.pitch, pose.draw].every(Number.isFinite);
}


function segmentNear(from: Point3, to: Point3, point: Point3, radius: number): boolean {
    const abx = to.x - from.x;
    const aby = to.y - from.y;
    const abz = to.z - from.z;
    const lengthSq = abx * abx + aby * aby + abz * abz;
    const t = lengthSq > 0
        ? Math.max(0, Math.min(1, ((point.x - from.x) * abx + (point.y - from.y) * aby + (point.z - from.z) * abz) / lengthSq))
        : 0;
    const dx = from.x + abx * t - point.x;
    const dy = from.y + aby * t - point.y;
    const dz = from.z + abz * t - point.z;
    return dx * dx + dy * dy + dz * dz <= radius * radius;
}
