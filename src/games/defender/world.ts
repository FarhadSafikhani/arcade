import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { ArcherRig } from './archer';
import { buildCastle, CastleScene } from './castle';
import { BowView, createArrowMesh } from './bow';
import { createRig, EnemyRig } from './goblin';
import type { ArrowView, PlayerView, WorldView } from './net/link';
import { aimDirection, clamp, eyePosition, leanDistance } from './rules';
import type { FxEvent } from './sim';
import { ARROW, ENEMIES, ENEMY_MOTION, LAYOUT, PLAYER, SPELL, type EnemyId } from './tuning';

interface ShownEnemy {
    rig: EnemyRig;
    x: number;
    z: number;
    facing: number;
    clock: number;
    deathTime: number;
}

interface ShownArrow {
    mesh: THREE.Group;
    /** Last values the server sent, to notice a fresh patch. */
    seen: { x: number; y: number; z: number; stuck: boolean; enemy: string };
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    /** Seconds since the last fresh patch; dead reckoning stops after a short while. */
    coast: number;
}

/** An arrow this archer just loosed, flown here before the server's copy arrives. */
interface Ghost {
    mesh: THREE.Group;
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    age: number;
    landed: boolean;
}

interface ShownBolt { mesh: THREE.Object3D; position: THREE.Vector3; velocity: THREE.Vector3; seen: THREE.Vector3; }

interface ShownArcher { rig: ArcherRig; x: number; z: number; yaw: number; pitch: number; }

interface Puff { mesh: THREE.Mesh; age: number; }
interface Spark { line: THREE.Line; age: number; }

const ARROW_FORWARD = new THREE.Vector3(0, 0, 1);
const puffGeometry = new THREE.SphereGeometry(1, 10, 8);
const boltGlowGeometry = new THREE.SphereGeometry(0.22, 10, 8);
const boltCoreGeometry = new THREE.SphereGeometry(0.1, 8, 6);
const boltGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xffb15a });
const boltCoreMaterial = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
const oilGeometry = new THREE.CircleGeometry(1, 22);
const oilMaterial = new THREE.MeshBasicMaterial({ color: 0x2a2218, transparent: true, opacity: 0.6, depthWrite: false });
/** Longest a remote arrow or bolt keeps flying on its own between patches. */
const MAX_COAST = 0.2;
const scratch = { direction: new THREE.Vector3() };

/**
 * Draws a Defender run: the castle, every foe, arrow, bolt, slick, and other archer
 * in a `WorldView`, plus this archer's first-person bow. Holds no game rules.
 * Online, it smooths remote motion and flies this archer's own arrows ahead of the server.
 */
export class DefenderWorld {
    readonly canvas: HTMLCanvasElement;
    private readonly renderer: THREE.WebGLRenderer;
    private readonly scene = new THREE.Scene();
    private readonly camera: THREE.PerspectiveCamera;
    private readonly bowView: BowView;
    /** Static colliders only, so predicted arrows stop at the stone. */
    private readonly physics: RAPIER.World;
    private readonly castle: CastleScene;
    private readonly gateFresh: THREE.Color;
    private readonly gateBroken = new THREE.Color(0x2a1a10);
    private readonly enemies = new Map<string, ShownEnemy>();
    private readonly arrows = new Map<string, ShownArrow>();
    private readonly ghosts = new Map<number, Ghost>();
    private readonly bolts = new Map<string, ShownBolt>();
    private readonly oils = new Map<string, THREE.Mesh>();
    private readonly archers = new Map<string, ShownArcher>();
    private readonly puffs: Puff[] = [];
    private readonly sparks: Spark[] = [];
    private readonly arrowPool: THREE.Group[] = [];
    private feetX = 0;
    private feetZ = PLAYER.walk.z.min + 0.3;
    private yaw = 0;
    private pitch = -0.22;
    private walkPhase = 0;
    private gateShake = 0;

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
        this.physics.step();
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

    /** Where this archer stands and looks. `moved` is how far the feet went this frame, for the bow's sway. */
    setPose(x: number, z: number, yaw: number, pitch: number, moved: number): void {
        this.feetX = x;
        this.feetZ = z;
        this.yaw = yaw;
        this.pitch = pitch;
        this.walkPhase = moved > 0 ? this.walkPhase + moved * 2.4 : 0;
        this.placeCamera();
    }

    /** Throws away everything shown, ready for another run or another room. */
    clear(): void {
        for (const id of [...this.enemies.keys()]) this.dropEnemy(id);
        for (const id of [...this.arrows.keys()]) this.dropArrow(id);
        for (const seq of [...this.ghosts.keys()]) this.dropGhost(seq);
        for (const id of [...this.bolts.keys()]) this.dropBolt(id);
        for (const mesh of this.oils.values()) mesh.removeFromParent();
        this.oils.clear();
        for (const id of [...this.archers.keys()]) this.dropArcher(id);
        this.clearFlourishes();
        this.setGateHealth(1);
    }

    /** Flies this archer's arrow at once, from the same eye and aim the server will use. */
    predict(seq: number, speed: number): void {
        const direction = aimDirection(this.yaw, this.pitch);
        const eye = eyePosition(this.feetX, this.feetZ, this.yaw, this.pitch);
        const position = new THREE.Vector3(eye.x, eye.y, eye.z).addScaledVector(toVector(direction), ARROW.spawnOffset);
        const mesh = this.takeArrow();
        mesh.position.copy(position);
        mesh.quaternion.setFromUnitVectors(ARROW_FORWARD, toVector(direction));
        this.scene.add(mesh);
        this.ghosts.set(seq, { mesh, position, velocity: toVector(direction).multiplyScalar(speed), age: 0, landed: false });
    }

    /** Brings the scene in line with the view. `smooth` eases remote motion between network patches. */
    sync(view: WorldView, me: string, dt: number, smooth: boolean): void {
        const ease = smooth ? 1 - Math.exp(-dt * 14) : 1;
        this.syncEnemies(view, dt, ease);
        this.syncArrows(view, me, dt);
        this.flyGhosts(dt);
        this.syncBolts(view, dt);
        this.syncOils(view);
        this.syncArchers(view, me, ease);
        this.setGateHealth(view.gateMax > 0 ? view.gate / view.gateMax : 1);
    }

    effects(events: readonly FxEvent[]): void {
        for (const event of events) {
            switch (event.t) {
                case 'hit':
                    this.enemies.get(event.enemy)?.rig.hit();
                    break;
                case 'block':
                    this.enemies.get(event.enemy)?.rig.blocked();
                    break;
                case 'puff':
                    this.puff(event.x, event.y, event.z, event.color, event.r);
                    break;
                case 'spark':
                    this.spark(event.ax, event.az, event.bx, event.bz);
                    break;
                case 'gate':
                    this.gateShake = 0.12;
                    break;
                default:
                    break;
            }
        }
    }

    render(dt: number, draw: number, nocked: boolean): void {
        this.bowView.update(draw, nocked, this.walkPhase, dt);
        for (const enemy of this.enemies.values()) enemy.rig.update(dt, this.camera);
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
        this.clear();
        this.bowView.dispose();
        this.scene.traverse(child => {
            if (child instanceof THREE.Mesh) child.geometry.dispose();
        });
        this.physics.free();
        this.renderer.dispose();
        this.canvas.remove();
    }

    private placeCamera(): void {
        const eye = eyePosition(this.feetX, this.feetZ, this.yaw, this.pitch);
        this.camera.position.set(eye.x, eye.y, eye.z);
        this.camera.rotation.set(this.pitch, this.yaw, 0);
        this.camera.updateMatrixWorld();
    }

    private setGateHealth(fraction: number): void {
        this.castle.gateMaterial.color.copy(this.gateBroken).lerp(this.gateFresh, clamp(fraction, 0, 1));
    }

    private syncEnemies(view: WorldView, dt: number, ease: number): void {
        for (const id of this.enemies.keys()) if (!view.enemies.get(id)) this.dropEnemy(id);
        view.enemies.forEach((state, id) => {
            let shown = this.enemies.get(id);
            if (!shown) {
                const kind = ENEMIES[state.kind as EnemyId] ?? ENEMIES.goblin;
                const rig = createRig(kind);
                shown = { rig, x: state.x, z: state.z, facing: state.facing, clock: Math.random() * 10, deathTime: 0 };
                this.scene.add(rig.root);
                this.enemies.set(id, shown);
            }
            const rig = shown.rig;
            shown.clock += dt;
            // Knockback and Repel jump a foe back down the bridge; follow that at once rather than gliding.
            const far = Math.hypot(state.x - shown.x, state.z - shown.z) > 1.2;
            shown.x += (state.x - shown.x) * (far ? 1 : ease);
            shown.z += (state.z - shown.z) * (far ? 1 : ease);
            shown.facing += (state.facing - shown.facing) * ease;
            rig.root.position.set(shown.x, 0, shown.z);
            rig.root.rotation.y = shown.facing;
            rig.setHealth(state.maxHealth > 0 ? Math.max(0, state.health) / state.maxHealth : 1);
            if (state.mode === 'dying') {
                shown.deathTime += dt;
                rig.die(Math.min(1, shown.deathTime / ENEMY_MOTION.deathDuration));
                return;
            }
            rig.channel(state.mode === 'casting' ? state.charge : 0);
            if (state.mode === 'striking') rig.strike(shown.clock);
            else if (state.mode === 'stunned') rig.walk(shown.clock, 0.2);
            else if (state.mode === 'walking') rig.walk(shown.clock, state.pace);
        });
    }

    private syncArrows(view: WorldView, me: string, dt: number): void {
        for (const id of this.arrows.keys()) if (!view.arrows.get(id)) this.dropArrow(id);
        view.arrows.forEach((state, id) => {
            let shown = this.arrows.get(id);
            if (!shown) {
                shown = {
                    mesh: this.takeArrow(),
                    seen: { x: NaN, y: NaN, z: NaN, stuck: false, enemy: '' },
                    position: new THREE.Vector3(), velocity: new THREE.Vector3(), coast: 0,
                };
                this.arrows.set(id, shown);
            }
            const fresh = shown.seen.x !== state.x || shown.seen.y !== state.y || shown.seen.z !== state.z
                || shown.seen.stuck !== state.stuck || shown.seen.enemy !== state.enemy;
            if (fresh) {
                Object.assign(shown.seen, { x: state.x, y: state.y, z: state.z, stuck: state.stuck, enemy: state.enemy });
                shown.coast = 0;
                if (state.stuck) this.plant(shown, state);
                else {
                    shown.position.set(state.x, state.y, state.z);
                    shown.velocity.set(state.vx, state.vy, state.vz);
                }
            }
            const ghost = state.owner === me && state.seq > 0 ? this.ghosts.get(state.seq) : undefined;
            if (ghost && state.stuck) this.dropGhost(state.seq);
            if (!state.stuck) {
                shown.coast += dt;
                if (shown.coast <= MAX_COAST) fly(shown.position, shown.velocity, dt);
                shown.mesh.position.copy(shown.position);
                orient(shown.mesh, shown.velocity);
                if (shown.mesh.parent !== this.scene) this.scene.add(shown.mesh);
            }
            // Our own shot is already on screen as a ghost until the server says where it landed.
            shown.mesh.visible = !ghost || state.stuck;
        });
    }

    /** Fixes a landed arrow in place, riding inside a foe when it hit one. */
    private plant(shown: ShownArrow, state: ArrowView): void {
        const mesh = shown.mesh;
        const host = state.enemy ? this.enemies.get(state.enemy)?.rig.root : undefined;
        mesh.position.set(state.x, state.y, state.z);
        mesh.quaternion.setFromUnitVectors(ARROW_FORWARD, scratch.direction.set(state.vx, state.vy, state.vz).normalize());
        if (host) host.add(mesh);
        else if (state.enemy) mesh.removeFromParent();
        else this.scene.add(mesh);
    }

    private flyGhosts(dt: number): void {
        for (const [seq, ghost] of this.ghosts) {
            ghost.age += dt;
            if (ghost.age > ARROW.lifetime || (ghost.landed && ghost.age > 1.5)) {
                this.dropGhost(seq);
                continue;
            }
            if (ghost.landed) continue;
            const start = ghost.position.clone();
            const end = start.clone();
            fly(end, ghost.velocity, dt);
            const travel = end.clone().sub(start);
            const distance = travel.length();
            const stop = distance > 0 ? this.firstHit(start, travel.divideScalar(distance), distance) : null;
            ghost.position.copy(stop ?? end);
            ghost.mesh.position.copy(ghost.position);
            orient(ghost.mesh, ghost.velocity);
            if (stop) ghost.landed = true;
            if (ghost.position.y < LAYOUT.waterY) this.dropGhost(seq);
        }
    }

    /** Where a predicted arrow first meets stone or a foe as drawn, if anywhere along this step. */
    private firstHit(start: THREE.Vector3, direction: THREE.Vector3, distance: number): THREE.Vector3 | null {
        let best = distance;
        const hit = this.physics.castRay(new RAPIER.Ray(start, direction), distance, true);
        if (hit) best = hit.timeOfImpact;
        for (const enemy of this.enemies.values()) {
            const kind = ENEMIES[enemy.rig.style];
            const center = new THREE.Vector3(enemy.x, kind.height / 2, enemy.z);
            const along = center.clone().sub(start).dot(direction);
            if (along < 0 || along > best) continue;
            const closest = start.clone().addScaledVector(direction, along);
            const flat = Math.hypot(closest.x - center.x, closest.z - center.z);
            if (flat <= kind.radius && Math.abs(closest.y - center.y) <= kind.height / 2) best = along;
        }
        return best < distance ? start.clone().addScaledVector(direction, best + 0.08) : null;
    }

    private syncBolts(view: WorldView, dt: number): void {
        for (const id of this.bolts.keys()) if (!view.bolts.get(id)) this.dropBolt(id);
        view.bolts.forEach((state, id) => {
            let shown = this.bolts.get(id);
            if (!shown) {
                const mesh = new THREE.Group();
                mesh.add(new THREE.Mesh(boltGlowGeometry, boltGlowMaterial), new THREE.Mesh(boltCoreGeometry, boltCoreMaterial));
                this.scene.add(mesh);
                shown = { mesh, position: new THREE.Vector3(), velocity: new THREE.Vector3(), seen: new THREE.Vector3(NaN, NaN, NaN) };
                this.bolts.set(id, shown);
            }
            if (shown.seen.x !== state.x || shown.seen.y !== state.y || shown.seen.z !== state.z) {
                shown.seen.set(state.x, state.y, state.z);
                shown.position.set(state.x, state.y, state.z);
                shown.velocity.set(state.vx, state.vy, state.vz);
            } else shown.position.addScaledVector(shown.velocity, dt);
            shown.mesh.position.copy(shown.position);
        });
    }

    private syncOils(view: WorldView): void {
        for (const [id, mesh] of this.oils) {
            if (view.oils.get(id)) continue;
            mesh.removeFromParent();
            this.oils.delete(id);
        }
        view.oils.forEach((state, id) => {
            if (this.oils.has(id)) return;
            const mesh = new THREE.Mesh(oilGeometry, oilMaterial);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(state.x, 0.08, state.z);
            mesh.scale.set(3.3, SPELL.oil.reach, 1);
            this.scene.add(mesh);
            this.oils.set(id, mesh);
        });
    }

    private syncArchers(view: WorldView, me: string, ease: number): void {
        for (const id of this.archers.keys()) if (id === me || !view.players.get(id)) this.dropArcher(id);
        view.players.forEach((state: PlayerView, id) => {
            if (id === me) return;
            let shown = this.archers.get(id);
            if (!shown) {
                shown = { rig: new ArcherRig(state.name, state.slot), x: state.x, z: state.z, yaw: state.yaw, pitch: state.pitch };
                this.scene.add(shown.rig.root);
                this.archers.set(id, shown);
            }
            const beforeX = shown.x;
            const beforeZ = shown.z;
            shown.x += (state.x - shown.x) * ease;
            shown.z += (state.z - shown.z) * ease;
            shown.yaw += wrapAngle(state.yaw - shown.yaw) * ease;
            shown.pitch += (state.pitch - shown.pitch) * ease;
            const eye = eyePosition(shown.x, shown.z, shown.yaw, shown.pitch);
            const lean = Math.min(leanDistance(shown.pitch), Math.hypot(eye.x - shown.x, eye.z - shown.z));
            shown.rig.pose(shown.x, LAYOUT.walkwayY, shown.z, shown.yaw, shown.pitch, state.draw, lean,
                Math.hypot(shown.x - beforeX, shown.z - beforeZ));
        });
    }

    private dropEnemy(id: string): void {
        const shown = this.enemies.get(id);
        if (!shown) return;
        for (const [arrowId, arrow] of this.arrows) if (arrow.mesh.parent === shown.rig.root) this.dropArrow(arrowId);
        shown.rig.root.removeFromParent();
        shown.rig.dispose();
        this.enemies.delete(id);
    }

    private dropArrow(id: string): void {
        const shown = this.arrows.get(id);
        if (!shown) return;
        this.releaseArrow(shown.mesh);
        this.arrows.delete(id);
    }

    private dropGhost(seq: number): void {
        const ghost = this.ghosts.get(seq);
        if (!ghost) return;
        this.releaseArrow(ghost.mesh);
        this.ghosts.delete(seq);
    }

    private dropBolt(id: string): void {
        this.bolts.get(id)?.mesh.removeFromParent();
        this.bolts.delete(id);
    }

    private dropArcher(id: string): void {
        const shown = this.archers.get(id);
        if (!shown) return;
        shown.rig.root.removeFromParent();
        shown.rig.dispose();
        this.archers.delete(id);
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

    private spark(ax: number, az: number, bx: number, bz: number): void {
        const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(ax, 0.9, az),
            new THREE.Vector3(bx, 0.9, bz),
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

    private takeArrow(): THREE.Group {
        const arrow = this.arrowPool.pop() ?? createArrowMesh();
        arrow.scale.setScalar(1);
        arrow.visible = true;
        return arrow;
    }

    private releaseArrow(mesh: THREE.Group): void {
        mesh.removeFromParent();
        this.arrowPool.push(mesh);
    }
}

/** The sim's flight model: quadratic drag, then gravity. Moves `position` by the new velocity. */
function fly(position: THREE.Vector3, velocity: THREE.Vector3, dt: number): void {
    const drag = 1 - ARROW.drag * velocity.length() * dt;
    velocity.x *= drag;
    velocity.y = velocity.y * drag - ARROW.gravity * dt;
    velocity.z *= drag;
    position.addScaledVector(velocity, dt);
}

function orient(mesh: THREE.Object3D, velocity: THREE.Vector3): void {
    if (velocity.lengthSq() < 0.0001) return;
    mesh.quaternion.setFromUnitVectors(ARROW_FORWARD, scratch.direction.copy(velocity).normalize());
}

function toVector(point: { x: number; y: number; z: number }): THREE.Vector3 {
    return new THREE.Vector3(point.x, point.y, point.z);
}

function wrapAngle(angle: number): number {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
}

