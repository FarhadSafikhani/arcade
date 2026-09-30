import { trayLayout, trayPoint, TrayLayout } from './tray-layout';
import { PreviewGallery } from './preview-gallery';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mysteryModel, disposeMystery } from './mystery3d';
import { brickMesh, brickPosition, BRICK_HEIGHT, WHEEL_RADIUS, WHEEL_CENTER_Y, disposeBrick } from './brick3d';
import { buildOrder, pieceMatches, pileAdditions, SnapBrick, SnapLevel } from './level';
import { configureOverlayCamera, fitOverlayDepth, overlayRotation, overlayToScreen, screenToOverlay } from './overlay3d';
import { Box, FrameSphere, boxSphere, easeFrame, fitDistance, fitSpinningBox, modelBox, viewDirection, workingBox } from './camera-fit';

interface LooseBrick { brick: SnapBrick; mesh: THREE.Group; body: RAPIER.RigidBody; }
interface Flight { brick: SnapBrick; mesh: THREE.Group; from: THREE.Vector2; to: THREE.Vector2;
    start: number; duration: number; kind: 'intro' | 'placement' | 'rejection' | 'return';
    fromRotation?: THREE.Quaternion; landingPosition?: THREE.Vector3;
    arcHeight?: number; arcSide?: number; spin?: THREE.Vector3; }
interface Drag { loose: LooseBrick; overlay: THREE.Group; lastX: number; lastY: number;
    lastTime: number; velocityX: number; velocityY: number;
    rotationStart: number; fromRotation: THREE.Quaternion; }

const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');
const HELD_ROTATION_DURATION = 850;
const SHIMMER_SWEEP_DURATION = 500;
const SHIMMER_PAUSE_DURATION = 5000;
const REJECTION_FLASH_DURATION = 420;
const SHOWCASE_FAST_SPIN = Math.PI * 0.8;
const SHOWCASE_SLOW_SPIN = Math.PI * 0.12;
const VIEW_EASE_SECONDS = 0.17;
const GRAVITY = 19;
/** Tuned by ear: the pour feels in sync when it starts this long before the first physical impact. */
const POUR_LEAD = 800;
const REJECTION_RED = new THREE.Color(0xff2038);

function litScene(background: number): THREE.Scene {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(background);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8a993, 2.1));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(-6, 14, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -22; sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -22;
    sun.shadow.bias = -0.0003;
    scene.add(sun);
    return scene;
}

export class SnapScene3D {
    readonly canvas: HTMLCanvasElement;
    private renderer: THREE.WebGLRenderer;
    private root: HTMLElement;
    private modelElement: HTMLElement;
    private pileElement: HTMLElement;
    private modelScene = litScene(0xfff9e9);
    private pileScene = litScene(0xf3ead5);
    private overlayScene = new THREE.Scene();
    private modelCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    private pileCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    private overlayCamera = new THREE.OrthographicCamera(0, 1, 1, 0, -100, 100);
    private modelGroup = new THREE.Group();
    private previewGallery: PreviewGallery | null = null;
    private world: RAPIER.World;
    private tray: TrayLayout = { width: 18, depth: 13, distance: 29 };
    private table: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> | null = null;
    private tableColliders: RAPIER.Collider[] = [];
    private level: SnapLevel | null = null;
    private order: SnapBrick[] = [];
    private placedIds: string[] = [];
    private loose = new Map<string, LooseBrick>();
    private staticMeshes = new Map<string, THREE.Group>();
    private ghost: THREE.Group | null = null;
    private ghostSolidMaterial: THREE.MeshStandardMaterial | null = null;
    private ghostWire: THREE.Group | null = null;
    private ghostWireMaterial: THREE.LineBasicMaterial | null = null;
    private ghostPulseStart = 0;
    private ghostBaseColor: THREE.Color | null = null;
    private ghostWireBaseColor: THREE.Color | null = null;
    private ghostRejectStart = -Infinity;
    private targetShimmer: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;
    private flights: Flight[] = [];
    private introQueue: SnapBrick[] = [];
    private introNext = 0;
    private introRainAt = Infinity;
    private mystery: THREE.Group | null = null;
    private reserve: SnapBrick[] = [];
    private nextRefill = 0;
    private introDone: (() => void) | null = null;
    private drag: Drag | null = null;
    private orbitPointer: number | null = null;
    private orbitLastX = 0;
    private yaw = Math.PI / 4;
    private restingYaw = Math.PI / 4;
    private orbiting = false;
    /** Whole finished model, shown while the intro plays. */
    private viewFullBox: Box | null = null;
    /** Grow-only region around what has been built, so the camera only ever zooms out mid-build. */
    private viewBox: Box | null = null;
    private view: FrameSphere = { x: 0, y: 2, z: 0, radius: 8 };
    private showcasing = false;
    private revealRemaining = 0;
    private showcaseAutoSpin = false;
    private showcaseBounds = new THREE.Sphere();
    private hintId = '';
    private hintUntil = 0;
    private hintMarker = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.08, 8, 40),
        new THREE.MeshBasicMaterial({ color: '#f3694e', depthTest: false }));
    private hintBeacon = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.25, 12),
        new THREE.MeshBasicMaterial({ color: '#f04d35', depthTest: false }));
    private lastFrame = performance.now();
    private accumulator = 0;
    private frame = 0;
    private resizeObserver: ResizeObserver;
    private onPlaced: (id: string) => void = () => {};
    private onWrong: () => void = () => {};
    private onAction: () => void = () => {};
    private onIntroBreakup: () => void = () => {};
    private onIntroRain: () => void = () => {};
    private onIntroCancel: () => void = () => {};
    private interactive = false;
    private playing = false;
    private placementPending = false;

    static async create(root: HTMLElement, modelElement: HTMLElement, pileElement: HTMLElement): Promise<SnapScene3D> {
        await RAPIER.init();
        return new SnapScene3D(root, modelElement, pileElement);
    }

    private constructor(root: HTMLElement, modelElement: HTMLElement, pileElement: HTMLElement) {
        this.root = root; this.modelElement = modelElement; this.pileElement = pileElement;
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true });
        this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
        this.renderer.shadowMap.enabled = true;
        this.renderer.autoClear = false;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.35;
        this.canvas = this.renderer.domElement;
        this.canvas.className = 'scene-canvas';
        root.prepend(this.canvas);
        this.modelScene.add(this.modelGroup);
        this.overlayScene.add(new THREE.HemisphereLight(0xffffff, 0x999999, 3));
        this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
        this.makeTable();
        this.hintMarker.rotation.x = Math.PI / 2;
        this.hintMarker.visible = false;
        this.hintMarker.renderOrder = 1000;
        this.pileScene.add(this.hintMarker);
        this.hintBeacon.rotation.z = Math.PI;
        this.hintBeacon.visible = false;
        this.hintBeacon.renderOrder = 1000;
        this.pileScene.add(this.hintBeacon);
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(root);
        this.resizeObserver.observe(modelElement);
        this.resizeObserver.observe(pileElement);
        this.modelElement.addEventListener('pointerdown', this.modelDown);
        this.modelElement.addEventListener('pointermove', this.modelMove);
        this.modelElement.addEventListener('pointerup', this.modelUp);
        this.modelElement.addEventListener('pointercancel', this.modelUp);
        this.pileElement.addEventListener('pointerdown', this.pileDown);
        this.pileElement.addEventListener('pointermove', this.pileMove);
        this.pileElement.addEventListener('pointerup', this.pileUp);
        this.pileElement.addEventListener('pointercancel', this.pileUp);
        this.resize();
        this.frame = requestAnimationFrame(this.animate);
    }

    private makeTable(): void {
        if (this.table) {
            this.table.removeFromParent();
            this.table.geometry.dispose();
            this.table.material.dispose();
        }
        for (const collider of this.tableColliders) this.world.removeCollider(collider, true);
        this.tableColliders = [];
        const table = new THREE.Mesh(new THREE.BoxGeometry(this.tray.width + 1, 0.45, this.tray.depth + 1),
            new THREE.MeshStandardMaterial({ color: '#eacfa4', roughness: 0.9 }));
        this.table = table;
        table.position.y = -0.29;
        table.receiveShadow = true;
        this.pileScene.add(table);
        const floor = RAPIER.ColliderDesc.cuboid((this.tray.width + 1) / 2, 0.2, (this.tray.depth + 1) / 2)
            .setTranslation(0, -0.2, 0).setFriction(0.8);
        this.tableColliders.push(this.world.createCollider(floor));
        const walls: [number, number, number, number, number, number][] = [
            [this.tray.width / 2 + 0.25, 3, 0, 0.25, 3, this.tray.depth / 2 + 1],
            [-this.tray.width / 2 - 0.25, 3, 0, 0.25, 3, this.tray.depth / 2 + 1],
            [0, 3, this.tray.depth / 2 + 0.25, this.tray.width / 2 + 1, 3, 0.25],
            [0, 3, -this.tray.depth / 2 - 0.25, this.tray.width / 2 + 1, 3, 0.25]
        ];
        for (const [x, y, z, hx, hy, hz] of walls) {
            this.tableColliders.push(this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z)));
        }
    }

    private resizeTray(): void {
        if (this.drag || this.pileElement.clientWidth < 1 || this.pileElement.clientHeight < 1) return;
        const minimumSpan = Math.max(8, ...this.order.map(brick => Math.hypot(brick.w, brick.d) + 1));
        const next = trayLayout(this.pileElement.clientWidth, this.pileElement.clientHeight, minimumSpan);
        if (Math.abs(next.width - this.tray.width) < .01 && Math.abs(next.depth - this.tray.depth) < .01) return;
        this.tray = next;
        this.makeTable();
        for (const item of this.loose.values()) {
            const old = item.body.translation();
            const point = trayPoint(next, item.brick, old.x, old.z);
            if (point.x !== old.x || point.z !== old.z) {
                item.body.setTranslation({ ...point, y: Math.max(old.y, 1) }, true);
                item.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
                item.mesh.position.copy(item.body.translation());
            }
        }
        for (const flight of this.flights) {
            if (flight.landingPosition) {
                const point = trayPoint(next, flight.brick, flight.landingPosition.x, flight.landingPosition.z);
                flight.landingPosition.x = point.x;
                flight.landingPosition.z = point.z;
            }
        }
    }

    private landingPoint(brick: SnapBrick, y: number): THREE.Vector3 {
        const tray = this.tray ?? { width: 18, depth: 13 };
        const margin = Math.hypot(brick.w, brick.d) / 2 + .25;
        const point = trayPoint(tray, brick,
            (Math.random() - .5) * Math.max(0, tray.width - margin * 2),
            (Math.random() - .5) * Math.max(0, tray.depth - margin * 2));
        return new THREE.Vector3(point.x, y, point.z);
    }

    setCallbacks(onPlaced: (id: string) => void, onWrong: () => void, onAction: () => void): void {
        this.onPlaced = onPlaced; this.onWrong = onWrong; this.onAction = onAction;
    }

    setIntroCallbacks(onBreakup: () => void, onRain: () => void, onCancel: () => void): void {
        this.onIntroBreakup = onBreakup; this.onIntroRain = onRain; this.onIntroCancel = onCancel;
    }

    setPreviews(track: HTMLElement, entries: { id: string; element: HTMLElement; level: SnapLevel; completed: boolean }[]): void {
        this.previewGallery?.destroy();
        this.canvas.hidden = true;
        this.renderer.setPixelRatio(1);
        this.renderer.setSize(1, 1, false);
        const backgrounds: Record<string, number> = {
            duck: 0xffdb61, apple: 0xffd9d3, pineapple: 0xe0ecc4,
            'sports-car': 0xffd7c5, castle: 0xe1d4fb
        };
        const collectionBackgrounds: Record<string, number> = {
            'land-animal': 0xe8dccb, fruit: 0xffe0d7, bird: 0xffedc3,
            car: 0xdbe5ed, landmarks: 0xe1d4fb, ocean: 0xcde9ec, dinosaur: 0xe2e5ca
        };
        const background = (entry: typeof entries[number]) =>
            backgrounds[entry.id] ?? collectionBackgrounds[entry.level.collection] ?? 0xcfe7f7;
        for (const entry of entries)
            entry.element.style.backgroundColor = `#${background(entry).toString(16)}`;
        this.previewGallery = new PreviewGallery(this.renderer, track, entries.map(entry => ({ element: entry.element, create: () => {
            const scene = litScene(background(entry));
            const data = entry.level;
            const model = entry.completed ? new THREE.Group() : mysteryModel(data);
            for (const brick of entry.completed ? data.bricks : []) {
                const mesh = brickMesh(brick, data.palette[brick.color]);
                mesh.position.copy(brickPosition(brick, data));
                model.add(mesh);
            }
            scene.add(model);
            const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
            const box = modelBox(data);
            const frame = boxSphere(box);
            // The locked silhouette's glow outline is drawn a little larger than the model.
            const margin = 1.1 * (entry.completed ? 1 : 1.08);
            const direction = viewDirection(Math.atan2(0.65, 0.85));
            let fittedAspect = 0, distance = 0;
            const fit = (fitted: THREE.PerspectiveCamera) => {
                if (fitted.aspect !== fittedAspect) {
                    fittedAspect = fitted.aspect;
                    distance = fitSpinningBox(box, frame, direction, fitted.fov, fitted.aspect, margin);
                }
                fitted.position.set(frame.x + direction.x * distance, frame.y + direction.y * distance,
                    frame.z + direction.z * distance);
                fitted.lookAt(frame.x, frame.y, frame.z);
            };
            fit(camera);
            return { element: entry.element, scene, camera, model, fit, dispose: () => {
                if (!entry.completed) disposeMystery(model);
                else for (const child of [...model.children]) disposeBrick(child as THREE.Group);
                scene.traverse(child => {
                    if (child instanceof THREE.DirectionalLight) child.shadow.dispose();
                });
            } };
        } })));
    }

    startLevel(level: SnapLevel, placedIds: string[], intro: boolean, onIntroDone: () => void): void {
        this.clearLevel();
        this.level = level;
        this.order = buildOrder(level);
        this.placedIds = [...placedIds];
        this.playing = true;
        this.canvas.hidden = false;
        this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
        this.resize();
        this.interactive = !intro;
        this.introDone = onIntroDone;
        this.viewFullBox = modelBox(level);
        this.viewBox = workingBox(level, this.order, placedIds.length);
        const placed = new Set(placedIds);
        const remaining = this.order.filter(brick => !placed.has(brick.id));
        const initialPile = pileAdditions([], remaining, this.order.slice(placedIds.length));
        const initialIds = new Set(initialPile.map(brick => brick.id));
        this.reserve = remaining.filter(brick => !initialIds.has(brick.id));
        // Saved IDs identify consumed pieces; built positions follow the build order.
        for (const brick of intro ? this.order : this.order.slice(0, placedIds.length)) {
            const mesh = brickMesh(brick, level.palette[brick.color]);
            mesh.position.copy(brickPosition(brick, level));
            mesh.visible = !intro;
            this.modelGroup.add(mesh);
            this.staticMeshes.set(brick.id, mesh);
        }
        if (intro) {
            this.mystery = mysteryModel(level);
            this.modelGroup.add(this.mystery);
            this.introQueue = this.order.filter(brick => !placed.has(brick.id)).reverse();
            this.introNext = performance.now() + (REDUCED_MOTION.matches ? 100 : 850);
        } else {
            for (const brick of initialPile) this.spawnLoose(brick, true);
            this.updateTarget();
            onIntroDone();
        }
        this.view = this.desiredView();
    }

    /** The intro shows the whole model; play frames only what has been built plus the next piece. */
    private desiredView(): FrameSphere {
        return boxSphere(this.interactive ? this.viewBox! : this.viewFullBox!);
    }

    private clearMystery(): void {
        if (this.mystery) disposeMystery(this.mystery);
        this.mystery = null;
    }

    private clearLevel(): void {
        this.onIntroCancel();
        this.showcasing = false;
        this.revealRemaining = 0;
        this.showcaseAutoSpin = false;
        if (this.orbitPointer !== null && this.modelElement.hasPointerCapture(this.orbitPointer))
            this.modelElement.releasePointerCapture(this.orbitPointer);
        this.orbitPointer = null;
        this.orbiting = false;
        this.yaw = this.restingYaw;
        this.clearMystery();
        if (this.drag) disposeBrick(this.drag.overlay);
        this.drag = null;
        for (const item of this.loose.values()) {
            this.world.removeRigidBody(item.body);
            disposeBrick(item.mesh);
        }
        this.loose.clear();
        for (const mesh of this.staticMeshes.values()) disposeBrick(mesh);
        this.staticMeshes.clear();
        for (const flight of this.flights) disposeBrick(flight.mesh);
        this.flights = [];
        this.clearTarget();
        this.introQueue = [];
        this.introRainAt = Infinity;
        this.reserve = [];
        this.nextRefill = 0;
        this.introDone = null;
        this.interactive = false;
        this.placementPending = false;
        this.hintId = '';
        this.hintMarker.visible = false;
        this.hintBeacon.visible = false;
    }

    leaveLevel(): void { this.playing = false; this.clearLevel(); this.level = null; }

    showcase(): void {
        this.showcasing = true;
        this.clearTarget();
        new THREE.Box3().setFromObject(this.modelGroup).getBoundingSphere(this.showcaseBounds);
        this.revealRemaining = REDUCED_MOTION.matches ? 0 : Math.PI * 2;
        this.showcaseAutoSpin = !REDUCED_MOTION.matches;
        this.resize();
    }

    rotateShowcase(amount: number): void {
        if (!this.showcasing) return;
        this.revealRemaining = 0;
        this.showcaseAutoSpin = false;
        this.yaw += amount;
    }

    resetShowcase(): void {
        if (!this.showcasing) return;
        this.revealRemaining = 0;
        this.showcaseAutoSpin = false;
        this.yaw = this.restingYaw;
    }

    private spawnLoose(brick: SnapBrick, intro = false, landingPosition?: THREE.Vector3): void {
        if (!this.level || this.loose.has(brick.id)) return;
        const index = this.order.findIndex(item => item.id === brick.id);
        const position = landingPosition ?? this.landingPoint(brick,
            intro ? 4.5 + (index % 4) * .4 : 1.2 + Math.floor(index / 9) * .9);
        const bounded = trayPoint(this.tray ?? { width: 18, depth: 13 }, brick, position.x, position.z);
        const { x, z } = bounded;
        const y = position.y;
        const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(x, y, z).setRotation({ x: 0, y: Math.sin(index * 0.47), z: 0,
                w: Math.cos(index * 0.47) })
            .setLinearDamping(0.24).setAngularDamping(0.45).setCcdEnabled(true));
        if (brick.kind === 'wheel') {
            const rotation = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(brick.w > brick.d ? 1 : 0, 0, brick.w > brick.d ? 0 : 1), Math.PI / 2);
            this.world.createCollider(RAPIER.ColliderDesc.cylinder(0.485, WHEEL_RADIUS)
                .setRotation(rotation).setTranslation(0, WHEEL_CENTER_Y, 0).setFriction(0.69).setRestitution(0.25), body);
        } else {
            this.world.createCollider(RAPIER.ColliderDesc.cuboid(brick.w / 2 - 0.03,
                BRICK_HEIGHT * (brick.h ?? 1) / 2, brick.d / 2 - 0.03).setFriction(0.69).setRestitution(0.25), body);
        }
        const mesh = brickMesh(brick, this.level.palette[brick.color]);
        mesh.userData.brickId = brick.id;
        mesh.position.set(x, y, z);
        this.pileScene.add(mesh);
        this.loose.set(brick.id, { brick, mesh, body });
    }

    skipIntro(): void {
        if (!this.playing || !this.level || this.interactive) return;
        this.onIntroCancel();
        this.introRainAt = Infinity;
        this.clearMystery();
        for (const flight of this.flights) disposeBrick(flight.mesh);
        this.flights = [];
        for (const mesh of this.staticMeshes.values()) disposeBrick(mesh);
        this.staticMeshes.clear();
        for (const brick of this.order) {
            if (!this.placedIds.includes(brick.id) && !this.reserve.includes(brick)) this.spawnLoose(brick);
        }
        this.introQueue = [];
        this.finishIntro();
    }

    snapNextPiece(): boolean {
        if (!this.playing || !this.interactive || this.drag || this.placementPending || !this.level) return false;
        const target = this.order[this.placedIds.length];
        if (!target) return false;
        const piece = [...this.loose.values()].find(item => pieceMatches(item.brick, target));
        let placedId: string;
        if (piece) {
            placedId = piece.brick.id;
            this.world.removeRigidBody(piece.body);
            this.loose.delete(placedId);
            disposeBrick(piece.mesh);
        } else {
            const reserveIndex = this.reserve.findIndex(brick => pieceMatches(brick, target));
            if (reserveIndex < 0) return false;
            placedId = this.reserve.splice(reserveIndex, 1)[0].id;
        }
        const mesh = brickMesh(target, this.level.palette[target.color]);
        mesh.position.copy(brickPosition(target, this.level));
        this.modelGroup.add(mesh);
        this.staticMeshes.set(target.id, mesh);
        this.placedIds.push(placedId);
        this.updateTarget();
        this.onPlaced(placedId);
        return true;
    }

    private finishIntro(): void {
        if (this.interactive) return;
        this.interactive = true;
        this.updateTarget();
        const callback = this.introDone;
        this.introDone = null;
        callback?.();
    }

    private clearTarget(): void {
        if (this.targetShimmer) {
            this.targetShimmer.geometry.dispose();
            this.targetShimmer.material.dispose();
        }
        this.targetShimmer = null;
        if (this.ghostWire) this.ghostWire.traverse(child => {
            if (child instanceof THREE.LineSegments) child.geometry.dispose();
        });
        this.ghostWireMaterial?.dispose();
        this.ghostWire = null;
        this.ghostWireMaterial = null;
        this.ghostSolidMaterial = null;
        this.ghostBaseColor = null;
        this.ghostWireBaseColor = null;
        this.ghostRejectStart = -Infinity;
        if (this.ghost) disposeBrick(this.ghost);
        this.ghost = null;
    }

    updateTarget(): void {
        this.clearTarget();
        if (!this.level) return;
        this.viewBox = workingBox(this.level, this.order, this.placedIds.length, this.viewBox);
        if (this.placedIds.length >= this.order.length) return;
        const target = this.order[this.placedIds.length];
        const color = this.level.palette[target.color];
        this.ghostBaseColor = new THREE.Color(color);
        const { h, s, l } = this.ghostBaseColor.getHSL({ h: 0, s: 0, l: 0 });
        const brightness = this.ghostBaseColor.r * 0.2126 + this.ghostBaseColor.g * 0.7152 +
            this.ghostBaseColor.b * 0.0722;
        this.ghostWireBaseColor = this.ghostBaseColor.clone().setHSL(h, s,
            brightness < 0.22 ? Math.min(0.85, l + 0.55) : Math.max(0.08, l * 0.35));
        this.ghost = brickMesh(target, color, true);
        this.ghostWire = new THREE.Group();
        this.ghostWireMaterial = new THREE.LineBasicMaterial({
            color: this.ghostWireBaseColor, transparent: true, opacity: 0.65,
            depthTest: false, depthWrite: false,
            toneMapped: false
        });
        this.ghost.traverse(child => {
            if (!(child instanceof THREE.Mesh)) return;
            this.ghostSolidMaterial = child.material as THREE.MeshStandardMaterial;
            this.ghostSolidMaterial.depthTest = false;
            child.renderOrder = 1;
            const wire = new THREE.LineSegments(new THREE.EdgesGeometry(child.geometry, 20),
                this.ghostWireMaterial!);
            wire.position.copy(child.position);
            wire.quaternion.copy(child.quaternion);
            wire.scale.copy(child.scale);
            wire.renderOrder = 3;
            this.ghostWire!.add(wire);
        });
        this.ghost.add(this.ghostWire);
        this.ghostPulseStart = performance.now();
        this.targetShimmer = new THREE.Mesh(
            new THREE.PlaneGeometry(target.w - 0.06, target.d - 0.06),
            new THREE.ShaderMaterial({
                uniforms: { shimmerProgress: { value: -1 } },
                vertexShader: `varying vec2 surfaceUv;
                    void main() {
                        surfaceUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }`,
                fragmentShader: `uniform float shimmerProgress;
                    varying vec2 surfaceUv;
                    void main() {
                        float diagonal = surfaceUv.x * 0.72 + surfaceUv.y * 0.28;
                        float bandCenter = mix(-0.18, 1.18, shimmerProgress);
                        float shine = shimmerProgress < 0.0 ? 0.0 :
                            pow(max(1.0 - abs(diagonal - bandCenter) / 0.15, 0.0), 2.0);
                        gl_FragColor = vec4(1.0, 0.98, 0.8, shine * 0.24);
                    }`,
                transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending
            }));
        this.targetShimmer.rotation.x = -Math.PI / 2;
        this.targetShimmer.position.y = BRICK_HEIGHT * (target.h ?? 1) / 2 + 0.004;
        this.targetShimmer.renderOrder = 2;
        this.ghost.add(this.targetShimmer);
        this.ghost.position.copy(brickPosition(target, this.level));
        this.modelGroup.add(this.ghost);
        const position = this.ghost.position;
        const options = [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
        this.restingYaw = options.reduce((best, yaw) =>
            Math.sin(yaw) * position.x + Math.cos(yaw) * position.z >
            Math.sin(best) * position.x + Math.cos(best) * position.z ? yaw : best, options[0]);
    }

    getRemaining(): number { return this.loose.size; }

    hint(): boolean {
        const target = this.order[this.placedIds.length];
        if (!target || !this.interactive) return false;
        const match = [...this.loose.values()].find(item => pieceMatches(item.brick, target));
        if (!match) return false;
        this.hintId = match.brick.id;
        this.hintUntil = performance.now() + 1700;
        match.body.applyImpulse({ x: 0, y: 2.5, z: 0 }, true);
        const center = match.body.translation();
        for (const item of this.loose.values()) {
            if (item === match) continue;
            const pos = item.body.translation();
            const dx = pos.x - center.x, dz = pos.z - center.z;
            const distance = Math.hypot(dx, dz);
            if (distance < 3 && distance > 0.01) item.body.applyImpulse({ x: dx / distance * 0.9,
                y: 0.6, z: dz / distance * 0.9 }, true);
        }
        return true;
    }

    private modelDown = (event: PointerEvent): void => {
        if (!this.playing || !this.interactive || event.button !== 0 || this.orbitPointer !== null) return;
        this.revealRemaining = 0;
        this.showcaseAutoSpin = false;
        this.orbitPointer = event.pointerId;
        this.orbitLastX = event.clientX;
        this.orbiting = true;
        this.modelElement.setPointerCapture(event.pointerId);
    };
    private modelMove = (event: PointerEvent): void => {
        if (this.orbitPointer !== event.pointerId) return;
        this.yaw -= (event.clientX - this.orbitLastX) * 0.01;
        this.orbitLastX = event.clientX;
    };
    private modelUp = (event: PointerEvent): void => {
        if (this.orbitPointer !== event.pointerId) return;
        this.orbitPointer = null;
        this.orbiting = false;
        if (this.modelElement.hasPointerCapture(event.pointerId)) this.modelElement.releasePointerCapture(event.pointerId);
    };

    private pilePoint(clientX: number, clientY: number): THREE.Vector3 {
        const rect = this.pileElement.getBoundingClientRect();
        const x = THREE.MathUtils.clamp((clientX - rect.left) / rect.width * 2 - 1, -1.2, 1.2);
        const y = THREE.MathUtils.clamp(-(clientY - rect.top) / rect.height * 2 + 1, -1.2, 1.2);
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(x, y), this.pileCamera);
        const point = new THREE.Vector3();
        ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.7), point);
        const bounded = trayPoint(this.tray, this.drag?.loose.brick ?? { w: 3, d: 3 }, point.x, point.z);
        point.x = bounded.x;
        point.z = bounded.z;
        return point;
    }

    private pileDown = (event: PointerEvent): void => {
        if (!this.playing || !this.interactive || event.button !== 0 || this.drag || this.placementPending) return;
        const rect = this.pileElement.getBoundingClientRect();
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
            -(event.clientY - rect.top) / rect.height * 2 + 1), this.pileCamera);
        const hits = ray.intersectObjects([...this.loose.values()].map(item => item.mesh), true);
        let picked: LooseBrick | undefined;
        for (const hit of hits) {
            let object: THREE.Object3D | null = hit.object;
            while (object && !object.userData.brickId) object = object.parent;
            picked = this.loose.get(object?.userData.brickId as string);
            if (picked) break;
        }
        if (!picked) return;
        this.onAction();
        event.preventDefault();
        this.pileElement.setPointerCapture(event.pointerId);
        picked.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
        picked.mesh.visible = false;
        const overlay = brickMesh(picked.brick, this.level!.palette[picked.brick.color]);
        // Preserve the visible pile pose before easing toward the model pose.
        overlay.quaternion.copy(overlayRotation(this.pileCamera, picked.mesh.quaternion));
        overlay.scale.setScalar(24);
        this.overlayScene.add(overlay);
        this.drag = { loose: picked, overlay, lastX: event.clientX, lastY: event.clientY,
            lastTime: performance.now(), velocityX: 0, velocityY: 0,
            rotationStart: performance.now(), fromRotation: overlay.quaternion.clone() };
        this.moveDrag(event);
    };

    private moveDrag(event: PointerEvent): void {
        if (!this.drag) return;
        const drag = this.drag;
        const rootRect = this.root.getBoundingClientRect();
        drag.overlay.position.copy(screenToOverlay(event.clientX - rootRect.left,
            event.clientY - rootRect.top, this.canvas.clientHeight));
        const now = performance.now();
        const dt = Math.max(16, now - drag.lastTime);
        drag.velocityX = (event.clientX - drag.lastX) / dt;
        drag.velocityY = (event.clientY - drag.lastY) / dt;
        drag.lastX = event.clientX; drag.lastY = event.clientY; drag.lastTime = now;
        const point = this.pilePoint(event.clientX, event.clientY);
        drag.loose.body.setNextKinematicTranslation(point);
    }
    private pileMove = (event: PointerEvent): void => {
        if (this.drag) { event.preventDefault(); this.moveDrag(event); }
    };
    private pileUp = (event: PointerEvent): void => {
        if (!this.drag) return;
        event.preventDefault();
        this.moveDrag(event);
        const drag = this.drag;
        this.drag = null;
        if (this.pileElement.hasPointerCapture(event.pointerId)) this.pileElement.releasePointerCapture(event.pointerId);
        const targetRect = this.modelElement.getBoundingClientRect();
        const overModel = event.clientX >= targetRect.left && event.clientX <= targetRect.right &&
            event.clientY >= targetRect.top && event.clientY <= targetRect.bottom;
        const target = this.order[this.placedIds.length];
        if (overModel && target) {
            const matches = pieceMatches(drag.loose.brick, target);
            this.placementPending = true;
            this.world.removeRigidBody(drag.loose.body);
            this.loose.delete(drag.loose.brick.id);
            disposeBrick(drag.loose.mesh);
            const destination = this.screenPoint(this.modelElement, this.modelCamera,
                brickPosition(target, this.level!));
            this.flights.push({ brick: drag.loose.brick, mesh: drag.overlay,
                from: overlayToScreen(drag.overlay.position, this.canvas.clientHeight),
                to: destination, start: performance.now(), duration: REDUCED_MOTION.matches ? 1 : 350,
                kind: matches ? 'placement' : 'rejection', fromRotation: drag.overlay.quaternion.clone() });
        } else {
            disposeBrick(drag.overlay);
            drag.loose.mesh.visible = true;
            const point = this.pilePoint(event.clientX, event.clientY);
            Object.assign(point, trayPoint(this.tray, drag.loose.brick, point.x, point.z));
            drag.loose.body.setTranslation(point, true);
            drag.loose.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
            drag.loose.body.setLinvel({ x: drag.velocityX * 4, y: 1.4,
                z: drag.velocityY * 3 }, true);
        }
        this.resizeTray();
    };

    private screenPoint(element: HTMLElement, camera: THREE.Camera, worldPoint: THREE.Vector3): THREE.Vector2 {
        const rect = element.getBoundingClientRect();
        const rootRect = this.root.getBoundingClientRect();
        const ndc = worldPoint.clone().project(camera);
        return new THREE.Vector2(rect.left - rootRect.left + (ndc.x + 1) * rect.width / 2,
            rect.top - rootRect.top + (1 - ndc.y) * rect.height / 2);
    }

    private targetOverlayRotation(brick: SnapBrick): THREE.Quaternion {
        const rotation = overlayRotation(this.modelCamera);
        const target = this.order[this.placedIds.length];
        if (target && pieceMatches(brick, target) && brick.w !== target.w) {
            rotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
        }
        return rotation;
    }

    private resize(): void {
        if (!this.playing) return;
        const width = Math.max(1, this.root.clientWidth);
        const height = Math.max(1, this.root.clientHeight);
        this.renderer.setSize(width, height, false);
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        configureOverlayCamera(this.overlayCamera, width, height);
        if (this.drag) {
            const rect = this.root.getBoundingClientRect();
            this.drag.overlay.position.copy(screenToOverlay(this.drag.lastX - rect.left,
                this.drag.lastY - rect.top, height));
        }
        this.modelCamera.aspect = Math.max(0.1, this.modelElement.clientWidth / Math.max(1, this.modelElement.clientHeight));
        this.modelCamera.updateProjectionMatrix();
        this.pileCamera.aspect = Math.max(0.1, this.pileElement.clientWidth / Math.max(1, this.pileElement.clientHeight));
        this.pileCamera.updateProjectionMatrix();
        this.resizeTray();
    }

    private renderRegion(element: HTMLElement, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
        const rect = element.getBoundingClientRect();
        const rootRect = this.root.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1 || rect.bottom < 0 || rect.top > innerHeight) return;
        const x = Math.round(rect.left - rootRect.left);
        const y = Math.round(this.canvas.clientHeight - (rect.bottom - rootRect.top));
        const width = Math.round(rect.width), height = Math.round(rect.height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        this.renderer.setViewport(x, y, width, height);
        this.renderer.setScissor(x, y, width, height);
        this.renderer.clear(true, true, true);
        this.renderer.render(scene, camera);
    }

    private animate = (now: number): void => {
        this.frame = requestAnimationFrame(this.animate);
        if (!this.playing) {
            this.lastFrame = now;
            this.previewGallery?.render(now);
            return;
        }
        const delta = Math.min(0.05, (now - this.lastFrame) / 1000);
        this.lastFrame = now;
        if (this.playing) {
            this.accumulator += delta;
            for (let steps = 0; this.accumulator >= 1 / 60 && steps < 3; steps++) {
                this.world.timestep = 1 / 60;
                this.world.step();
                this.accumulator -= 1 / 60;
            }
            for (const item of this.loose.values()) {
                const position = item.body.translation(), rotation = item.body.rotation();
                item.mesh.position.set(position.x, position.y, position.z);
                item.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
                if (position.y < -3 || Math.abs(position.x) > this.tray.width / 2 + 2 ||
                    Math.abs(position.z) > this.tray.depth / 2 + 2) {
                    item.body.setTranslation({ x: 0, y: 4, z: 0 }, true);
                    item.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
                }
                item.mesh.scale.setScalar(item.brick.id === this.hintId && now < this.hintUntil ?
                    1 + 0.075 * Math.sin(now / 80) : 1);
            }
            const hint = this.loose.get(this.hintId);
            this.hintMarker.visible = Boolean(hint && now < this.hintUntil);
            this.hintBeacon.visible = this.hintMarker.visible;
            if (hint && this.hintMarker.visible) {
                const position = hint.body.translation();
                const height = Math.max(3.5, position.y + 2.2);
                this.hintMarker.position.set(position.x, height, position.z);
                this.hintBeacon.position.set(position.x, height + 1.15 + Math.sin(now / 120) * 0.12, position.z);
                this.hintMarker.scale.setScalar(1 + 0.09 * Math.sin(now / 100));
            }
            if (this.showcasing && !this.orbiting && this.showcaseAutoSpin) {
                const easing = THREE.MathUtils.smoothstep(this.revealRemaining, 0, Math.PI);
                const speed = THREE.MathUtils.lerp(SHOWCASE_SLOW_SPIN, SHOWCASE_FAST_SPIN, easing);
                this.yaw += delta * speed;
                this.revealRemaining = Math.max(0, this.revealRemaining - delta * speed);
                if (REDUCED_MOTION.matches) this.showcaseAutoSpin = false;
            } else if (!this.orbiting && !this.showcasing) {
                const difference = Math.atan2(Math.sin(this.restingYaw - this.yaw), Math.cos(this.restingYaw - this.yaw));
                this.yaw += difference * Math.min(1, delta * 4.5);
            }
            // A held piece is projected against this camera, so the frame stays put until it is released.
            if (!this.drag) this.view = easeFrame(this.view, this.desiredView(), delta,
                REDUCED_MOTION.matches ? 0 : VIEW_EASE_SECONDS);
            const { center, radius } = this.showcaseBounds;
            const frame = this.showcasing ? { x: center.x, y: center.y, z: center.z, radius } : this.view;
            // Fit a bounding sphere so even a long model stays in frame at every angle.
            const direction = viewDirection(this.yaw);
            const distance = fitDistance(frame.radius, this.modelCamera.fov, this.modelCamera.aspect);
            this.modelCamera.position.set(frame.x + direction.x * distance, frame.y + direction.y * distance,
                frame.z + direction.z * distance);
            this.modelCamera.lookAt(frame.x, frame.y, frame.z);
            if (this.drag) {
                const turn = REDUCED_MOTION.matches ? 1 :
                    Math.min(1, (now - this.drag.rotationStart) / HELD_ROTATION_DURATION);
                const easedTurn = turn * turn * (3 - 2 * turn);
                this.drag.overlay.quaternion.copy(this.drag.fromRotation).slerp(
                    this.targetOverlayRotation(this.drag.loose.brick), easedTurn);
            }
            const pileDistance = this.tray.distance;
            this.pileCamera.position.set(0, pileDistance * 0.85, pileDistance * 0.72);
            this.pileCamera.lookAt(0, 0, 0);
            this.pileCamera.updateMatrixWorld();
            if (this.targetShimmer) {
                const shimmerElapsed = (now - this.ghostPulseStart) %
                    (SHIMMER_SWEEP_DURATION + SHIMMER_PAUSE_DURATION);
                this.targetShimmer.material.uniforms.shimmerProgress.value =
                    REDUCED_MOTION.matches || shimmerElapsed >= SHIMMER_SWEEP_DURATION ?
                        -1 : shimmerElapsed / SHIMMER_SWEEP_DURATION;
            }
            if (this.ghostSolidMaterial && this.ghostWireMaterial) {
                const blend = REDUCED_MOTION.matches ? 0.35 :
                    (1 - Math.cos((now - this.ghostPulseStart) * Math.PI * 2 / 3000)) / 2;
                this.ghostSolidMaterial.opacity = THREE.MathUtils.lerp(0.88, 0.58, blend);
                this.ghostWireMaterial.opacity = THREE.MathUtils.lerp(0.65, 1, blend);
                const rejectStrength = Math.max(0, 1 - (now - this.ghostRejectStart) / REJECTION_FLASH_DURATION);
                this.ghostSolidMaterial.color.copy(this.ghostBaseColor!).lerp(REJECTION_RED, rejectStrength);
                this.ghostSolidMaterial.emissive.copy(REJECTION_RED);
                this.ghostSolidMaterial.emissiveIntensity = rejectStrength * 1.3;
                this.ghostWireMaterial.color.copy(this.ghostWireBaseColor!).lerp(REJECTION_RED, rejectStrength);
            }
            this.advanceIntro(now);
            this.advanceFlights(now);
            this.refillPile(now);
        }
        this.renderer.setScissorTest(false);
        this.renderer.setClearColor(0xffffff, 0);
        this.renderer.clear(true, true, true);
        this.renderer.setScissorTest(true);
        if (this.playing && !this.modelElement.hidden) {
            this.renderRegion(this.modelElement, this.modelScene, this.modelCamera);
            this.renderRegion(this.pileElement, this.pileScene, this.pileCamera);
        }
        if (this.flights.length || this.drag) {
            const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
            fitOverlayDepth(this.overlayCamera, this.overlayScene);
            this.renderer.setViewport(0, 0, width, height);
            this.renderer.setScissor(0, 0, width, height);
            this.renderer.render(this.overlayScene, this.overlayCamera);
        }
        this.renderer.setScissorTest(false);
    };

    private refillPile(now: number): void {
        if (!this.interactive || this.drag || this.placementPending || now < this.nextRefill) return;
        const active = [...this.loose.values()].map(item => item.brick);
        const brick = pileAdditions(active, this.reserve, this.order.slice(this.placedIds.length))[0];
        if (!brick) return;
        this.reserve.splice(this.reserve.indexOf(brick), 1);
        const height = Math.max(6, ...[...this.loose.values()].map(item => item.body.translation().y + 2));
        this.spawnLoose(brick, true, this.landingPoint(brick, height));
        this.nextRefill = now + 220;
    }

    private advanceIntro(now: number): void {
        if (!this.introQueue.length || !this.level) return;
        if (now < this.introNext) return;
        this.clearMystery();
        if (REDUCED_MOTION.matches) { this.skipIntro(); return; }
        this.onIntroBreakup();
        const count = this.introQueue.length;
        for (let index = 0; index < count; index++) {
            const brick = this.introQueue.shift()!;
            const modelMesh = this.staticMeshes.get(brick.id);
            if (!modelMesh) continue;
            const from = this.screenPoint(this.modelElement, this.modelCamera, modelMesh.position);
            disposeBrick(modelMesh);
            this.staticMeshes.delete(brick.id);
            const landingPosition = this.landingPoint(brick, 3.5 + Math.random() * 2);
            const to = this.screenPoint(this.pileElement, this.pileCamera, landingPosition);
            const mesh = brickMesh(brick, this.level.palette[brick.color]);
            mesh.quaternion.copy(overlayRotation(this.modelCamera, modelMesh.quaternion));
            mesh.scale.setScalar(24);
            this.overlayScene.add(mesh);
            const duration = 720 + Math.random() * 360;
            // The flight hands the brick to physics mid-air; its first impact comes after a free fall to the table.
            const drop = Math.max(0, landingPosition.y - BRICK_HEIGHT * (brick.h ?? 1) / 2);
            this.introRainAt = Math.min(this.introRainAt,
                now + duration + Math.sqrt(2 * drop / GRAVITY) * 1000 - POUR_LEAD);
            this.flights.push({ brick, mesh, from, to, start: now,
                duration, kind: 'intro', landingPosition,
                fromRotation: mesh.quaternion.clone(), arcHeight: 90 + Math.random() * 100,
                arcSide: (Math.random() - 0.5) * 180,
                spin: new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3,
                    (Math.random() - 0.5) * 1.5) });
        }
    }

    private advanceFlights(now: number): void {
        if (now >= this.introRainAt) {
            this.introRainAt = Infinity;
            this.onIntroRain();
        }
        for (let index = this.flights.length - 1; index >= 0; index--) {
            const flight = this.flights[index];
            if (flight.landingPosition) {
                flight.to.copy(this.screenPoint(this.pileElement, this.pileCamera, flight.landingPosition));
            } else if (this.level && this.order[this.placedIds.length]) {
                flight.to.copy(this.screenPoint(this.modelElement, this.modelCamera,
                    brickPosition(this.order[this.placedIds.length], this.level)));
            }
            const t = Math.min(1, (now - flight.start) / flight.duration);
            const eased = flight.kind === 'intro' ? 1 - Math.pow(1 - t, 2) : flight.kind === 'return' ? t * t * t * (t * (t * 6 - 15) + 10) :
                t * t * (3 - 2 * t);
            const arc = flight.kind === 'intro' ? Math.sin(Math.PI * t) * flight.arcHeight! : flight.kind === 'return' ?
                Math.pow(Math.sin(Math.PI * t), 1.5) * 130 : Math.sin(Math.PI * t) * 55;
            flight.mesh.position.copy(screenToOverlay(THREE.MathUtils.lerp(flight.from.x, flight.to.x, eased) +
                (flight.arcSide ?? 0) * Math.sin(Math.PI * t),
                THREE.MathUtils.lerp(flight.from.y, flight.to.y, eased) - arc,
                this.canvas.clientHeight));
            if (flight.kind === 'placement' || flight.kind === 'rejection') flight.mesh.quaternion.copy(flight.fromRotation!).slerp(
                this.targetOverlayRotation(flight.brick), eased);
            else if (flight.kind === 'return') flight.mesh.quaternion.copy(flight.fromRotation!).slerp(
                overlayRotation(this.pileCamera), eased);
            else {
                const spin = flight.spin!;
                flight.mesh.quaternion.copy(flight.fromRotation!).multiply(new THREE.Quaternion().setFromEuler(
                    new THREE.Euler(spin.x * t, spin.y * t, spin.z * t)));
                flight.mesh.scale.setScalar(24 * Math.min(1, t / 0.12));
            }
            if (t < 1) continue;
            if (flight.kind === 'rejection') {
                const landingPosition = this.landingPoint(flight.brick, 3.6);
                flight.kind = 'return';
                flight.from.copy(flight.to);
                flight.to.copy(this.screenPoint(this.pileElement, this.pileCamera, landingPosition));
                flight.start = now;
                flight.duration = REDUCED_MOTION.matches ? 1 : 900;
                flight.fromRotation = flight.mesh.quaternion.clone();
                flight.landingPosition = landingPosition;
                this.ghostRejectStart = now;
                this.onWrong();
                continue;
            }
            disposeBrick(flight.mesh);
            this.flights.splice(index, 1);
            if (flight.kind === 'placement') {
                const target = this.order[this.placedIds.length];
                if (target && this.level) {
                    const mesh = brickMesh(target, this.level.palette[target.color]);
                    mesh.position.copy(brickPosition(target, this.level));
                    this.modelGroup.add(mesh);
                    this.staticMeshes.set(target.id, mesh);
                    this.placedIds.push(flight.brick.id);
                    this.placementPending = false;
                    this.updateTarget();
                    this.onPlaced(flight.brick.id);
                }
            } else if (flight.kind === 'return') {
                this.spawnLoose(flight.brick, true, flight.landingPosition);
                this.placementPending = false;
            } else if (!this.reserve.includes(flight.brick)) {
                this.spawnLoose(flight.brick, true, flight.landingPosition);
            }
        }
        if (this.playing && !this.interactive && this.introQueue.length === 0 &&
            this.flights.length === 0 && this.loose.size > 0) this.finishIntro();
    }

    destroy(): void {
        cancelAnimationFrame(this.frame);
        this.resizeObserver.disconnect();
        this.modelElement.removeEventListener('pointerdown', this.modelDown);
        this.modelElement.removeEventListener('pointermove', this.modelMove);
        this.modelElement.removeEventListener('pointerup', this.modelUp);
        this.modelElement.removeEventListener('pointercancel', this.modelUp);
        this.pileElement.removeEventListener('pointerdown', this.pileDown);
        this.pileElement.removeEventListener('pointermove', this.pileMove);
        this.pileElement.removeEventListener('pointerup', this.pileUp);
        this.pileElement.removeEventListener('pointercancel', this.pileUp);
        this.clearLevel();
        this.previewGallery?.destroy();
        this.table?.geometry.dispose();
        this.table?.material.dispose();
        this.world.free();
        this.renderer.dispose();
        this.canvas.remove();
    }
}
