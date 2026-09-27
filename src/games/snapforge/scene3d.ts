import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { brickMesh, brickPosition, BRICK_HEIGHT, disposeBrick } from './brick3d';
import { buildOrder, pieceMatches, pileAdditions, SnapBrick, SnapLevel } from './level';
import { configureOverlayCamera, overlayRotation, overlayToScreen, screenToOverlay } from './overlay3d';

interface LooseBrick { brick: SnapBrick; mesh: THREE.Group; body: RAPIER.RigidBody; }
interface Flight { brick: SnapBrick; mesh: THREE.Group; from: THREE.Vector2; to: THREE.Vector2;
    start: number; duration: number; kind: 'intro' | 'placement' | 'rejection' | 'return';
    fromRotation?: THREE.Quaternion; landingPosition?: THREE.Vector3; }
interface Preview { element: HTMLElement; scene: THREE.Scene; camera: THREE.PerspectiveCamera; model: THREE.Group;
    dispose: () => void; }
interface Drag { loose: LooseBrick; overlay: THREE.Group; lastX: number; lastY: number;
    lastTime: number; velocityX: number; velocityY: number;
    rotationStart: number; fromRotation: THREE.Quaternion; }

const TABLE_WIDTH = 18;
const TABLE_DEPTH = 13;
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');
const HELD_ROTATION_DURATION = 850;
const SHIMMER_SWEEP_DURATION = 500;
const SHIMMER_PAUSE_DURATION = 5000;
const REJECTION_FLASH_DURATION = 420;
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

function previewBricks(id: string): { bricks: SnapBrick[]; palette: Record<string, string> } {
    const rows: [number, number, number, number, number, string][] = id === 'race-car' ? [
        [0, 0, 0, 6, 3, 'red'], [1, 0, 1, 4, 3, 'red'], [2, 0, 2, 2, 3, 'cream']
    ] : id === 'rocket' ? [
        [1, 1, 0, 3, 3, 'blue'], [1, 1, 1, 3, 3, 'cream'], [1, 1, 2, 3, 3, 'cream'],
        [1, 1, 3, 3, 3, 'red'], [2, 2, 4, 1, 1, 'red'], [0, 1, 0, 1, 3, 'red'], [4, 1, 0, 1, 3, 'red']
    ] : [
        [0, 0, 0, 7, 2, 'purple'], [0, 3, 0, 7, 2, 'purple'], [0, 2, 0, 2, 1, 'purple'],
        [5, 2, 0, 2, 1, 'purple'], [0, 0, 1, 2, 2, 'lavender'], [5, 0, 1, 2, 2, 'lavender'],
        [0, 3, 1, 2, 2, 'lavender'], [5, 3, 1, 2, 2, 'lavender'], [0, 0, 2, 2, 2, 'purple'],
        [5, 0, 2, 2, 2, 'purple'], [0, 3, 2, 2, 2, 'purple'], [5, 3, 2, 2, 2, 'purple']
    ];
    return { bricks: rows.map(([x, y, z, w, d, color], index) => ({ id: `${id}-${index}`, x, y, z, w, d, color })),
        palette: { red: '#f05248', cream: '#fff2dc', dark: '#303d55', blue: '#5279c9',
            purple: '#9171d8', lavender: '#c5a5f7' } };
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
    private previewTargets: Preview[] = [];
    private world: RAPIER.World;
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
    private reserve: SnapBrick[] = [];
    private nextRefill = 0;
    private introDone: (() => void) | null = null;
    private drag: Drag | null = null;
    private orbitPointer: number | null = null;
    private orbitLastX = 0;
    private yaw = Math.PI / 4;
    private restingYaw = Math.PI / 4;
    private orbiting = false;
    private targetHeight = 2;
    private modelRadius = 18;
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
    private interactive = false;
    private playing = false;
    private placementPending = false;

    static async create(root: HTMLElement, modelElement: HTMLElement, pileElement: HTMLElement): Promise<SnapScene3D> {
        await RAPIER.init();
        return new SnapScene3D(root, modelElement, pileElement);
    }

    private constructor(root: HTMLElement, modelElement: HTMLElement, pileElement: HTMLElement) {
        this.root = root; this.modelElement = modelElement; this.pileElement = pileElement;
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
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
        this.world = new RAPIER.World({ x: 0, y: -19, z: 0 });
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
        const table = new THREE.Mesh(new THREE.BoxGeometry(TABLE_WIDTH + 1, 0.45, TABLE_DEPTH + 1),
            new THREE.MeshStandardMaterial({ color: '#eacfa4', roughness: 0.9 }));
        table.position.y = -0.29;
        table.receiveShadow = true;
        this.pileScene.add(table);
        const floor = RAPIER.ColliderDesc.cuboid((TABLE_WIDTH + 1) / 2, 0.2, (TABLE_DEPTH + 1) / 2)
            .setTranslation(0, -0.2, 0).setFriction(0.8);
        this.world.createCollider(floor);
        const walls: [number, number, number, number, number, number][] = [
            [TABLE_WIDTH / 2 + 0.25, 3, 0, 0.25, 3, TABLE_DEPTH / 2 + 1],
            [-TABLE_WIDTH / 2 - 0.25, 3, 0, 0.25, 3, TABLE_DEPTH / 2 + 1],
            [0, 3, TABLE_DEPTH / 2 + 0.25, TABLE_WIDTH / 2 + 1, 3, 0.25],
            [0, 3, -TABLE_DEPTH / 2 - 0.25, TABLE_WIDTH / 2 + 1, 3, 0.25]
        ];
        for (const [x, y, z, hx, hy, hz] of walls) {
            this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z));
        }
    }

    setCallbacks(onPlaced: (id: string) => void, onWrong: () => void, onAction: () => void): void {
        this.onPlaced = onPlaced; this.onWrong = onWrong; this.onAction = onAction;
    }

    setPreviews(entries: { id: string; element: HTMLElement; level?: SnapLevel; completed: boolean }[]): void {
        for (const preview of this.previewTargets) preview.dispose();
        this.previewTargets = entries.map(entry => {
            const geometries = new Set<THREE.BufferGeometry>();
            const materials = new Set<THREE.Material>();
            const scene = litScene(entry.id === 'duck' ? 0xffdb61 : entry.id === 'race-car' ? 0xffd7c5 :
                entry.id === 'rocket' ? 0xcfe7f7 : 0xe1d4fb);
            const model = new THREE.Group();
            const data = entry.level ?? previewBricks(entry.id);
            const proxy = { bricks: data.bricks } as SnapLevel;
            for (const brick of data.bricks) {
                const mesh = brickMesh(brick, data.palette[brick.color]);
                mesh.position.copy(brickPosition(brick, proxy));
                model.add(mesh);
            }
            if (entry.id === 'race-car' && !entry.level) {
                const tireGeometry = new THREE.CylinderGeometry(0.59, 0.59, 0.38, 20);
                const tireMaterial = new THREE.MeshStandardMaterial({ color: '#263247', roughness: 0.78 });
                const hubGeometry = new THREE.CylinderGeometry(0.28, 0.28, 0.4, 20);
                const hubMaterial = new THREE.MeshStandardMaterial({ color: '#d9e2e5', metalness: 0.2, roughness: 0.45 });
                geometries.add(tireGeometry); geometries.add(hubGeometry);
                materials.add(tireMaterial); materials.add(hubMaterial);
                for (const x of [-1.9, 1.9]) for (const side of [-1, 1]) {
                    const tire = new THREE.Mesh(tireGeometry, tireMaterial);
                    tire.rotation.x = Math.PI / 2;
                    tire.position.set(x, 0.5, side * 1.62);
                    tire.castShadow = true;
                    model.add(tire);
                    const hub = new THREE.Mesh(hubGeometry, hubMaterial);
                    hub.rotation.x = Math.PI / 2;
                    hub.position.set(x, 0.5, side * 1.66);
                    model.add(hub);
                }
            }
            if (!entry.completed) {
                const material = new THREE.LineBasicMaterial({ color: '#596879' });
                const hiddenSurface = new THREE.MeshBasicMaterial({ visible: false });
                materials.add(material);
                materials.add(hiddenSurface);
                const edges = new Map<THREE.BufferGeometry, THREE.EdgesGeometry>();
                // Outline the bricks and studs without revealing their solid colors.
                model.traverse(child => {
                    if (!(child instanceof THREE.Mesh)) return;
                    let geometry = edges.get(child.geometry);
                    if (!geometry) {
                        geometry = new THREE.EdgesGeometry(child.geometry, 20);
                        edges.set(child.geometry, geometry);
                        geometries.add(geometry);
                    }
                    child.add(new THREE.LineSegments(geometry, material));
                    // Hide only the mesh surface; its outline remains visible.
                    child.material = hiddenSurface;
                    child.castShadow = false;
                    child.receiveShadow = false;
                });
            }
            scene.add(model);
            const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
            const maxWidth = Math.max(...data.bricks.map(brick => brick.x + brick.w));
            const maxDepth = Math.max(...data.bricks.map(brick => brick.y + brick.d));
            const maxHeight = Math.max(...data.bricks.map(brick => brick.z + 1)) * BRICK_HEIGHT;
            const radius = Math.max(maxWidth, maxDepth, maxHeight * 1.6) * 1.8;
            camera.position.set(radius * 0.65, radius * 0.62, radius * 0.85);
            camera.lookAt(0, maxHeight / 2, 0);
            return { element: entry.element, scene, camera, model, dispose: () => {
                for (const geometry of geometries) geometry.dispose();
                for (const material of materials) material.dispose();
                scene.traverse(child => {
                    if (child instanceof THREE.DirectionalLight) child.shadow.dispose();
                });
            } };
        });
    }

    startLevel(level: SnapLevel, placedIds: string[], intro: boolean, onIntroDone: () => void): void {
        this.clearLevel();
        this.level = level;
        this.order = buildOrder(level);
        this.placedIds = [...placedIds];
        this.playing = true;
        this.interactive = !intro;
        this.introDone = onIntroDone;
        const maxWidth = Math.max(...level.bricks.map(brick => brick.x + brick.w));
        const maxDepth = Math.max(...level.bricks.map(brick => brick.y + brick.d));
        const maxHeight = Math.max(...level.bricks.map(brick => brick.z + 1)) * BRICK_HEIGHT;
        this.targetHeight = maxHeight / 2;
        this.modelRadius = Math.max(maxWidth, maxDepth, maxHeight * 1.7) * 1.9;
        const placed = new Set(placedIds);
        const remaining = this.order.filter(brick => !placed.has(brick.id));
        const initialPile = pileAdditions([], remaining);
        const initialIds = new Set(initialPile.map(brick => brick.id));
        this.reserve = remaining.filter(brick => !initialIds.has(brick.id));
        // Saved IDs identify consumed pieces; built positions follow the build order.
        for (const brick of intro ? this.order : this.order.slice(0, placedIds.length)) {
            const mesh = brickMesh(brick, level.palette[brick.color]);
            mesh.position.copy(brickPosition(brick, level));
            this.modelGroup.add(mesh);
            this.staticMeshes.set(brick.id, mesh);
        }
        if (intro) {
            this.introQueue = this.order.filter(brick => !placed.has(brick.id)).reverse();
            this.introNext = performance.now() + (REDUCED_MOTION.matches ? 100 : 850);
        } else {
            for (const brick of initialPile) this.spawnLoose(brick, true);
            this.updateTarget();
            onIntroDone();
        }
    }

    private clearLevel(): void {
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

    private spawnLoose(brick: SnapBrick, intro = false, landingPosition?: THREE.Vector3): void {
        if (!this.level || this.loose.has(brick.id)) return;
        const index = this.order.findIndex(item => item.id === brick.id);
        const x = landingPosition?.x ?? ((index * 7) % 13 - 6) * 0.9 + (Math.random() - 0.5) * 0.4;
        const z = landingPosition?.z ?? ((index * 11) % 9 - 4) * 0.9 + (Math.random() - 0.5) * 0.4;
        const y = landingPosition?.y ?? (intro ? 4.5 + (index % 4) * 0.4 : 1.2 + Math.floor(index / 9) * 0.9);
        const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(x, y, z).setRotation({ x: 0, y: Math.sin(index * 0.47), z: 0,
                w: Math.cos(index * 0.47) })
            .setLinearDamping(0.24).setAngularDamping(0.45).setCcdEnabled(true));
        this.world.createCollider(RAPIER.ColliderDesc.cuboid(brick.w / 2 - 0.03,
            BRICK_HEIGHT / 2, brick.d / 2 - 0.03).setFriction(0.69).setRestitution(0.25), body);
        const mesh = brickMesh(brick, this.level.palette[brick.color]);
        mesh.userData.brickId = brick.id;
        mesh.position.set(x, y, z);
        this.pileScene.add(mesh);
        this.loose.set(brick.id, { brick, mesh, body });
    }

    skipIntro(): void {
        if (!this.playing || !this.level || this.interactive) return;
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
        if (!this.level || this.placedIds.length >= this.order.length) return;
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
        this.targetShimmer.position.y = BRICK_HEIGHT / 2 + 0.004;
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
        if (!this.playing || !this.interactive) return;
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
        point.x = THREE.MathUtils.clamp(point.x, -TABLE_WIDTH / 2 + 2, TABLE_WIDTH / 2 - 2);
        point.z = THREE.MathUtils.clamp(point.z, -TABLE_DEPTH / 2 + 2, TABLE_DEPTH / 2 - 2);
        return point;
    }

    private pileDown = (event: PointerEvent): void => {
        if (!this.playing || !this.interactive || this.drag || this.placementPending) return;
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
            drag.loose.body.setTranslation(point, true);
            drag.loose.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
            drag.loose.body.setLinvel({ x: drag.velocityX * 4, y: 1.4,
                z: drag.velocityY * 3 }, true);
        }
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
        const width = Math.max(1, this.root.clientWidth);
        const height = Math.max(1, this.root.scrollHeight);
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
                if (position.y < -3 || Math.abs(position.x) > TABLE_WIDTH / 2 + 2 ||
                    Math.abs(position.z) > TABLE_DEPTH / 2 + 2) {
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
            if (!this.orbiting) {
                const difference = Math.atan2(Math.sin(this.restingYaw - this.yaw), Math.cos(this.restingYaw - this.yaw));
                this.yaw += difference * Math.min(1, delta * 4.5);
            }
            const angle = this.yaw;
            const aspect = Math.max(0.45, this.modelCamera.aspect);
            const radius = this.modelRadius * Math.max(1, 0.95 / aspect);
            this.modelCamera.position.set(Math.sin(angle) * radius, this.targetHeight + radius * 0.62,
                Math.cos(angle) * radius);
            this.modelCamera.lookAt(0, this.targetHeight, 0);
            if (this.drag) {
                const turn = REDUCED_MOTION.matches ? 1 :
                    Math.min(1, (now - this.drag.rotationStart) / HELD_ROTATION_DURATION);
                const easedTurn = turn * turn * (3 - 2 * turn);
                this.drag.overlay.quaternion.copy(this.drag.fromRotation).slerp(
                    this.targetOverlayRotation(this.drag.loose.brick), easedTurn);
            }
            const pileAspect = Math.max(0.35, this.pileCamera.aspect);
            const pileDistance = Math.max(22, 29 / pileAspect);
            this.pileCamera.position.set(0, pileDistance * 0.85, pileDistance * 0.72);
            this.pileCamera.lookAt(0, 0, 0);
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
        for (const preview of this.previewTargets) preview.model.rotation.y = REDUCED_MOTION.matches ? 0.35 : now * 0.00021;
        this.renderer.setScissorTest(false);
        this.renderer.setClearColor(0xffffff, 0);
        this.renderer.clear(true, true, true);
        this.renderer.setScissorTest(true);
        if (this.playing && !this.modelElement.hidden) {
            this.renderRegion(this.modelElement, this.modelScene, this.modelCamera);
            this.renderRegion(this.pileElement, this.pileScene, this.pileCamera);
        } else for (const preview of this.previewTargets) {
            if (preview.element.offsetParent) this.renderRegion(preview.element, preview.scene, preview.camera);
        }
        if (this.flights.length || this.drag) {
            const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
            this.renderer.setViewport(0, 0, width, height);
            this.renderer.setScissor(0, 0, width, height);
            this.renderer.render(this.overlayScene, this.overlayCamera);
        }
        this.renderer.setScissorTest(false);
    };

    private refillPile(now: number): void {
        if (!this.interactive || this.drag || this.placementPending || now < this.nextRefill) return;
        const active = [...this.loose.values()].map(item => item.brick);
        const brick = pileAdditions(active, this.reserve)[0];
        if (!brick) return;
        this.reserve.splice(this.reserve.indexOf(brick), 1);
        const height = Math.max(6, ...[...this.loose.values()].map(item => item.body.translation().y + 2));
        this.spawnLoose(brick, true, new THREE.Vector3(
            (Math.random() - 0.5) * 2, height, (Math.random() - 0.5) * 2));
        this.nextRefill = now + 220;
    }

    private advanceIntro(now: number): void {
        if (!this.introQueue.length || !this.level) return;
        const delay = REDUCED_MOTION.matches ? 3 : 65;
        const count = Math.min(this.introQueue.length, now >= this.introNext ?
            Math.floor((now - this.introNext) / delay) + 1 : 0);
        this.introNext += count * delay;
        for (let index = 0; index < count; index++) {
            const brick = this.introQueue.shift()!;
            const modelMesh = this.staticMeshes.get(brick.id);
            if (!modelMesh) continue;
            const from = this.screenPoint(this.modelElement, this.modelCamera, modelMesh.position);
            disposeBrick(modelMesh);
            this.staticMeshes.delete(brick.id);
            if (this.reserve.includes(brick)) continue;
            const pileRect = this.pileElement.getBoundingClientRect();
            const rootRect = this.root.getBoundingClientRect();
            const to = new THREE.Vector2(pileRect.left - rootRect.left + pileRect.width * (0.36 + Math.random() * 0.28),
                pileRect.top - rootRect.top + pileRect.height * (0.30 + Math.random() * 0.2));
            const mesh = brickMesh(brick, this.level.palette[brick.color]);
            mesh.quaternion.copy(overlayRotation(this.modelCamera, modelMesh.quaternion));
            mesh.scale.setScalar(24);
            this.overlayScene.add(mesh);
            this.flights.push({ brick, mesh, from, to, start: now,
                duration: REDUCED_MOTION.matches ? 1 : 500, kind: 'intro' });
        }
    }

    private advanceFlights(now: number): void {
        for (let index = this.flights.length - 1; index >= 0; index--) {
            const flight = this.flights[index];
            const t = Math.min(1, (now - flight.start) / flight.duration);
            const eased = flight.kind === 'return' ? t * t * t * (t * (t * 6 - 15) + 10) :
                t * t * (3 - 2 * t);
            const arc = flight.kind === 'return' ?
                Math.pow(Math.sin(Math.PI * t), 1.5) * 130 : Math.sin(Math.PI * t) * 55;
            flight.mesh.position.copy(screenToOverlay(THREE.MathUtils.lerp(flight.from.x, flight.to.x, eased),
                THREE.MathUtils.lerp(flight.from.y, flight.to.y, eased) - arc,
                this.canvas.clientHeight));
            if (flight.kind === 'placement' || flight.kind === 'rejection') flight.mesh.quaternion.copy(flight.fromRotation!).slerp(
                this.targetOverlayRotation(flight.brick), eased);
            else if (flight.kind === 'return') flight.mesh.quaternion.copy(flight.fromRotation!).slerp(
                overlayRotation(this.pileCamera), eased);
            else flight.mesh.rotation.y += 0.035;
            if (t < 1) continue;
            if (flight.kind === 'rejection') {
                const landingPosition = new THREE.Vector3((Math.random() - 0.5) * 6, 3.6,
                    (Math.random() - 0.5) * 4);
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
            } else this.spawnLoose(flight.brick, true);
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
        for (const preview of this.previewTargets) preview.dispose();
        this.world.free();
        this.renderer.dispose();
        this.canvas.remove();
    }
}
