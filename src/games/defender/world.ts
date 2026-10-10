import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CombatMods, emptyMods, rolledDamage, ShotProfile, SpellId } from './cards';
import { buildCastle, CastleScene } from './castle';
import { BowView, createArrowMesh } from './bow';
import { createRig, EnemyRig } from './goblin';
import { canLean, canStand, clamp, leanDistance, shieldBlocks } from './rules';
import { ARROW, ENEMY_MOTION, LAYOUT, PLAYER, SPELL } from './tuning';
import type { EnemyKind } from './tuning';

interface FlyingArrow {
    mesh: THREE.Group;
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    profile: ShotProfile;
    age: number;
    ignore: Set<number>;
}

interface StuckArrow {
    mesh: THREE.Group;
    age: number;
}

interface Bolt {
    mesh: THREE.Object3D;
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    damage: number;
}

interface Puff {
    mesh: THREE.Mesh;
    age: number;
}

interface Spark {
    line: THREE.Line;
    age: number;
}

type EnemyState = 'walking' | 'striking' | 'casting' | 'dying';

interface Enemy {
    rig: EnemyRig;
    kind: EnemyKind;
    body: RAPIER.RigidBody;
    collider: RAPIER.Collider;
    x: number;
    z: number;
    laneX: number;
    health: number;
    maxHealth: number;
    speed: number;
    gateDamagePerSecond: number;
    state: EnemyState;
    clock: number;
    deathTime: number;
    castTimer: number;
    burn: number;
    burnDps: number;
    slow: number;
    slowMul: number;
    stun: number;
}

export interface StepReport {
    hits: number;
    kills: number;
    sticks: number;
    blocks: number;
    /** Raw experience from kills this step, before Keen Eye. */
    xp: number;
    /** Flat gate damage from spells and caster bolts. */
    gateDamage: number;
    strikeRates: number[];
}

export interface MoveInput {
    forward: number;
    right: number;
}

export interface SpellResult {
    heal: number;
}

const ARROW_FORWARD = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
const puffGeometry = new THREE.SphereGeometry(1, 10, 8);
const boltGlowGeometry = new THREE.SphereGeometry(0.22, 10, 8);
const boltCoreGeometry = new THREE.SphereGeometry(0.1, 8, 6);
const boltGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xffb15a });
const boltCoreMaterial = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
const scratch = {
    direction: new THREE.Vector3(),
    next: new THREE.Vector3(),
    start: new THREE.Vector3(),
    origin: new THREE.Vector3(),
    point: new THREE.Vector3(),
    aim: new THREE.Vector3(),
    matrix: new THREE.Matrix4(),
};

/** Three.js scene plus a Rapier collision world for one Defender run. */
export class DefenderWorld {
    readonly canvas: HTMLCanvasElement;
    private readonly renderer: THREE.WebGLRenderer;
    private readonly scene = new THREE.Scene();
    private readonly camera: THREE.PerspectiveCamera;
    private readonly bowView: BowView;
    private readonly physics: RAPIER.World;
    private readonly castle: CastleScene;
    private readonly gateColor = new THREE.Color();
    private readonly gateFresh: THREE.Color;
    private readonly gateBroken = new THREE.Color(0x2a1a10);
    private readonly enemies: Enemy[] = [];
    private readonly enemyByCollider = new Map<number, Enemy>();
    private readonly flying: FlyingArrow[] = [];
    private readonly stuck: StuckArrow[] = [];
    private readonly bolts: Bolt[] = [];
    private readonly puffs: Puff[] = [];
    private readonly sparks: Spark[] = [];
    private readonly arrowPool: THREE.Group[] = [];
    private readonly feet = new THREE.Vector2(0, PLAYER.walk.z.min + 0.3);
    private readonly oilMesh: THREE.Mesh;
    private mods: CombatMods = emptyMods();
    private oil: { x: number; z: number; left: number } | null = null;
    private brand = 0;
    private barrage = 0;
    private casterSide = 1;
    private yaw = 0;
    private pitch = -0.22;
    private walkPhase = 0;
    private gateShake = 0;
    private time = 0;

    private constructor(container: HTMLElement) {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.NeutralToneMapping;
        this.renderer.toneMappingExposure = 1.12;
        this.renderer.autoClear = false;
        this.canvas = this.renderer.domElement;
        this.canvas.className = 'defender-canvas';
        container.prepend(this.canvas);

        this.camera = new THREE.PerspectiveCamera(PLAYER.fov, 1, 0.05, 420);
        this.camera.rotation.order = 'YXZ';
        this.bowView = new BowView(PLAYER.fov);
        this.physics = new RAPIER.World({ x: 0, y: 0, z: 0 });
        this.castle = buildCastle(this.scene, this.physics);
        this.gateFresh = this.castle.gateMaterial.color.clone();
        this.oilMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 22), new THREE.MeshBasicMaterial({
            color: 0x2a2218, transparent: true, opacity: 0.6, depthWrite: false,
        }));
        this.oilMesh.rotation.x = -Math.PI / 2;
        this.oilMesh.visible = false;
        this.scene.add(this.oilMesh);
        this.resize(container.clientWidth, container.clientHeight);
        this.placeCamera();
    }

    static async create(container: HTMLElement): Promise<DefenderWorld> {
        await RAPIER.init();
        return new DefenderWorld(container);
    }

    resize(width: number, height: number): void {
        if (width <= 0 || height <= 0) return;
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.bowView.setAspect(width / height);
    }

    /** Passive bonuses used when a spell builds its shot. */
    setMods(mods: CombatMods): void {
        this.mods = mods;
    }

    get barrageLeft(): number {
        return this.barrage;
    }

    reset(): void {
        for (const enemy of [...this.enemies]) this.removeEnemy(enemy);
        for (const arrow of this.flying) this.releaseArrow(arrow.mesh);
        for (const arrow of this.stuck) this.releaseArrow(arrow.mesh);
        for (const bolt of this.bolts) bolt.mesh.removeFromParent();
        this.clearFlourishes();
        this.flying.length = 0;
        this.stuck.length = 0;
        this.bolts.length = 0;
        this.feet.set(0, PLAYER.walk.z.min + 0.3);
        this.yaw = 0;
        this.pitch = -0.22;
        this.brand = 0;
        this.barrage = 0;
        this.oil = null;
        this.oilMesh.visible = false;
        this.casterSide = 1;
        this.mods = emptyMods();
        this.setGateHealth(1);
        this.placeCamera();
    }

    look(deltaX: number, deltaY: number, sensitivity: number): void {
        this.yaw -= deltaX * sensitivity;
        this.pitch = clamp(this.pitch - deltaY * sensitivity, -PLAYER.pitchLimit, PLAYER.pitchLimit);
    }

    move(input: MoveInput, speed: number, dt: number): void {
        const length = Math.hypot(input.forward, input.right);
        if (length <= 0) {
            this.walkPhase = 0;
            return;
        }
        const forward = input.forward / length;
        const right = input.right / length;
        const sin = Math.sin(this.yaw);
        const cos = Math.cos(this.yaw);
        const dx = (-sin * forward + cos * right) * speed * dt;
        const dz = (-cos * forward - sin * right) * speed * dt;
        const nextX = this.feet.x + dx;
        const nextZ = this.feet.y + dz;
        if (canStand(nextX, nextZ)) this.feet.set(nextX, nextZ);
        else if (canStand(nextX, this.feet.y)) this.feet.x = nextX;
        else if (canStand(this.feet.x, nextZ)) this.feet.y = nextZ;
        this.walkPhase += speed * dt * 2.4;
    }

    /** Looses an arrow from the eye. `yawOffset` fans it sideways, in radians. */
    fire(profile: ShotProfile, yawOffset = 0): void {
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        if (yawOffset !== 0) direction.applyAxisAngle(UP, yawOffset);
        const shot = this.prepare(profile);
        const position = this.camera.position.clone().addScaledVector(direction, ARROW.spawnOffset);
        this.launch(shot, position, direction.multiplyScalar(shot.speed));
    }

    cast(id: SpellId): SpellResult {
        switch (id) {
            case 'volley': {
                const shot = this.spellShot(SPELL.volley.damage, SPELL.volley.speed);
                const span = SPELL.volley.shots - 1;
                for (let index = 0; index < SPELL.volley.shots; index++) {
                    this.fire(shot, (index - span / 2) * (SPELL.volley.spread / span));
                }
                break;
            }
            case 'bolt':
                this.fire(this.spellShot(SPELL.bolt.damage, SPELL.bolt.speed, { pierce: SPELL.bolt.pierce, ignoreShield: true }));
                break;
            case 'blast':
                this.fire(this.spellShot(SPELL.blast.damage, SPELL.blast.speed, {
                    explode: SPELL.blast.radius, ignoreShield: true, knockback: 1.4,
                }));
                break;
            case 'rain':
                this.rain();
                break;
            case 'repel':
                this.repel();
                break;
            case 'mend':
                return { heal: SPELL.mend.heal };
            case 'brand':
                this.brand = SPELL.brand.duration;
                break;
            case 'frost':
                this.fire(this.spellShot(SPELL.frost.damage, SPELL.frost.speed, { slow: SPELL.frost.slow, aura: SPELL.frost.aura }));
                break;
            case 'spark':
                this.fire(this.spellShot(SPELL.spark.damage, SPELL.spark.speed, { chain: SPELL.spark.jumps, ignoreShield: true }));
                break;
            case 'snipe':
                this.fire(this.spellShot(SPELL.snipe.damage, SPELL.snipe.speed, {
                    vs: { ...this.mods.vs, caster: this.mods.vs.caster * SPELL.snipe.casterBonus },
                }));
                break;
            case 'barrage':
                this.barrage = SPELL.barrage.duration;
                break;
            case 'oil': {
                const aim = this.aimOnBridge();
                this.oil = { x: aim.x, z: aim.z, left: SPELL.oil.duration };
                this.oilMesh.visible = true;
                this.oilMesh.position.set(aim.x, 0.08, aim.z);
                this.oilMesh.scale.set(3.3, SPELL.oil.reach, 1);
                break;
            }
            default:
                break;
        }
        return { heal: 0 };
    }

    spawnEnemy(kind: EnemyKind): void {
        const rig = createRig(kind);
        let x = (Math.random() * 2 - 1) * ENEMY_MOTION.spawnHalfWidth;
        if (kind.standoff > 0) {
            this.casterSide = -this.casterSide;
            x = this.casterSide * (LAYOUT.bridgeHalfWidth - 1.05);
        }
        const z = ENEMY_MOTION.spawnZ;
        const halfHeight = Math.max(0.05, kind.height / 2 - kind.radius);
        const body = this.physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(x, kind.height / 2, z));
        const collider = this.physics.createCollider(RAPIER.ColliderDesc.capsule(halfHeight, kind.radius), body);
        const jitter = 1 + (Math.random() * 2 - 1) * ENEMY_MOTION.speedJitter;
        const enemy: Enemy = {
            rig, kind, body, collider, x, z, laneX: x,
            health: kind.health, maxHealth: kind.health,
            speed: kind.speed * jitter, gateDamagePerSecond: kind.gateDamagePerSecond,
            state: 'walking', clock: Math.random() * 10, deathTime: 0,
            castTimer: kind.castInterval, burn: 0, burnDps: 0, slow: 0, slowMul: 1, stun: 0,
        };
        rig.root.position.set(x, 0, z);
        this.scene.add(rig.root);
        this.enemies.push(enemy);
        this.enemyByCollider.set(collider.handle, enemy);
    }

    get aliveCount(): number {
        return this.enemies.reduce((count, enemy) => count + (enemy.state === 'dying' ? 0 : 1), 0);
    }

    setGateHealth(fraction: number): void {
        this.gateColor.copy(this.gateBroken).lerp(this.gateFresh, clamp(fraction, 0, 1));
        this.castle.gateMaterial.color.copy(this.gateColor);
    }

    step(dt: number): StepReport {
        const report: StepReport = { hits: 0, kills: 0, sticks: 0, blocks: 0, xp: 0, gateDamage: 0, strikeRates: [] };
        this.time += dt;
        this.brand = Math.max(0, this.brand - dt);
        this.barrage = Math.max(0, this.barrage - dt);
        if (this.oil) {
            this.oil.left -= dt;
            if (this.oil.left <= 0) {
                this.oil = null;
                this.oilMesh.visible = false;
            }
        }
        this.moveEnemies(dt, report);
        this.moveBolts(dt, report);
        this.physics.timestep = dt;
        this.physics.step();
        this.moveArrows(dt, report);
        for (let index = this.stuck.length - 1; index >= 0; index--) {
            const arrow = this.stuck[index];
            arrow.age += dt;
            if (arrow.age > ARROW.stuckLifetime) {
                this.releaseArrow(arrow.mesh);
                this.stuck.splice(index, 1);
            }
        }
        if (report.strikeRates.length > 0 || report.gateDamage > 0) this.gateShake = 0.12;
        return report;
    }

    render(dt: number, draw: number, nocked: boolean): void {
        this.placeCamera();
        this.bowView.update(draw, nocked, this.walkPhase, dt);
        for (const enemy of this.enemies) enemy.rig.update(dt, this.camera);
        const flicker = performance.now() / 1000;
        this.castle.update(flicker);
        this.castle.flames.forEach((flame, index) => {
            flame.scale.set(1, 0.85 + Math.sin(flicker * 13 + index * 2) * 0.1 + Math.sin(flicker * 7.3 + index) * 0.08, 1);
        });
        this.fadeFlourishes(dt);
        this.gateShake = Math.max(0, this.gateShake - dt);
        this.castle.gate.position.x = this.gateShake > 0 ? Math.sin(flicker * 70) * 0.03 : 0;

        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
        this.renderer.clearDepth();
        this.renderer.render(this.bowView.scene, this.bowView.camera);
    }

    destroy(): void {
        for (const enemy of [...this.enemies]) this.removeEnemy(enemy);
        this.clearFlourishes();
        for (const bolt of this.bolts) bolt.mesh.removeFromParent();
        this.bowView.dispose();
        this.scene.traverse(child => {
            if (child instanceof THREE.Mesh) child.geometry.dispose();
        });
        this.physics.free();
        this.renderer.dispose();
        this.canvas.remove();
    }

    private prepare(profile: ShotProfile): ShotProfile {
        const shot: ShotProfile = { ...profile, vs: profile.vs };
        if (this.brand > 0) shot.burn += SPELL.brand.burn;
        return shot;
    }

    private spellShot(damage: number, speed: number, extra: Partial<ShotProfile> = {}): ShotProfile {
        return {
            damage: damage * this.mods.damage,
            speed: speed * this.mods.arrowSpeed,
            pierce: extra.pierce ?? 0,
            ignoreShield: extra.ignoreShield ?? false,
            explode: extra.explode ?? 0,
            burn: extra.burn ?? 0,
            slow: extra.slow ?? 0,
            chain: extra.chain ?? 0,
            knockback: extra.knockback ?? 0,
            aura: extra.aura ?? 0,
            vs: extra.vs ?? this.mods.vs,
            critChance: this.mods.critChance,
            critMul: this.mods.critMul,
        };
    }

    private launch(profile: ShotProfile, position: THREE.Vector3, velocity: THREE.Vector3): void {
        const mesh = this.takeArrow();
        mesh.position.copy(position);
        const direction = scratch.direction.copy(velocity);
        if (direction.lengthSq() > 0.0001) direction.normalize();
        else direction.set(0, -1, 0);
        mesh.quaternion.setFromUnitVectors(ARROW_FORWARD, direction);
        this.scene.add(mesh);
        this.flying.push({
            mesh, position: position.clone(), velocity, profile, age: 0, ignore: new Set(),
        });
    }

    private rain(): void {
        const aim = this.aimOnBridge();
        for (let index = 0; index < SPELL.rain.arrows; index++) {
            const shot = this.spellShot(SPELL.rain.damage, 16);
            const position = new THREE.Vector3(
                clamp(aim.x + (Math.random() - 0.5) * 6, -LAYOUT.bridgeHalfWidth + 0.3, LAYOUT.bridgeHalfWidth - 0.3),
                7.5 + Math.random() * 2,
                aim.z + (Math.random() - 0.5) * 7,
            );
            const velocity = new THREE.Vector3((Math.random() - 0.5) * 1.5, -10, (Math.random() - 0.5) * 1.5);
            this.launch(shot, position, velocity);
        }
    }

    private repel(): void {
        const limit = ENEMY_MOTION.gateStrikeZ - SPELL.repel.range;
        for (const enemy of this.enemies) {
            if (enemy.state === 'dying' || enemy.z < limit) continue;
            enemy.z = Math.max(ENEMY_MOTION.spawnZ + 1, enemy.z - SPELL.repel.distance);
            enemy.stun = SPELL.repel.stun;
            if (enemy.state === 'striking' || enemy.state === 'casting') enemy.state = 'walking';
            enemy.rig.root.position.z = enemy.z;
        }
        this.puff(0, 1.2, ENEMY_MOTION.gateStrikeZ - 1, 0xf4e2b0, 1.4);
    }

    private aimOnBridge(): THREE.Vector3 {
        const direction = this.camera.getWorldDirection(scratch.aim);
        if (direction.y > -0.08) return new THREE.Vector3(0, 0.1, -12);
        const distance = (0.15 - this.camera.position.y) / direction.y;
        return new THREE.Vector3(
            clamp(this.camera.position.x + direction.x * distance, -LAYOUT.bridgeHalfWidth + 0.4, LAYOUT.bridgeHalfWidth - 0.4),
            0.1,
            clamp(this.camera.position.z + direction.z * distance, LAYOUT.wallFrontZ - LAYOUT.bridgeLength + 2, -1.6),
        );
    }

    private placeCamera(): void {
        const lean = leanDistance(this.pitch);
        const dirX = -Math.sin(this.yaw);
        const dirZ = -Math.cos(this.yaw);
        let used = 0;
        for (let step = 8; step >= 0; step--) {
            const distance = lean * (step / 8);
            if (canLean(this.feet.x + dirX * distance, this.feet.y + dirZ * distance)) {
                used = distance;
                break;
            }
        }
        this.camera.position.set(this.feet.x + dirX * used, LAYOUT.walkwayY + PLAYER.eyeHeight, this.feet.y + dirZ * used);
        this.camera.rotation.set(this.pitch, this.yaw, 0);
        this.camera.updateMatrixWorld();
    }

    private moveEnemies(dt: number, report: StepReport): void {
        const limitX = LAYOUT.bridgeHalfWidth - 0.2;
        const doorX = LAYOUT.gateHalfWidth - 0.3;
        for (let index = this.enemies.length - 1; index >= 0; index--) {
            const enemy = this.enemies[index];
            enemy.clock += dt;
            if (enemy.burn > 0) {
                enemy.burn -= dt;
                if (this.wound(enemy, enemy.burnDps * dt, report, false)) continue;
            }
            if (enemy.state === 'dying') {
                enemy.deathTime += dt;
                enemy.rig.die(enemy.deathTime / ENEMY_MOTION.deathDuration);
                if (enemy.deathTime >= ENEMY_MOTION.deathDuration) this.removeEnemy(enemy);
                continue;
            }
            if (enemy.stun > 0) {
                enemy.stun -= dt;
                enemy.rig.channel(0);
                enemy.rig.walk(enemy.clock, 0.2);
                enemy.body.setNextKinematicTranslation({ x: enemy.x, y: enemy.kind.height / 2, z: enemy.z });
                continue;
            }
            if (enemy.state === 'striking') {
                enemy.rig.channel(0);
                enemy.rig.strike(enemy.clock);
                report.strikeRates.push(enemy.gateDamagePerSecond);
                continue;
            }
            if (enemy.state === 'casting') {
                const charge = 1 - enemy.castTimer / Math.max(0.3, enemy.kind.castInterval);
                enemy.rig.channel(clamp(charge, 0, 1));
                enemy.castTimer -= dt;
                if (enemy.castTimer <= 0) {
                    this.launchBolt(enemy);
                    enemy.castTimer = enemy.kind.castInterval;
                }
                enemy.body.setNextKinematicTranslation({ x: enemy.x, y: enemy.kind.height / 2, z: enemy.z });
                continue;
            }

            const goalZ = enemy.kind.standoff > 0
                ? ENEMY_MOTION.gateStrikeZ - enemy.kind.standoff
                : ENEMY_MOTION.gateStrikeZ;
            const toGoal = goalZ - enemy.z;
            const funnel = enemy.kind.standoff > 0 ? 0 : clamp(1 - toGoal / ENEMY_MOTION.funnelDistance, 0, 1);
            let desiredX = enemy.laneX + (clamp(enemy.laneX, -doorX, doorX) - enemy.laneX) * funnel;
            if (enemy.kind.id === 'runner') desiredX += Math.sin(enemy.clock * 4.2 + enemy.laneX * 3) * 0.55;
            let steerX = (desiredX - enemy.x) * 1.2;
            let advance = 1;
            for (const other of this.enemies) {
                if (other === enemy || other.state === 'dying') continue;
                const dx = enemy.x - other.x;
                const dz = enemy.z - other.z;
                const distance = Math.hypot(dx, dz);
                const reach = enemy.kind.radius + other.kind.radius + 0.2;
                if (distance < reach) {
                    const push = (1 - distance / reach) * ENEMY_MOTION.separationStrength;
                    steerX += distance > 0.001 ? (dx / distance) * push : (Math.random() - 0.5) * push;
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
            if (this.oil && Math.abs(enemy.z - this.oil.z) < SPELL.oil.reach && Math.abs(enemy.x - this.oil.x) < 3.3) {
                pace *= SPELL.oil.slow;
            }
            steerX = clamp(steerX, -pace, pace);
            enemy.x = clamp(enemy.x + steerX * dt, -limitX, limitX);
            enemy.z = Math.min(goalZ, enemy.z + pace * advance * dt);
            if (enemy.z >= goalZ - 0.001) {
                enemy.z = goalZ;
                enemy.state = enemy.kind.standoff > 0 ? 'casting' : 'striking';
                enemy.castTimer = enemy.kind.castInterval * 0.55;
            }
            enemy.rig.channel(0);
            enemy.rig.root.position.set(enemy.x, 0, enemy.z);
            enemy.rig.root.rotation.y = Math.atan2(steerX, Math.max(0.2, pace * advance)) * 0.6;
            enemy.rig.walk(enemy.clock, pace * Math.max(0.3, advance));
            enemy.body.setNextKinematicTranslation({ x: enemy.x, y: enemy.kind.height / 2, z: enemy.z });
        }
    }

    private launchBolt(enemy: Enemy): void {
        const position = new THREE.Vector3(enemy.x, 1.2, enemy.z + 0.3);
        const target = new THREE.Vector3(0, 1.35, ENEMY_MOTION.gateStrikeZ + 0.15);
        const velocity = target.sub(position.clone()).normalize().multiplyScalar(8.4);
        const mesh = new THREE.Group();
        mesh.add(new THREE.Mesh(boltGlowGeometry, boltGlowMaterial), new THREE.Mesh(boltCoreGeometry, boltCoreMaterial));
        mesh.position.copy(position);
        this.scene.add(mesh);
        this.bolts.push({ mesh, position, velocity, damage: enemy.kind.castDamage });
    }

    private moveBolts(dt: number, report: StepReport): void {
        const gate = scratch.point.set(0, 1.35, ENEMY_MOTION.gateStrikeZ);
        for (let index = this.bolts.length - 1; index >= 0; index--) {
            const bolt = this.bolts[index];
            bolt.position.addScaledVector(bolt.velocity, dt);
            bolt.mesh.position.copy(bolt.position);
            if (bolt.position.distanceTo(gate) < 0.75 || bolt.position.z > ENEMY_MOTION.gateStrikeZ) {
                report.gateDamage += bolt.damage;
                this.puff(bolt.position.x, bolt.position.y, bolt.position.z, 0xff8a3a, 0.45);
                bolt.mesh.removeFromParent();
                this.bolts.splice(index, 1);
            }
        }
    }

    private moveArrows(dt: number, report: StepReport): void {
        for (let index = this.flying.length - 1; index >= 0; index--) {
            if (!this.advanceArrow(this.flying[index], dt, report)) this.flying.splice(index, 1);
        }
    }

    /** Returns false when the arrow has stuck, expired, or fallen into the moat. */
    private advanceArrow(arrow: FlyingArrow, dt: number, report: StepReport): boolean {
        arrow.age += dt;
        const speed = arrow.velocity.length();
        arrow.velocity.addScaledVector(arrow.velocity, -ARROW.drag * speed * dt);
        arrow.velocity.y -= ARROW.gravity * dt;
        const start = scratch.start.copy(arrow.position);
        const next = scratch.next.copy(start).addScaledVector(arrow.velocity, dt);
        const direction = scratch.direction.subVectors(next, start);
        const distance = direction.length();
        if (distance > 0) direction.divideScalar(distance);
        else direction.set(0, -1, 0);
        this.clipBolts(start, next, report);

        let traveled = 0;
        let guard = 0;
        while (distance > 0 && traveled < distance - 0.0001 && guard++ < 6) {
            const origin = scratch.origin.copy(start).addScaledVector(direction, traveled);
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
            const point = scratch.point.copy(start).addScaledVector(direction, impact + 0.08);
            arrow.position.copy(point);
            const enemy = this.enemyByCollider.get(hit.collider.handle);
            if (!enemy) {
                this.burstAt(arrow, point, null, report);
                this.embed(arrow, direction, null);
                report.sticks++;
                return false;
            }
            const faceX = Math.sin(enemy.rig.root.rotation.y);
            const faceZ = Math.cos(enemy.rig.root.rotation.y);
            const blocked = enemy.kind.shield && !arrow.profile.ignoreShield
                && shieldBlocks(arrow.velocity.x, arrow.velocity.y, arrow.velocity.z, faceX, faceZ);
            if (blocked) {
                report.blocks++;
                enemy.rig.blocked();
                this.burstAt(arrow, point, null, report);
                this.embed(arrow, direction, enemy);
                return false;
            }
            this.hurt(enemy, arrow.profile.damage, arrow.profile, report);
            this.burstAt(arrow, point, enemy, report);
            if (arrow.profile.pierce > 0) {
                arrow.profile.pierce -= 1;
                arrow.ignore.add(hit.collider.handle);
                traveled = impact + 0.4;
                continue;
            }
            this.embed(arrow, direction, enemy);
            return false;
        }

        arrow.position.copy(next);
        arrow.mesh.position.copy(next);
        arrow.mesh.quaternion.setFromUnitVectors(ARROW_FORWARD, direction);
        if (next.y < LAYOUT.waterY || arrow.age > ARROW.lifetime) {
            this.releaseArrow(arrow.mesh);
            return false;
        }
        return true;
    }

    private burstAt(arrow: FlyingArrow, point: THREE.Vector3, primary: Enemy | null, report: StepReport): void {
        if (arrow.profile.explode > 0) {
            this.puff(point.x, point.y, point.z, 0xff8a3a, arrow.profile.explode * 0.45);
            for (const enemy of this.enemies) {
                if (enemy === primary || enemy.state === 'dying') continue;
                if (Math.hypot(enemy.x - point.x, enemy.z - point.z) > arrow.profile.explode + enemy.kind.radius) continue;
                this.hurt(enemy, arrow.profile.damage * 0.6, { ...arrow.profile, explode: 0, pierce: 0, chain: 0 }, report);
            }
        }
        if (arrow.profile.aura > 0) {
            this.puff(point.x, 0.4, point.z, 0xb7e6ff, arrow.profile.aura * 0.4);
            for (const enemy of this.enemies) {
                if (enemy.state === 'dying') continue;
                if (Math.hypot(enemy.x - point.x, enemy.z - point.z) > arrow.profile.aura + enemy.kind.radius) continue;
                enemy.slow = Math.max(enemy.slow, 2.6);
                enemy.slowMul = arrow.profile.slow;
            }
        }
        if (arrow.profile.chain > 0 && primary) this.chainFrom(primary, arrow.profile, report);
    }

    private chainFrom(first: Enemy, profile: ShotProfile, report: StepReport): void {
        const hit = new Set<Enemy>([first]);
        let current = first;
        let power = profile.damage * 0.72;
        for (let jump = 0; jump < profile.chain; jump++) {
            const next = this.nearest(current, SPELL.spark.range, hit);
            if (!next) break;
            this.sparkBetween(current, next);
            this.hurt(next, power, { ...profile, chain: 0, explode: 0 }, report);
            hit.add(next);
            current = next;
            power *= 0.72;
        }
    }

    private nearest(from: Enemy, range: number, skip: Set<Enemy>): Enemy | null {
        let best: Enemy | null = null;
        let bestDistance = range;
        for (const enemy of this.enemies) {
            if (skip.has(enemy) || enemy.state === 'dying') continue;
            const distance = Math.hypot(enemy.x - from.x, enemy.z - from.z);
            if (distance < bestDistance) {
                best = enemy;
                bestDistance = distance;
            }
        }
        return best;
    }

    private hurt(enemy: Enemy, amount: number, profile: ShotProfile, report: StepReport): void {
        if (enemy.state === 'dying') return;
        const rolled = rolledDamage({ ...profile, damage: amount }, enemy.kind.id, Math.random());
        if (profile.burn > 0) {
            enemy.burn = Math.max(enemy.burn, 3.2);
            enemy.burnDps = Math.max(enemy.burnDps, profile.burn);
        }
        if (profile.slow > 0) {
            enemy.slow = Math.max(enemy.slow, 2.4);
            enemy.slowMul = profile.slow;
        }
        if (profile.knockback > 0) {
            const shove = profile.knockback * (enemy.kind.id === 'brute' ? 0.35 : 1);
            enemy.z = Math.max(ENEMY_MOTION.spawnZ + 1, enemy.z - shove);
            enemy.rig.root.position.z = enemy.z;
            if (enemy.state === 'striking') enemy.state = 'walking';
        }
        report.hits++;
        this.wound(enemy, rolled.damage, report);
    }

    /** Returns true when this blow drops the foe. */
    private wound(enemy: Enemy, amount: number, report: StepReport, flash = true): boolean {
        if (enemy.state === 'dying') return false;
        enemy.health -= amount;
        if (flash) enemy.rig.hit();
        enemy.rig.setHealth(Math.max(0, enemy.health) / enemy.maxHealth);
        if (enemy.health > 0) return false;
        report.kills++;
        report.xp += enemy.kind.xp;
        enemy.state = 'dying';
        enemy.deathTime = 0;
        this.enemyByCollider.delete(enemy.collider.handle);
        this.physics.removeRigidBody(enemy.body);
        return true;
    }

    private clipBolts(from: THREE.Vector3, to: THREE.Vector3, report: StepReport): void {
        for (let index = this.bolts.length - 1; index >= 0; index--) {
            const bolt = this.bolts[index];
            if (!segmentNear(from, to, bolt.position, 0.48)) continue;
            this.puff(bolt.position.x, bolt.position.y, bolt.position.z, 0xffe7a8, 0.35);
            bolt.mesh.removeFromParent();
            this.bolts.splice(index, 1);
            report.hits++;
        }
    }

    private embed(arrow: FlyingArrow, direction: THREE.Vector3, enemy: Enemy | null): void {
        arrow.mesh.position.copy(arrow.position);
        arrow.mesh.quaternion.setFromUnitVectors(ARROW_FORWARD, direction);
        if (enemy) {
            arrow.mesh.updateMatrixWorld(true);
            enemy.rig.root.updateMatrixWorld(true);
            scratch.matrix.copy(enemy.rig.root.matrixWorld).invert().multiply(arrow.mesh.matrixWorld);
            scratch.matrix.decompose(arrow.mesh.position, arrow.mesh.quaternion, arrow.mesh.scale);
            enemy.rig.root.add(arrow.mesh);
        }
        this.stuck.push({ mesh: arrow.mesh, age: 0 });
    }

    private puff(x: number, y: number, z: number, color: number, radius: number): void {
        const mesh = new THREE.Mesh(puffGeometry, new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.75, depthWrite: false,
        }));
        mesh.position.set(x, y, z);
        mesh.scale.setScalar(radius);
        this.scene.add(mesh);
        this.puffs.push({ mesh, age: 0 });
    }

    private sparkBetween(from: Enemy, to: Enemy): void {
        const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(from.x, 0.9, from.z),
            new THREE.Vector3(to.x, 0.9, to.z),
        ]);
        const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffe7a8, transparent: true, opacity: 1 }));
        this.scene.add(line);
        this.sparks.push({ line, age: 0 });
    }

    private fadeFlourishes(dt: number): void {
        for (let index = this.puffs.length - 1; index >= 0; index--) {
            const puff = this.puffs[index];
            puff.age += dt;
            const life = 1 - puff.age / 0.35;
            puff.mesh.scale.multiplyScalar(1 + dt * 3);
            const material = puff.mesh.material as THREE.MeshBasicMaterial;
            material.opacity = Math.max(0, life);
            if (life <= 0) {
                puff.mesh.removeFromParent();
                material.dispose();
                this.puffs.splice(index, 1);
            }
        }
        for (let index = this.sparks.length - 1; index >= 0; index--) {
            const spark = this.sparks[index];
            spark.age += dt;
            const material = spark.line.material as THREE.LineBasicMaterial;
            material.opacity = Math.max(0, 1 - spark.age / 0.2);
            if (spark.age > 0.2) {
                spark.line.removeFromParent();
                spark.line.geometry.dispose();
                material.dispose();
                this.sparks.splice(index, 1);
            }
        }
    }

    private clearFlourishes(): void {
        for (const puff of this.puffs) {
            puff.mesh.removeFromParent();
            (puff.mesh.material as THREE.Material).dispose();
        }
        for (const spark of this.sparks) {
            spark.line.removeFromParent();
            spark.line.geometry.dispose();
            (spark.line.material as THREE.Material).dispose();
        }
        this.puffs.length = 0;
        this.sparks.length = 0;
    }

    private removeEnemy(enemy: Enemy): void {
        const index = this.enemies.indexOf(enemy);
        if (index >= 0) this.enemies.splice(index, 1);
        for (let arrowIndex = this.stuck.length - 1; arrowIndex >= 0; arrowIndex--) {
            if (this.stuck[arrowIndex].mesh.parent === enemy.rig.root) {
                this.releaseArrow(this.stuck[arrowIndex].mesh);
                this.stuck.splice(arrowIndex, 1);
            }
        }
        if (enemy.state !== 'dying') {
            this.enemyByCollider.delete(enemy.collider.handle);
            this.physics.removeRigidBody(enemy.body);
        }
        enemy.rig.root.removeFromParent();
        enemy.rig.dispose();
    }

    private takeArrow(): THREE.Group {
        const arrow = this.arrowPool.pop() ?? createArrowMesh();
        arrow.scale.setScalar(1);
        return arrow;
    }

    private releaseArrow(mesh: THREE.Group): void {
        mesh.removeFromParent();
        this.arrowPool.push(mesh);
    }
}

function segmentNear(from: THREE.Vector3, to: THREE.Vector3, point: THREE.Vector3, radius: number): boolean {
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
