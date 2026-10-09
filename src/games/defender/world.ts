import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { buildCastle, CastleScene } from './castle';
import { BowView, createArrowMesh } from './bow';
import { GoblinRig } from './goblin';
import { clamp, leanDistance, WaveSpec } from './rules';
import { ARROW, ENEMY_MOTION, GOBLIN, LAYOUT, PLAYER } from './tuning';

interface FlyingArrow {
    mesh: THREE.Group;
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    damage: number;
    age: number;
}

interface StuckArrow {
    mesh: THREE.Group;
    age: number;
}

type GoblinState = 'walking' | 'striking' | 'dying';

interface Goblin {
    rig: GoblinRig;
    body: RAPIER.RigidBody;
    collider: RAPIER.Collider;
    x: number;
    z: number;
    laneX: number;
    health: number;
    maxHealth: number;
    speed: number;
    gateDamagePerSecond: number;
    state: GoblinState;
    clock: number;
    deathTime: number;
}

export interface StepReport {
    hits: number;
    kills: number;
    sticks: number;
    /** Gate damage per second from every goblin currently striking. */
    strikeRates: number[];
}

export interface MoveInput {
    forward: number;
    right: number;
}

const ARROW_FORWARD = new THREE.Vector3(0, 0, 1);
const scratch = {
    direction: new THREE.Vector3(),
    next: new THREE.Vector3(),
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
    private readonly goblins: Goblin[] = [];
    private readonly goblinByCollider = new Map<number, Goblin>();
    private readonly flying: FlyingArrow[] = [];
    private readonly stuck: StuckArrow[] = [];
    private readonly arrowPool: THREE.Group[] = [];
    private readonly feet = new THREE.Vector2(0, PLAYER.walk.z.min + 0.3);
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

    reset(): void {
        for (const goblin of [...this.goblins]) this.removeGoblin(goblin);
        for (const arrow of this.flying) this.releaseArrow(arrow.mesh);
        for (const arrow of this.stuck) this.releaseArrow(arrow.mesh);
        this.flying.length = 0;
        this.stuck.length = 0;
        this.feet.set(0, PLAYER.walk.z.min + 0.3);
        this.yaw = 0;
        this.pitch = -0.22;
        this.setGateHealth(1);
        this.placeCamera();
    }

    look(deltaX: number, deltaY: number, sensitivity: number): void {
        this.yaw -= deltaX * sensitivity;
        this.pitch = clamp(this.pitch - deltaY * sensitivity, -PLAYER.pitchLimit, PLAYER.pitchLimit);
    }

    move(input: MoveInput, speed: number, dt: number): void {
        const length = Math.hypot(input.forward, input.right);
        if (length > 0) {
            const forward = input.forward / length;
            const right = input.right / length;
            const sin = Math.sin(this.yaw);
            const cos = Math.cos(this.yaw);
            this.feet.x = clamp(this.feet.x + (-sin * forward + cos * right) * speed * dt, PLAYER.walk.x.min, PLAYER.walk.x.max);
            this.feet.y = clamp(this.feet.y + (-cos * forward - sin * right) * speed * dt, PLAYER.walk.z.min, PLAYER.walk.z.max);
            this.walkPhase += speed * dt * 2.4;
        } else {
            this.walkPhase = 0;
        }
    }

    /** Looses an arrow from the eye along the aim. */
    fire(speed: number, damage: number): void {
        const mesh = this.takeArrow();
        const direction = this.camera.getWorldDirection(new THREE.Vector3());
        const position = this.camera.position.clone().addScaledVector(direction, ARROW.spawnOffset);
        mesh.position.copy(position);
        mesh.quaternion.setFromUnitVectors(ARROW_FORWARD, direction);
        this.scene.add(mesh);
        this.flying.push({ mesh, position, velocity: direction.multiplyScalar(speed), damage, age: 0 });
    }

    spawnGoblin(spec: WaveSpec): void {
        const rig = new GoblinRig();
        const x = (Math.random() * 2 - 1) * ENEMY_MOTION.spawnHalfWidth;
        const z = ENEMY_MOTION.spawnZ;
        const halfHeight = GOBLIN.height / 2 - GOBLIN.radius;
        const body = this.physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(x, GOBLIN.height / 2, z));
        const collider = this.physics.createCollider(RAPIER.ColliderDesc.capsule(halfHeight, GOBLIN.radius), body);
        const jitter = 1 + (Math.random() * 2 - 1) * ENEMY_MOTION.speedJitter;
        const goblin: Goblin = {
            rig, body, collider, x, z, laneX: x,
            health: spec.health, maxHealth: spec.health,
            speed: spec.speed * jitter, gateDamagePerSecond: spec.gateDamagePerSecond,
            state: 'walking', clock: Math.random() * 10, deathTime: 0,
        };
        rig.root.position.set(x, 0, z);
        this.scene.add(rig.root);
        this.goblins.push(goblin);
        this.goblinByCollider.set(collider.handle, goblin);
    }

    /** Goblins still standing, so a wave knows when it is cleared. */
    get aliveCount(): number {
        return this.goblins.reduce((count, goblin) => count + (goblin.state === 'dying' ? 0 : 1), 0);
    }

    setGateHealth(fraction: number): void {
        this.gateColor.copy(this.gateBroken).lerp(this.gateFresh, clamp(fraction, 0, 1));
        this.castle.gateMaterial.color.copy(this.gateColor);
    }

    /** Advances goblins, physics, and arrows by one fixed step. */
    step(dt: number): StepReport {
        const report: StepReport = { hits: 0, kills: 0, sticks: 0, strikeRates: [] };
        this.time += dt;
        this.moveGoblins(dt, report);
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
        if (report.strikeRates.length > 0) this.gateShake = 0.12;
        return report;
    }

    /** Per-frame visuals: camera, bow, flames, goblin flashes. Safe to call while paused. */
    render(dt: number, draw: number, nocked: boolean): void {
        this.placeCamera();
        this.bowView.update(draw, nocked, this.walkPhase, dt);
        for (const goblin of this.goblins) goblin.rig.update(dt, this.camera);
        const flicker = performance.now() / 1000;
        this.castle.flames.forEach((flame, index) => {
            flame.scale.set(1, 0.85 + Math.sin(flicker * 13 + index * 2) * 0.1 + Math.sin(flicker * 7.3 + index) * 0.08, 1);
        });
        this.gateShake = Math.max(0, this.gateShake - dt);
        this.castle.gate.position.x = this.gateShake > 0 ? Math.sin(flicker * 70) * 0.03 : 0;

        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
        this.renderer.clearDepth();
        this.renderer.render(this.bowView.scene, this.bowView.camera);
    }

    destroy(): void {
        for (const goblin of [...this.goblins]) this.removeGoblin(goblin);
        this.bowView.dispose();
        this.scene.traverse(child => {
            if (child instanceof THREE.Mesh) child.geometry.dispose();
        });
        this.physics.free();
        this.renderer.dispose();
        this.canvas.remove();
    }

    private placeCamera(): void {
        const lean = leanDistance(this.pitch);
        const eyeX = clamp(this.feet.x - Math.sin(this.yaw) * lean, PLAYER.walk.x.min, PLAYER.walk.x.max);
        const eyeZ = Math.max(PLAYER.leanLimitZ, this.feet.y - Math.cos(this.yaw) * lean);
        this.camera.position.set(eyeX, LAYOUT.walkwayY + PLAYER.eyeHeight, eyeZ);
        this.camera.rotation.set(this.pitch, this.yaw, 0);
        this.camera.updateMatrixWorld();
    }

    private moveGoblins(dt: number, report: StepReport): void {
        const limitX = LAYOUT.bridgeHalfWidth - GOBLIN.radius - 0.05;
        const doorX = LAYOUT.gateHalfWidth - GOBLIN.radius;
        for (let index = this.goblins.length - 1; index >= 0; index--) {
            const goblin = this.goblins[index];
            goblin.clock += dt;
            if (goblin.state === 'dying') {
                goblin.deathTime += dt;
                goblin.rig.die(goblin.deathTime / ENEMY_MOTION.deathDuration);
                if (goblin.deathTime >= ENEMY_MOTION.deathDuration) this.removeGoblin(goblin);
                continue;
            }
            if (goblin.state === 'striking') {
                goblin.rig.strike(goblin.clock);
                report.strikeRates.push(goblin.gateDamagePerSecond);
                continue;
            }

            // Hold a lane, funnel toward the door near the gate, and keep apart from neighbors.
            const toGate = ENEMY_MOTION.gateStrikeZ - goblin.z;
            const funnel = clamp(1 - toGate / ENEMY_MOTION.funnelDistance, 0, 1);
            const desiredX = goblin.laneX + (clamp(goblin.laneX, -doorX, doorX) - goblin.laneX) * funnel;
            let steerX = (desiredX - goblin.x) * 1.2;
            let advance = 1;
            for (const other of this.goblins) {
                if (other === goblin || other.state === 'dying') continue;
                const dx = goblin.x - other.x;
                const dz = goblin.z - other.z;
                const distance = Math.hypot(dx, dz);
                if (distance < ENEMY_MOTION.separationRadius) {
                    const push = (1 - distance / ENEMY_MOTION.separationRadius) * ENEMY_MOTION.separationStrength;
                    steerX += distance > 0.001 ? (dx / distance) * push : (Math.random() - 0.5) * push;
                }
                const ahead = other.z - goblin.z;
                if (ahead > 0 && ahead < 0.75 && Math.abs(dx) < 0.55) advance = Math.min(advance, clamp((ahead - 0.45) / 0.3, 0, 1));
            }
            steerX = clamp(steerX, -goblin.speed, goblin.speed);
            goblin.x = clamp(goblin.x + steerX * dt, -limitX, limitX);
            goblin.z = Math.min(ENEMY_MOTION.gateStrikeZ, goblin.z + goblin.speed * advance * dt);
            if (goblin.z >= ENEMY_MOTION.gateStrikeZ) goblin.state = 'striking';

            goblin.rig.root.position.set(goblin.x, 0, goblin.z);
            goblin.rig.root.rotation.y = Math.atan2(steerX, Math.max(0.2, goblin.speed * advance)) * 0.6;
            goblin.rig.walk(goblin.clock, goblin.speed * Math.max(0.3, advance));
            goblin.body.setNextKinematicTranslation({ x: goblin.x, y: GOBLIN.height / 2, z: goblin.z });
        }
    }

    private moveArrows(dt: number, report: StepReport): void {
        for (let index = this.flying.length - 1; index >= 0; index--) {
            const arrow = this.flying[index];
            arrow.age += dt;
            const speed = arrow.velocity.length();
            arrow.velocity.addScaledVector(arrow.velocity, -ARROW.drag * speed * dt);
            arrow.velocity.y -= ARROW.gravity * dt;
            const next = scratch.next.copy(arrow.position).addScaledVector(arrow.velocity, dt);
            const direction = scratch.direction.subVectors(next, arrow.position);
            const distance = direction.length();
            direction.divideScalar(distance || 1);

            const hit = distance > 0
                ? this.physics.castRay(new RAPIER.Ray(arrow.position, direction), distance, true)
                : null;
            if (hit) {
                arrow.position.addScaledVector(direction, hit.timeOfImpact + 0.12);
                arrow.mesh.position.copy(arrow.position);
                arrow.mesh.quaternion.setFromUnitVectors(ARROW_FORWARD, direction);
                const goblin = this.goblinByCollider.get(hit.collider.handle);
                if (goblin) this.strikeGoblin(goblin, arrow, report);
                else report.sticks++;
                this.stuck.push({ mesh: arrow.mesh, age: 0 });
                this.flying.splice(index, 1);
                continue;
            }

            arrow.position.copy(next);
            arrow.mesh.position.copy(next);
            arrow.mesh.quaternion.setFromUnitVectors(ARROW_FORWARD, direction);
            if (next.y < LAYOUT.waterY || arrow.age > ARROW.lifetime) {
                this.releaseArrow(arrow.mesh);
                this.flying.splice(index, 1);
            }
        }
    }

    private strikeGoblin(goblin: Goblin, arrow: FlyingArrow, report: StepReport): void {
        report.hits++;
        goblin.health -= arrow.damage;
        goblin.rig.hit();
        goblin.rig.setHealth(Math.max(0, goblin.health) / goblin.maxHealth);
        goblin.rig.root.updateMatrixWorld(true);
        // Parent the arrow to the goblin so it rides along, keeping its world pose.
        arrow.mesh.updateMatrixWorld(true);
        scratch.matrix.copy(goblin.rig.root.matrixWorld).invert().multiply(arrow.mesh.matrixWorld);
        scratch.matrix.decompose(arrow.mesh.position, arrow.mesh.quaternion, arrow.mesh.scale);
        goblin.rig.root.add(arrow.mesh);
        if (goblin.health <= 0) {
            report.kills++;
            goblin.state = 'dying';
            goblin.deathTime = 0;
            this.goblinByCollider.delete(goblin.collider.handle);
            this.physics.removeRigidBody(goblin.body);
        }
    }

    private removeGoblin(goblin: Goblin): void {
        const index = this.goblins.indexOf(goblin);
        if (index >= 0) this.goblins.splice(index, 1);
        for (let arrowIndex = this.stuck.length - 1; arrowIndex >= 0; arrowIndex--) {
            if (this.stuck[arrowIndex].mesh.parent === goblin.rig.root) {
                this.releaseArrow(this.stuck[arrowIndex].mesh);
                this.stuck.splice(arrowIndex, 1);
            }
        }
        if (goblin.state !== 'dying') {
            this.goblinByCollider.delete(goblin.collider.handle);
            this.physics.removeRigidBody(goblin.body);
        }
        goblin.rig.root.removeFromParent();
        goblin.rig.dispose();
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