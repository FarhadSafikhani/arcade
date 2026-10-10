import RAPIER from '@dimforge/rapier3d-compat';
import { buildCastleColliders } from './castle';
import {
    aimDirection, arrowDamage, arrowSpeed, canStand, clamp, drawFraction, eyePosition, grantXp, killXp, pointsAt,
    scaleEnemy, shieldBlocks, spawnList, waveSpec, xpToAdvance, type Point3, type WaveSpec,
} from './rules';
import {
    ArrowKind, kitOf, learnBlock, rankOf, shotFromKit, SKILL_DEFS, skillCooldown, spentPoints,
    type Kit, type Ranks, type ShotProfile, type SkillId,
} from './skills';
import { ARROW, BOW, ENEMIES, ENEMY_MOTION, GATE, GOBLIN, LAYOUT, NET, PLAYER, SKILLS, WAVES, type EnemyId, type EnemyKind } from './tuning';

/**
 * The whole Defender run with nothing drawn: waves, foes, arrows, skills, the gate,
 * and every archer on the wall. The co-op server runs one per room; solo play runs
 * one in the page. Renderers read the public fields, which match the network schema.
 */

export type Phase = 'lobby' | 'playing' | 'break' | 'over';
export type EnemyMode = 'walking' | 'striking' | 'casting' | 'stunned' | 'frozen' | 'dying';

/** Bits in `SimEnemy.status`, so a foe can show what ails it. */
export const STATUS = { bleeding: 1, chilled: 2, frozen: 4, marked: 8 } as const;

/** Something worth a flash, a puff, or a sound. Sent to clients alongside the state. */
export type FxEvent =
    | { t: 'hit'; enemy: string }
    | { t: 'kill'; enemy: string }
    | { t: 'block'; enemy: string }
    | { t: 'freeze'; enemy: string }
    | { t: 'stick' }
    | { t: 'puff'; x: number; y: number; z: number; color: number; r: number }
    | { t: 'spark'; ax: number; az: number; bx: number; bz: number }
    | { t: 'gate' }
    | { t: 'loose'; owner: string; draw: number }
    | { t: 'spell'; owner: string; skill: SkillId }
    | { t: 'wave'; wave: number; fresh: EnemyId | '' }
    | { t: 'level'; level: number }
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
    /** `STATUS` bits. */
    status: number;
}

export interface SimArrow {
    id: string;
    owner: string;
    /** The owner's shot number, so the shooter can match it to the arrow they already drew. 0 for skills. */
    seq: number;
    /** `ArrowKind`: how the arrow looks. */
    kind: number;
    x: number; y: number; z: number;
    /** Velocity in flight. Once stuck, the unit direction it points. */
    vx: number; vy: number; vz: number;
    stuck: boolean;
    /** Foe the arrow rides in. Its position and direction are then in that foe's frame. */
    enemy: string;
}

export interface SimBolt { id: string; x: number; y: number; z: number; vx: number; vy: number; vz: number; }
/** A Tar Pit on the bridge. */
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
    /** Unspent skill points. */
    points: number;
    /** Rank of every learned skill. */
    ranks: Map<string, number>;
    /** Learned actives in the order they were learned; slot N is key N on the bar. */
    actives: string[];
    /** Seconds left on each active, aligned with `actives`. */
    cooldowns: number[];
    cooldownMax: number[];
    /** Running buffs, with seconds left and their full length, aligned. */
    buffs: string[];
    buffLeft: number[];
    buffMax: number[];
    /** Draw time and nock delay multipliers, every attack-speed bonus included. */
    drawTime: number;
    nock: number;
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
    bleed: number;
    bleedDps: number;
    marked: number;
    markBonus: number;
    chill: number;
    chillMul: number;
    frostbite: number;
    frozen: number;
    frostHits: number;
    frostSince: number;
    stun: number;
}

interface Arrow extends SimArrow {
    profile: ShotProfile;
    age: number;
    ignore: Set<number>;
}

interface Bolt extends SimBolt { damage: number; }
interface Oil extends SimOil { left: number; slow: number; }

interface Archer extends SimPlayer {
    skills: Ranks;
    kit: Kit;
    timers: Partial<Record<SkillId, number>>;
    lastShot: number;
    lastPose: number;
}

const BUFFS: SkillId[] = ['rapid', 'mark'];

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
    /** The team's shared level and experience toward the next one. */
    level = 1;
    xp = 0;
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

    /** Joins an archer. Late joiners get every point the team's level has earned. */
    addPlayer(id: string, name: string): SimPlayer {
        const taken = new Set([...this.players.values()].map(player => player.slot));
        let slot = 0;
        while (taken.has(slot)) slot++;
        const spread = [0, -2.6, 2.6, -5.2][slot] ?? 0;
        const archer: Archer = {
            id, name, slot,
            x: spread, z: PLAYER.walk.z.min + 0.3, yaw: 0, pitch: -0.22, draw: 0,
            points: 0, ranks: new Map(), actives: [], cooldowns: [], cooldownMax: [],
            buffs: [], buffLeft: [], buffMax: [], drawTime: 1, nock: 1,
            skills: {}, kit: kitOf({}), timers: {}, lastShot: -10, lastPose: this.time,
        };
        this.players.set(id, archer);
        this.refreshArcher(archer);
        return archer;
    }

    removePlayer(id: string): void {
        this.players.delete(id);
        if (this.players.size === 0 && this.phase !== 'lobby') this.toLobby();
    }

    /** Begins a fresh run. Archers keep their places and forget their skills. */
    start(): void {
        this.clearField();
        this.level = 1;
        this.xp = 0;
        this.gate = this.gateMax;
        for (const archer of this.archerList()) {
            archer.skills = {};
            archer.actives = [];
            archer.cooldowns = [];
            archer.timers = {};
            archer.lastShot = -10;
            this.refreshArcher(archer);
        }
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
        const reach = PLAYER.walkSpeed * elapsed * NET.moveTolerance + NET.moveSlack;
        const moved = Math.hypot(pose.x - archer.x, pose.z - archer.z);
        if (trusted || (moved <= reach && canStand(pose.x, pose.z))) {
            archer.x = pose.x;
            archer.z = pose.z;
        }
    }

    /** Looses an arrow for an archer. Returns false when the bow was not ready. */
    loose(id: string, shot: Loose): boolean {
        const archer = this.archer(id);
        if (!archer || !this.active || !finitePose(shot)) return false;
        const nock = BOW.nockDelay * archer.nock;
        const since = this.time - archer.lastShot;
        if (since < nock - NET.shotSlack) return false;
        const maxDraw = drawFraction(since - nock + NET.shotSlack, BOW.drawTime * archer.drawTime);
        const draw = clamp(Math.min(shot.draw, maxDraw), 0, 1);
        archer.lastShot = this.time;
        archer.yaw = shot.yaw;
        archer.pitch = clamp(shot.pitch, -PLAYER.pitchLimit, PLAYER.pitchLimit);
        if (Math.hypot(shot.x - archer.x, shot.z - archer.z) < NET.snapDistance && canStand(shot.x, shot.z)) {
            archer.x = shot.x;
            archer.z = shot.z;
        }
        const profile = shotFromKit(archer.kit, arrowDamage(draw), arrowSpeed(draw), draw);
        if ((archer.timers.mark ?? 0) > 0) {
            const rank = rankOf(archer.skills, 'mark');
            profile.mark = SKILLS.mark.bonus + SKILLS.mark.bonusPer * (rank - 1);
            profile.kind = ArrowKind.Mark;
        }
        this.fire(archer, profile, Math.max(0, Math.floor(shot.seq)));
        this.fx.push({ t: 'loose', owner: id, draw });
        return true;
    }

    /** Puts one of an archer's points into a skill, if the tree allows it. */
    learn(id: string, skill: string): boolean {
        const archer = this.archer(id);
        if (!archer || !(skill in SKILL_DEFS)) return false;
        const skillId = skill as SkillId;
        if (learnBlock(archer.skills, skillId, this.level, archer.points) !== null) return false;
        archer.skills[skillId] = rankOf(archer.skills, skillId) + 1;
        if (SKILL_DEFS[skillId].kind === 'active' && !archer.actives.includes(skillId)) {
            archer.actives.push(skillId);
            archer.cooldowns.push(0);
        }
        this.refreshArcher(archer);
        return true;
    }

    cast(id: string, slot: number, yaw: number, pitch: number): boolean {
        const archer = this.archer(id);
        if (!archer || this.phase !== 'playing') return false;
        if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return false;
        const skill = archer.actives[slot] as SkillId | undefined;
        if (!skill || archer.cooldowns[slot] > 0) return false;
        archer.yaw = yaw;
        archer.pitch = clamp(pitch, -PLAYER.pitchLimit, PLAYER.pitchLimit);
        this.castSkill(archer, skill, rankOf(archer.skills, skill));
        archer.cooldowns[slot] = skillCooldown(skill, rankOf(archer.skills, skill));
        this.refreshArcher(archer);
        this.fx.push({ t: 'spell', owner: id, skill });
        return true;
    }

    step(dt: number): void {
        if (!this.active) return;
        this.time += dt;
        for (const archer of this.archerList()) {
            let changed = false;
            for (const skill of BUFFS) {
                const left = archer.timers[skill] ?? 0;
                if (left <= 0) continue;
                archer.timers[skill] = Math.max(0, left - dt);
                changed = true;
            }
            for (let index = 0; index < archer.cooldowns.length; index++) {
                archer.cooldowns[index] = Math.max(0, archer.cooldowns[index] - dt);
            }
            if (changed) this.refreshArcher(archer);
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
        }
        if (this.phase === 'break') {
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

    /** Recomputes everything derived from an archer's skills and running buffs. */
    private refreshArcher(archer: Archer): void {
        archer.kit = kitOf(archer.skills);
        archer.points = Math.max(0, pointsAt(this.level) - spentPoints(archer.skills));
        archer.ranks = new Map(Object.entries(archer.skills));
        archer.cooldownMax = archer.actives.map(skill => skillCooldown(skill as SkillId, rankOf(archer.skills, skill as SkillId)));
        const rapid = (archer.timers.rapid ?? 0) > 0 ? SKILLS.rapid.attackSpeed[rankOf(archer.skills, 'rapid') - 1] ?? 0 : 0;
        const speed = 1 + archer.kit.attackSpeed + rapid;
        archer.drawTime = 1 / speed;
        archer.nock = 1 / speed;
        archer.buffs = BUFFS.filter(skill => (archer.timers[skill] ?? 0) > 0);
        archer.buffLeft = archer.buffs.map(skill => archer.timers[skill as SkillId] ?? 0);
        archer.buffMax = archer.buffs.map(skill => this.buffLength(skill as SkillId, rankOf(archer.skills, skill as SkillId)));
    }

    private buffLength(skill: SkillId, rank: number): number {
        if (skill === 'rapid') return SKILLS.rapid.duration;
        if (skill === 'mark') return SKILLS.mark.duration + SKILLS.mark.durationPer * (rank - 1);
        return 0;
    }

    private damageGate(amount: number): void {
        this.gate = Math.max(0, this.gate - amount);
        this.struck = true;
    }

    private skillShot(archer: Archer, damage: number, speed: number, extra: Partial<ShotProfile>): ShotProfile {
        return { ...shotFromKit(archer.kit, damage, speed, 1), knockback: 0, ...extra };
    }

    /** Looses an arrow from the archer's eye along their aim. */
    private fire(archer: Archer, profile: ShotProfile, seq: number): void {
        const direction = aimDirection(archer.yaw, archer.pitch);
        const eye = eyePosition(archer.x, archer.z, archer.yaw, archer.pitch);
        this.launch(archer.id, seq, profile, {
            x: eye.x + direction.x * ARROW.spawnOffset,
            y: eye.y + direction.y * ARROW.spawnOffset,
            z: eye.z + direction.z * ARROW.spawnOffset,
        }, { x: direction.x * profile.speed, y: direction.y * profile.speed, z: direction.z * profile.speed });
    }

    private launch(owner: string, seq: number, profile: ShotProfile, position: Point3, velocity: Point3): void {
        const id = String(this.nextId++);
        const arrow: Arrow = {
            id, owner, seq, kind: profile.kind,
            x: position.x, y: position.y, z: position.z,
            vx: velocity.x, vy: velocity.y, vz: velocity.z,
            stuck: false, enemy: '',
            profile, age: 0, ignore: new Set(),
        };
        this.arrows.set(id, arrow);
    }

    private castSkill(archer: Archer, id: SkillId, rank: number): void {
        const r = Math.max(1, rank);
        switch (id) {
            case 'power':
                this.fire(archer, this.skillShot(archer, SKILLS.power.damage + SKILLS.power.damagePer * (r - 1), SKILLS.power.speed, {
                    pierce: 99, ignoreShield: true, kind: ArrowKind.Power,
                }), 0);
                break;
            case 'concuss':
                this.fire(archer, this.skillShot(archer, SKILLS.concuss.damage, SKILLS.concuss.speed, {
                    stun: SKILLS.concuss.stun + SKILLS.concuss.stunPer * (r - 1), stunRadius: SKILLS.concuss.radius,
                }), 0);
                break;
            case 'tar': {
                const aim = this.aimOnBridge(archer);
                const id = String(this.nextId++);
                const oil: Oil = {
                    id, x: aim.x, z: aim.z,
                    left: SKILLS.tar.duration + SKILLS.tar.durationPer * (r - 1),
                    slow: SKILLS.tar.slow + SKILLS.tar.slowPer * (r - 1),
                };
                this.oils.set(id, oil);
                break;
            }
            case 'shockwave':
                this.shockwave(SKILLS.shockwave.distance + SKILLS.shockwave.distancePer * (r - 1), SKILLS.shockwave.stun + SKILLS.shockwave.stunPer * (r - 1));
                break;
            case 'rapid':
            case 'mark':
                archer.timers[id] = this.buffLength(id, r);
                break;
            default:
                break;
        }
    }

    private shockwave(distance: number, stun: number): void {
        const limit = ENEMY_MOTION.gateStrikeZ - SKILLS.shockwave.range;
        for (const enemy of this.enemies.values() as Iterable<Enemy>) {
            if (enemy.mode === 'dying' || enemy.z < limit) continue;
            enemy.z = Math.max(ENEMY_MOTION.spawnZ + 1, enemy.z - distance);
            this.stunFor(enemy, stun);
        }
        this.puff(0, 1.2, ENEMY_MOTION.gateStrikeZ - 1, 0xf4e2b0, 1.4);
    }

    private stunFor(enemy: Enemy, seconds: number): void {
        enemy.stun = Math.max(enemy.stun, seconds);
        if (enemy.mode !== 'frozen') enemy.mode = 'stunned';
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
            health: kind.health, maxHealth: kind.health, pace: 0, charge: 0, status: 0,
            spec: kind, body, collider, laneX: x,
            speed: kind.speed * jitter,
            clock: this.random() * 10, deathTime: 0, castTimer: kind.castInterval,
            bleed: 0, bleedDps: 0, marked: 0, markBonus: 0, chill: 0, chillMul: 1, frostbite: 0, frozen: 0, frostHits: 0, frostSince: 0, stun: 0,
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
            if (enemy.bleed > 0) {
                enemy.bleed = Math.max(0, enemy.bleed - dt);
                if (this.wound(enemy, enemy.bleedDps * dt, false)) continue;
            }
            if (enemy.marked > 0) {
                enemy.marked = Math.max(0, enemy.marked - dt);
                if (enemy.marked === 0) enemy.markBonus = 0;
            }
            if (enemy.chill > 0) {
                enemy.chill = Math.max(0, enemy.chill - dt);
                if (enemy.chill === 0) {
                    enemy.chillMul = 1;
                    enemy.frostbite = 0;
                }
            }
            enemy.status = (enemy.bleed > 0 ? STATUS.bleeding : 0) | (enemy.chill > 0 ? STATUS.chilled : 0) | (enemy.frozen > 0 ? STATUS.frozen : 0) | (enemy.marked > 0 ? STATUS.marked : 0);
            if (enemy.mode === 'dying') {
                enemy.deathTime += dt;
                if (enemy.deathTime >= ENEMY_MOTION.deathDuration) this.removeEnemy(enemy);
                continue;
            }
            enemy.charge = 0;
            const hold = (): void => { enemy.body.setNextKinematicTranslation({ x: enemy.x, y: enemy.spec.height / 2, z: enemy.z }); };
            if (enemy.frozen > 0) {
                enemy.frozen = Math.max(0, enemy.frozen - dt);
                enemy.mode = enemy.frozen > 0 ? 'frozen' : enemy.stun > 0 ? 'stunned' : 'walking';
                enemy.pace = 0;
                hold();
                continue;
            }
            if (enemy.stun > 0) {
                enemy.stun -= dt;
                enemy.mode = enemy.stun > 0 ? 'stunned' : 'walking';
                enemy.pace = 0.2;
                hold();
                continue;
            }
            const chilled = enemy.chill > 0 ? enemy.chillMul : 1;
            if (enemy.mode === 'striking') {
                this.damageGate(enemy.spec.gateDamagePerSecond * chilled * dt);
                continue;
            }
            if (enemy.mode === 'casting') {
                enemy.charge = clamp(1 - enemy.castTimer / Math.max(0.3, enemy.spec.castInterval), 0, 1);
                enemy.castTimer -= dt * chilled;
                if (enemy.castTimer <= 0) {
                    this.launchBolt(enemy);
                    enemy.castTimer = enemy.spec.castInterval;
                }
                hold();
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
            let pace = enemy.speed * chilled;
            for (const oil of this.oils.values() as Iterable<Oil>) {
                if (Math.abs(enemy.z - oil.z) < SKILLS.tar.reach && Math.abs(enemy.x - oil.x) < SKILLS.tar.halfWidth) {
                    pace *= oil.slow;
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
            } else enemy.mode = 'walking';
            enemy.facing = Math.atan2(steerX, Math.max(0.2, pace * advance)) * 0.6;
            enemy.pace = pace * Math.max(0.3, advance);
            hold();
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
                this.embed(arrow, direction, null);
                this.fx.push({ t: 'stick' });
                return true;
            }
            const blocked = enemy.spec.shield && !arrow.profile.ignoreShield && enemy.mode !== 'frozen'
                && shieldBlocks(arrow.vx, arrow.vy, arrow.vz, Math.sin(enemy.facing), Math.cos(enemy.facing));
            if (blocked) {
                this.fx.push({ t: 'block', enemy: enemy.id });
                this.embed(arrow, direction, enemy);
                return true;
            }
            this.strike(enemy, arrow.profile);
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

    /** A direct hit: stun splash, the wound itself, then maybe a leap to the next foe. */
    private strike(enemy: Enemy, profile: ShotProfile): void {
        if (profile.stun > 0) {
            for (const other of this.enemies.values() as Iterable<Enemy>) {
                if (other.mode === 'dying') continue;
                if (other !== enemy && Math.hypot(other.x - enemy.x, other.z - enemy.z) > profile.stunRadius) continue;
                this.stunFor(other, profile.stun);
            }
            this.puff(enemy.x, 1, enemy.z, 0xf4e2b0, profile.stunRadius * 0.5);
        }
        this.hurt(enemy, profile.damage, profile);
        if (profile.ricochet > 0 && this.random() < profile.ricochet) {
            const next = this.nearest(enemy, SKILLS.ricochet.range, new Set([enemy]));
            if (next) {
                this.fx.push({ t: 'spark', ax: enemy.x, az: enemy.z, bx: next.x, bz: next.z });
                this.hurt(next, profile.damage * SKILLS.ricochet.damage, { ...profile, ricochet: 0, stun: 0, knockback: 0 });
            }
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
        let damage = amount;
        if (enemy.bleed > 0) damage *= 1 + profile.wound;
        if (enemy.chill > 0) damage *= 1 + enemy.frostbite;
        if (enemy.marked > 0) damage *= 1 + enemy.markBonus;
        // The mark lands after the blow that brings it, so it pays off from the next hit on.
        if (profile.mark > 0) {
            enemy.marked = SKILLS.mark.markTime;
            enemy.markBonus = Math.max(enemy.markBonus, profile.mark);
        }
        if (profile.bleedDps > 0) {
            enemy.bleed = Math.max(enemy.bleed, profile.bleedTime);
            enemy.bleedDps = Math.max(enemy.bleedDps, profile.bleedDps);
        }
        if (profile.chillSlow > 0) {
            enemy.chill = Math.max(enemy.chill, profile.chillTime);
            enemy.chillMul = Math.min(enemy.chillMul, 1 - profile.chillSlow);
            enemy.frostbite = Math.max(enemy.frostbite, profile.frostbite);
        }
        if (profile.winter > 0) this.frostHit(enemy, profile.winter);
        if (profile.knockback > 0) {
            const shove = profile.knockback * (enemy.kind === 'brute' ? 0.35 : 1);
            enemy.z = Math.max(ENEMY_MOTION.spawnZ + 1, enemy.z - shove);
            if (enemy.mode === 'striking' || enemy.mode === 'casting') enemy.mode = 'walking';
        }
        this.wound(enemy, damage);
    }

    /** Winter's Grip: enough frost arrows in a short window freeze a foe solid. */
    private frostHit(enemy: Enemy, rank: number): void {
        if (enemy.frozen > 0) return;
        if (this.time - enemy.frostSince > SKILLS.winter.window) {
            enemy.frostSince = this.time;
            enemy.frostHits = 0;
        }
        enemy.frostHits += 1;
        if (enemy.frostHits < SKILLS.winter.hits) return;
        enemy.frostHits = 0;
        enemy.frozen = SKILLS.winter.freeze[rank - 1] ?? SKILLS.winter.freeze[0];
        enemy.mode = 'frozen';
        this.fx.push({ t: 'freeze', enemy: enemy.id });
        this.puff(enemy.x, enemy.spec.height * 0.6, enemy.z, 0xcdefff, 0.9);
    }

    /** Returns true when this blow drops the foe. Every kill feeds the team's shared experience. */
    private wound(enemy: Enemy, amount: number, flash = true): boolean {
        if (enemy.mode === 'dying') return false;
        enemy.health -= amount;
        if (flash) this.fx.push({ t: 'hit', enemy: enemy.id });
        if (enemy.health > 0) return false;
        enemy.health = 0;
        enemy.mode = 'dying';
        enemy.deathTime = 0;
        enemy.charge = 0;
        enemy.status = 0;
        this.fx.push({ t: 'kill', enemy: enemy.id });
        this.enemyByCollider.delete(enemy.collider.handle);
        this.physics.removeRigidBody(enemy.body);
        this.grant(killXp(enemy.spec, this.archers));
        return true;
    }

    /** Dev cheat: raises the team by whole levels. Only a server started with DEFENDER_CHEATS=1 calls it. */
    grantLevels(levels: number): void {
        for (let index = 0; index < Math.min(20, Math.max(0, Math.floor(levels))); index++) this.grant(xpToAdvance(this.level) - this.xp);
    }

    private grant(amount: number): void {
        const granted = grantXp(this.xp, this.level, amount);
        this.xp = granted.xp;
        this.level = granted.level;
        if (granted.gainedLevels <= 0) return;
        for (const archer of this.archerList()) this.refreshArcher(archer);
        this.fx.push({ t: 'level', level: this.level });
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
        arrow.vx = direction.x * cos - direction.z * sin;
        arrow.vz = direction.x * sin + direction.z * cos;
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

function finitePose(pose: { x: number; z: number; yaw: number; pitch: number; draw: number }): boolean {
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
