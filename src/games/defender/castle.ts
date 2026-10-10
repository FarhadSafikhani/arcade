import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createWater, emblemMaterial, gateWoodMaterial, textured, type Surface } from './look';
import { LAYOUT } from './tuning';

/** Greybox palette, pulled from the reference paintings. */
export const PALETTE = {
    sky: 0x7ec8ef,
    horizon: 0xf6e2b0,
    fog: 0xc9e6f4,
    stone: 0xe7d5b6,
    stoneDark: 0xc6b08e,
    stoneFloor: 0xddd0b2,
    bridge: 0xe4d6b8,
    water: 0x2ec8d8,
    grass: 0x6fbf45,
    grassDark: 0x4f9a38,
    dirt: 0xc9a46a,
    wood: 0x7a4f2c,
    gateWood: 0x6b4426,
    iron: 0x3d3a38,
    banner: 0xb8282e,
    bannerMark: 0xf1e6cf,
    leaf: 0x56a03c,
    pine: 0x2f6f3a,
    trunk: 0x6d4a2a,
    rock: 0x9c978e,
    flame: 0xffa733,
    flameCore: 0xffe08a,
} as const;

export interface CastleScene {
    gate: THREE.Group;
    gateMaterial: THREE.MeshStandardMaterial;
    flames: THREE.Object3D[];
    update(seconds: number): void;
}

type Vec3 = readonly [number, number, number];

interface BuildContext {
    root: THREE.Group;
    physics: RAPIER.World;
}

const SURFACES = new Map<number, Surface>([
    [PALETTE.stone, 'stone'],
    [PALETTE.stoneDark, 'stone'],
    [PALETTE.stoneFloor, 'paver'],
    [PALETTE.bridge, 'paver'],
    [PALETTE.rock, 'stone'],
    [PALETTE.grass, 'grass'],
    [PALETTE.grassDark, 'grass'],
    [PALETTE.leaf, 'foliage'],
    [PALETTE.pine, 'foliage'],
    [PALETTE.dirt, 'dirt'],
    [PALETTE.wood, 'wood'],
    [PALETTE.trunk, 'wood'],
    [PALETTE.gateWood, 'wood'],
    [PALETTE.banner, 'cloth'],
    [PALETTE.iron, 'iron'],
]);

function material(color: number): THREE.MeshStandardMaterial {
    return textured(color, SURFACES.get(color) ?? 'flat');
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);

function block(context: BuildContext, size: Vec3, center: Vec3, color: number | THREE.Material,
    options: { collide?: boolean; shadow?: boolean; parent?: THREE.Object3D; rotationY?: number } = {}): THREE.Mesh {
    const mesh = new THREE.Mesh(unitBox, typeof color === 'number' ? material(color) : color);
    mesh.scale.set(...size);
    mesh.position.set(...center);
    mesh.rotation.y = options.rotationY ?? 0;
    mesh.castShadow = options.shadow ?? true;
    mesh.receiveShadow = true;
    (options.parent ?? context.root).add(mesh);
    if (options.collide ?? true) {
        const description = RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2).setTranslation(...center);
        if (options.rotationY) {
            const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), options.rotationY);
            description.setRotation({ x: turn.x, y: turn.y, z: turn.z, w: turn.w });
        }
        context.physics.createCollider(description);
    }
    return mesh;
}

function cylinder(context: BuildContext, radius: number, bottom: number, top: number, x: number, z: number,
    color: number, options: { collide?: boolean; segments?: number; radiusTop?: number } = {}): THREE.Mesh {
    const height = top - bottom;
    const geometry = new THREE.CylinderGeometry(options.radiusTop ?? radius, radius, height, options.segments ?? 28);
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.position.set(x, bottom + height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    context.root.add(mesh);
    if (options.collide ?? true) {
        context.physics.createCollider(RAPIER.ColliderDesc.cylinder(height / 2, radius)
            .setTranslation(x, bottom + height / 2, z));
    }
    return mesh;
}

/** Battlement teeth along a straight wall top. */
function merlonRow(context: BuildContext, from: readonly [number, number], to: readonly [number, number],
    baseY: number, depth: number, height = 0.6): void {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const count = Math.floor(length / LAYOUT.merlonSpacing);
    const alongX = Math.abs(to[0] - from[0]) >= Math.abs(to[1] - from[1]);
    for (let index = 0; index < count; index++) {
        const t = (index + 0.5) / count;
        const x = from[0] + (to[0] - from[0]) * t;
        const z = from[1] + (to[1] - from[1]) * t;
        const size: Vec3 = alongX ? [LAYOUT.merlonWidth, height, depth] : [depth, height, LAYOUT.merlonWidth];
        block(context, size, [x, baseY + height / 2, z], PALETTE.stone);
    }
}

function towerCrown(context: BuildContext, x: number, z: number, radius: number, top: number): void {
    const count = 10;
    for (let index = 0; index < count; index++) {
        const angle = (index / count) * Math.PI * 2;
        const merlon = block(context, [0.85, 0.7, 0.45],
            [x + Math.cos(angle) * (radius - 0.25), top + 0.35, z + Math.sin(angle) * (radius - 0.25)], PALETTE.stone);
        merlon.rotation.y = -angle + Math.PI / 2;
    }
}

/** A pole with a flag hanging from a crossbar. `reach` is the flag's offset along X from the pole. */
function banner(context: BuildContext, x: number, z: number, baseY: number, poleHeight: number, reach: number): void {
    cylinder(context, 0.06, baseY, baseY + poleHeight, x, z, PALETTE.wood, { collide: false, segments: 8 });
    const flag = new THREE.Group();
    flag.position.set(x + reach, baseY + poleHeight - 0.15, z);
    context.root.add(flag);
    block(context, [Math.abs(reach) + 0.5, 0.06, 0.06], [-reach / 2, 0, 0], PALETTE.wood, { collide: false, parent: flag });
    block(context, [0.8, 1.5, 0.04], [0, -0.8, 0], emblemMaterial(), { collide: false, parent: flag });
    context.physics.createCollider(RAPIER.ColliderDesc.cuboid(0.07, poleHeight / 2, 0.07)
        .setTranslation(x, baseY + poleHeight / 2, z));
}

function wallBanner(context: BuildContext, x: number, top: number, z: number): void {
    block(context, [1.0, 2.4, 0.05], [x, top - 1.2, z], emblemMaterial(), { collide: false });
}

function brazier(context: BuildContext, x: number, y: number, z: number, flames: THREE.Object3D[]): void {
    cylinder(context, 0.08, y, y + 0.7, x, z, PALETTE.iron, { collide: false, segments: 8 });
    cylinder(context, 0.22, y + 0.7, y + 0.95, x, z, PALETTE.iron, { collide: false, radiusTop: 0.34, segments: 12 });
    const glow = new THREE.PointLight(0xff9a3a, 1.6, 7, 2);
    glow.position.set(x, y + 1.2, z);
    context.root.add(glow);
    const flame = new THREE.Group();
    flame.position.set(x, y + 0.95, z);
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 8), new THREE.MeshBasicMaterial({ color: PALETTE.flame }));
    outer.position.y = 0.27;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.32, 8), new THREE.MeshBasicMaterial({ color: PALETTE.flameCore }));
    inner.position.y = 0.17;
    flame.add(outer, inner);
    context.root.add(flame);
    flames.push(flame);
}

/** Small deterministic generator so scenery is identical on every load. */
function seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const canopyGeometry = new THREE.IcosahedronGeometry(1, 0);
const coneGeometry = new THREE.ConeGeometry(1, 1, 7);
const trunkGeometry = new THREE.CylinderGeometry(0.18, 0.26, 1, 6);
const rockGeometry = new THREE.DodecahedronGeometry(1, 0);

function tree(context: BuildContext, x: number, z: number, scale: number, pine: boolean): void {
    const trunk = new THREE.Mesh(trunkGeometry, material(PALETTE.trunk));
    trunk.scale.set(scale, scale * (pine ? 1.2 : 1.8), scale);
    trunk.position.set(x, 0.15 + trunk.scale.y / 2, z);
    trunk.castShadow = true;
    context.root.add(trunk);
    if (pine) {
        for (let tier = 0; tier < 3; tier++) {
            const cone = new THREE.Mesh(coneGeometry, material(PALETTE.pine));
            const size = scale * (1.7 - tier * 0.4);
            cone.scale.set(size, scale * 1.9, size);
            cone.position.set(x, 0.15 + scale * (1.9 + tier * 1.05), z);
            cone.castShadow = true;
            context.root.add(cone);
        }
    } else {
        const canopy = new THREE.Mesh(canopyGeometry, material(PALETTE.leaf));
        canopy.scale.set(scale * 1.7, scale * 1.5, scale * 1.7);
        canopy.position.set(x, 0.15 + scale * 3.1, z);
        canopy.castShadow = true;
        context.root.add(canopy);
    }
}

function rock(context: BuildContext, x: number, z: number, scale: number, turn: number): void {
    const mesh = new THREE.Mesh(rockGeometry, material(PALETTE.rock));
    mesh.scale.set(scale * 1.3, scale, scale);
    mesh.rotation.set(turn, turn * 2, 0);
    mesh.position.set(x, 0.1, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    context.root.add(mesh);
}

function skyDome(): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(320, 24, 12);
    const colors: number[] = [];
    const top = new THREE.Color(PALETTE.sky);
    const bottom = new THREE.Color(PALETTE.horizon);
    const position = geometry.getAttribute('position');
    const color = new THREE.Color();
    for (let index = 0; index < position.count; index++) {
        const height = THREE.MathUtils.clamp(position.getY(index) / 320, 0, 1);
        color.copy(bottom).lerp(top, Math.pow(height, 0.6));
        colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
}

function addLights(scene: THREE.Scene): void {
    // Sun high behind the archer's left shoulder, so the bridge and goblins face the light.
    scene.add(new THREE.HemisphereLight(0xfff6e4, 0x7faf58, 1.55));
    const sun = new THREE.DirectionalLight(0xfff1d4, 2.65);
    sun.position.set(-30, 55, 24);
    sun.target.position.set(0, 0, -12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const extent = 34;
    sun.shadow.camera.left = -extent; sun.shadow.camera.right = extent;
    sun.shadow.camera.top = extent; sun.shadow.camera.bottom = -extent;
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 140;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
}

/**
 * Builds the castle, bridge, moat, banks, and courtyard as a greybox blockout.
 * Every surface an arrow can stick in gets a fixed Rapier collider. The water has none.
 */
export function buildCastle(scene: THREE.Scene, physics: RAPIER.World): CastleScene {
    const root = new THREE.Group();
    scene.add(root);
    const context: BuildContext = { root, physics };
    const flames: THREE.Object3D[] = [];
    const front = LAYOUT.wallFrontZ;
    const back = LAYOUT.wallBackZ;
    const wallTop = LAYOUT.walkwayY;
    const footing = LAYOUT.waterY - 1;
    const outer = 30;
    const courtyardEnd = back + LAYOUT.courtyardDepth;
    const bridgeEnd = front - LAYOUT.bridgeLength;

    scene.background = new THREE.Color(PALETTE.sky);
    scene.fog = new THREE.Fog(PALETTE.fog, 90, 260);
    scene.add(skyDome());
    addLights(scene);

    const water = createWater(LAYOUT.waterY);
    root.add(water.mesh);

    // Banks around the moat. Top surface sits at y = 0.15.
    block(context, [500, 3, 200], [0, -1.35, bridgeEnd - 100], PALETTE.grass, { shadow: false });
    for (const side of [-1, 1]) block(context, [200, 3, 260], [side * (46 + 100), -1.35, 60], PALETTE.grass, { shadow: false });
    block(context, [92, 3, 120], [0, -1.35, courtyardEnd + 18 + 60], PALETTE.grass, { shadow: false });
    block(context, [8.4, 0.04, 90], [0, 0.17, bridgeEnd - 45], PALETTE.dirt, { collide: false, shadow: false });
    block(context, [14, 0.03, 6], [0, 0.165, bridgeEnd - 3], PALETTE.dirt, { collide: false, shadow: false });

    const random = seededRandom(7);
    for (let index = 0; index < 70; index++) {
        const x = (random() < 0.5 ? -1 : 1) * (5.5 + random() * 40);
        rock(context, x, bridgeEnd - 0.4 - random() * 1.4, 0.5 + random() * 0.9, random() * 3);
    }
    for (let index = 0; index < 90; index++) {
        const x = (random() < 0.5 ? -1 : 1) * (9 + random() * 110);
        const z = bridgeEnd - 6 - random() * 90;
        tree(context, x, z, 0.8 + random() * 0.7, random() < 0.45);
    }
    for (const side of [-1, 1]) {
        for (let index = 0; index < 26; index++) {
            tree(context, side * (50 + random() * 40), bridgeEnd + random() * 90, 0.8 + random() * 0.6, random() < 0.5);
        }
        for (let post = 0; post < 9; post++) {
            const z = bridgeEnd - 3 - post * 2.6;
            block(context, [0.16, 1.1, 0.16], [side * 5.6, 0.7, z], PALETTE.wood, { collide: false });
            if (post > 0) block(context, [0.08, 0.12, 2.6], [side * 5.6, 0.95, z + 1.3], PALETTE.wood, { collide: false });
        }
    }

    // Bridge deck, piers, rails, and banner posts.
    const bridgeCenter = front - LAYOUT.bridgeLength / 2;
    const width = LAYOUT.bridgeHalfWidth * 2;
    block(context, [width, 0.6, LAYOUT.bridgeLength], [0, -0.3, bridgeCenter], PALETTE.bridge);
    for (let pier = 1; pier < 6; pier++) {
        const z = front - pier * 6;
        block(context, [width + 0.6, -0.6 - footing, 1.4], [0, (footing - 0.6) / 2, z], PALETTE.stoneDark);
    }
    for (const side of [-1, 1]) {
        const x = side * (LAYOUT.bridgeHalfWidth + 0.2);
        block(context, [0.4, LAYOUT.railHeight, LAYOUT.bridgeLength], [x, LAYOUT.railHeight / 2, bridgeCenter], PALETTE.stone);
        for (const z of [front - 12, front - 24, bridgeEnd + 0.35]) {
            block(context, [0.7, 1.2, 0.7], [x, 0.6, z], PALETTE.stoneDark);
        }
        banner(context, x, front - 14, LAYOUT.railHeight, 3.2, side * 0.6);
        banner(context, x, front - 30, LAYOUT.railHeight, 3.2, side * 0.6);
    }

    // Front curtain wall. Its top is the walkway.
    block(context, [outer * 2, wallTop - footing, back - front], [0, (wallTop + footing) / 2, (front + back) / 2], PALETTE.stone);
    block(context, [outer * 2 + 0.2, 0.8, 0.3], [0, LAYOUT.waterY + 0.25, front - 0.05], PALETTE.stoneDark, { collide: false });
    block(context, [LAYOUT.walkwayHalfLength * 2, 0.02, back - 0.3], [0, wallTop + 0.01, (back - 0.3) / 2], PALETTE.stoneFloor,
        { collide: false, shadow: false });

    // Front parapet, with a gap where each tower joins the walkway.
    const parapetZ = (front + LAYOUT.parapetInnerZ) / 2;
    const parapetDepth = 0.4;
    const mouth = Math.sqrt(Math.max(0, LAYOUT.towerRadius ** 2 - (parapetZ - LAYOUT.towerZ) ** 2));
    const gapNear = LAYOUT.towerX - mouth;
    const gapFar = LAYOUT.towerX + mouth;
    const merlonRise = LAYOUT.merlonHeight - LAYOUT.crenelHeight;
    for (const [from, to] of [[-outer, -gapFar], [-gapNear, gapNear], [gapFar, outer]] as const) {
        if (to - from < 0.4) continue;
        block(context, [to - from, LAYOUT.crenelHeight, parapetDepth],
            [(from + to) / 2, wallTop + LAYOUT.crenelHeight / 2, parapetZ], PALETTE.stone);
        for (let x = from + LAYOUT.merlonSpacing / 2; x < to; x += LAYOUT.merlonSpacing) {
            block(context, [LAYOUT.merlonWidth, merlonRise, parapetDepth],
                [x, wallTop + LAYOUT.crenelHeight + merlonRise / 2, parapetZ], PALETTE.stone);
        }
    }
    block(context, [LAYOUT.walkwayHalfLength * 2, 0.9, 0.3], [0, wallTop + 0.45, back - 0.15], PALETTE.stone);

    // The gate, framed by a stone arch, with banners on either side.
    const gate = new THREE.Group();
    root.add(gate);
    const gateMaterial = gateWoodMaterial();
    block(context, [LAYOUT.gateHalfWidth * 2, LAYOUT.gateHeight, 0.16], [0, LAYOUT.gateHeight / 2, front - 0.08], gateMaterial, { parent: gate });
    for (const y of [0.8, 1.8, 2.8]) {
        block(context, [LAYOUT.gateHalfWidth * 2 + 0.05, 0.12, 0.03], [0, y, front - 0.17], PALETTE.iron, { collide: false, parent: gate });
    }
    for (const side of [-1, 1]) {
        block(context, [0.6, LAYOUT.gateHeight + 0.6, 0.4], [side * (LAYOUT.gateHalfWidth + 0.3), (LAYOUT.gateHeight + 0.6) / 2, front - 0.1], PALETTE.stoneDark);
        wallBanner(context, side * 3.6, wallTop - 0.4, front - 0.03);
    }
    block(context, [LAYOUT.gateHalfWidth * 2 + 1.2, 0.6, 0.4], [0, LAYOUT.gateHeight + 0.3, front - 0.1], PALETTE.stoneDark);

    // Open towers at walkway height, projecting over the moat on either side of the bridge.
    for (const side of [-1, 1]) flankTower(context, side, footing, wallTop, flames);
    brazier(context, -3.5, wallTop, 0.55, flames);
    brazier(context, 3.5, wallTop, 0.55, flames);

    // Courtyard behind the walkway: ground, enclosing walls, corner towers, keep, stairs.
    block(context, [outer * 2, 1, courtyardEnd - back], [0, -0.5, (back + courtyardEnd) / 2], PALETTE.stoneFloor, { shadow: false });
    const sideHeight = 4.2;
    for (const side of [-1, 1]) {
        const x = side * (outer - 0.8);
        block(context, [1.6, sideHeight - footing, courtyardEnd - front], [x, (sideHeight + footing) / 2, (front + courtyardEnd) / 2], PALETTE.stone);
        merlonRow(context, [x, back], [x, courtyardEnd], sideHeight, 0.5);
        for (const z of [1.6, courtyardEnd]) {
            cylinder(context, 2.6, footing, 7.5, side * outer, z, PALETTE.stone);
            towerCrown(context, side * outer, z, 2.6, 7.5);
        }
        for (let step = 0; step < 8; step++) {
            const height = wallTop - step * (wallTop / 8);
            block(context, [2, height, 0.62], [side * 6.5, height / 2, back + 0.31 + step * 0.62], PALETTE.stoneDark);
        }
        for (let barrel = 0; barrel < 3; barrel++) {
            cylinder(context, 0.4, 0, 0.9, side * (20 + barrel * 0.9), back + 3 + (barrel % 2) * 0.8, PALETTE.wood, { segments: 10 });
        }
        tree(context, side * 13, back + 12, 0.9, true);
        tree(context, side * 19, back + 30, 1.0, true);
        const tent = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.2, 4), material(PALETTE.banner));
        tent.position.set(side * 18, 1.1, back + 18);
        tent.rotation.y = Math.PI / 4;
        tent.castShadow = true;
        root.add(tent);
    }
    block(context, [outer * 2, sideHeight - footing, 1.6], [0, (sideHeight + footing) / 2, courtyardEnd], PALETTE.stone);
    merlonRow(context, [-outer, courtyardEnd], [outer, courtyardEnd], sideHeight, 0.5);
    const keepZ = back + 24;
    block(context, [12, 6.5, 10], [0, 3.25, keepZ], PALETTE.stone);
    merlonRow(context, [-6, keepZ - 5], [6, keepZ - 5], 6.5, 0.5);
    merlonRow(context, [-6, keepZ + 5], [6, keepZ + 5], 6.5, 0.5);
    block(context, [1.8, 2.6, 0.1], [0, 1.3, keepZ - 5.03], PALETTE.gateWood, { collide: false });
    wallBanner(context, 0, 6.1, keepZ - 5.04);
    banner(context, 0, keepZ, 6.5, 3.4, 0.6);

    // Lily pads at the foot of the wall, as in the references.
    const padMaterial = material(PALETTE.grassDark);
    const padGeometry = new THREE.CylinderGeometry(0.45, 0.45, 0.04, 10);
    for (let index = 0; index < 22; index++) {
        const pad = new THREE.Mesh(padGeometry, padMaterial);
        const side = random() < 0.5 ? -1 : 1;
        pad.position.set(side * (6 + random() * 18), LAYOUT.waterY + 0.03, front - 0.8 - random() * 5);
        pad.scale.setScalar(0.6 + random() * 0.7);
        pad.receiveShadow = true;
        root.add(pad);
    }

    const bloomMaterial = material(0xf4e7a8);
    const petalMaterial = material(0xf2f6ea);
    const bloom = new THREE.SphereGeometry(0.16, 6, 5);
    for (let index = 0; index < 48; index++) {
        const flower = new THREE.Mesh(bloom, index % 3 === 0 ? petalMaterial : bloomMaterial);
        const side = random() < 0.5 ? -1 : 1;
        flower.position.set(side * (8 + random() * 36), 0.22, bridgeEnd - 4 - random() * 28);
        flower.scale.setScalar(0.6 + random() * 0.8);
        flower.castShadow = false;
        root.add(flower);
    }

    return { gate, gateMaterial, flames, update: seconds => water.update(seconds) };
}

/** A round fighting platform you can walk onto, low on the side that faces the gate. */
function flankTower(context: BuildContext, side: number, footing: number, top: number, flames: THREE.Object3D[]): void {
    const x = side * LAYOUT.towerX;
    const z = LAYOUT.towerZ;
    const radius = LAYOUT.towerRadius;
    cylinder(context, radius, footing, top, x, z, PALETTE.stone);
    cylinder(context, radius + 0.16, LAYOUT.waterY - 0.15, LAYOUT.waterY + 0.5, x, z, PALETTE.stoneDark, { collide: false });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(radius - 0.04, 28), material(PALETTE.stoneFloor));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, top + 0.025, z);
    floor.receiveShadow = true;
    context.root.add(floor);

    const count = 14;
    const radial = radius - 0.2;
    for (let index = 0; index < count; index++) {
        const angle = (index / count) * Math.PI * 2;
        const px = x + Math.cos(angle) * radial;
        const pz = z + Math.sin(angle) * radial;
        const south = Math.sin(angle) > 0.15;
        const overWalkway = Math.abs(px) < LAYOUT.walkwayHalfLength - 0.3;
        if (south && overWalkway) continue;
        const outward = Math.cos(angle) * side;
        const tall = outward > 0.45 && Math.sin(angle) > -0.35;
        const height = tall ? 1.02 : 0.46;
        block(context, [0.78, height, 0.46], [px, top + height / 2, pz], PALETTE.stone,
            { rotationY: Math.PI / 2 - angle });
    }
    banner(context, x + side * (radius - 0.85), z + 0.15, top, 2.6, side * 0.55);
    brazier(context, x + side * 1.15, top, z - 0.35, flames);
}
