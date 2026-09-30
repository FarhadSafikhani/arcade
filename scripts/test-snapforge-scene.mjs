// Niche scene checks: meshes, physics, and intro timing. Not part of `npm run test:snapforge`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const source = readFileSync(resolve('src/games/snapforge/level.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }
}).outputText;
const { validateLevel } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const duck = JSON.parse(readFileSync(resolve('src/games/snapforge/levels/duck.json'), 'utf8'));
const catalog = readdirSync(resolve('src/games/snapforge/levels')).filter(name => name.endsWith('.json'))
    .map(name => validateLevel(JSON.parse(readFileSync(resolve('src/games/snapforge/levels', name), 'utf8'))))
    .sort((a, b) => a.collection.localeCompare(b.collection) || a.order - b.order);

const unit = { id: 'base', x: 0, y: 0, z: 0, w: 2, d: 1, color: 'yellow' };
const heightLevel = bricks => ({ id: 'height-test', title: 'Height test', description: '',
    collection: 'starter', order: 1, version: 1, targetParts: bricks.length, vetted: 0, palette: { yellow: '#FFD233' }, bricks });

const moduleUrls = new Map();
function sceneModule(name) {
    if (moduleUrls.has(name)) return moduleUrls.get(name);
    let js = ts.transpileModule(readFileSync(resolve(`src/games/snapforge/${name}.ts`), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }
    }).outputText;
    js = js.replace(/from '([^']+)'/g, (_, specifier) =>
        `from '${specifier.endsWith('.mp3') ? assetModule(specifier)
            : specifier.startsWith('./') ? sceneModule(specifier.slice(2)) : import.meta.resolve(specifier)}'`);
    const url = `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
    moduleUrls.set(name, url);
    return url;
}
function assetModule(specifier) {
    return `data:text/javascript;base64,${Buffer.from(`export default ${JSON.stringify(specifier)};`).toString('base64')}`;
}
const reducedMotion = { matches: false };
globalThis.matchMedia = () => reducedMotion;
globalThis.devicePixelRatio = 1;
const { SnapScene3D } = await import(sceneModule('scene3d'));
const THREE = await import('three');
const { brickMesh, brickPosition, BRICK_HEIGHT } = await import(sceneModule('brick3d'));
const { trayPoint } = await import(sceneModule('tray-layout'));

function sceneHarness() {
    const scene = Object.create(SnapScene3D.prototype);
    Object.assign(scene, {
        clearLevel() {}, resize() {}, canvas: {}, renderer: { setPixelRatio() {} }, modelGroup: new THREE.Group(), staticMeshes: new Map(),
        loose: new Map(), flights: [], updateTarget() {},
        onIntroBreakup() {}, onIntroRain() {}, onIntroCancel() {}, introRainAt: Infinity,
        spawnLoose(brick) { this.loose.set(brick.id, { brick }); }
    });
    return scene;
}

test('height-2 meshes share the original bottom and top bounds with studs only on top', () => {
    const short = brickMesh(unit, '#FFD233');
    const tallBrick = { ...unit, h: 2, z: 3 };
    const level = heightLevel([tallBrick]);
    const tall = brickMesh(tallBrick, '#FFD233');
    assert.notEqual(short.children[0].geometry, tall.children[0].geometry);
    assert.equal(tall.children.length, 1 + unit.w * unit.d);
    assert.equal(brickPosition(tallBrick, level).y, 4 * BRICK_HEIGHT);
    for (const [mesh, h] of [[short, 1], [tall, 2]]) {
        const body = mesh.children[0];
        body.geometry.computeBoundingBox();
        const size = body.geometry.boundingBox.getSize(new THREE.Vector3());
        assert.ok(Math.abs(size.y - (h * BRICK_HEIGHT - 0.035)) < 1e-6);
        assert.ok(Math.abs(size.x - (unit.w - 0.045)) < 1e-6);
        for (const stud of mesh.children.slice(1)) {
            assert.ok(Math.abs(stud.position.y - (h * BRICK_HEIGHT / 2 + 0.06)) < 1e-6);
        }
    }
    const ghost = brickMesh(tallBrick, '#FFD233', true);
    assert.equal(ghost.children[0].geometry, tall.children[0].geometry);
    assert.ok(ghost.children[0].material.transparent);
});

test('wheel meshes have round tires and hubs in both orientations, including ghosts', async () => {
    const wheel = { ...unit, kind: 'wheel', w: 3, d: 1, h: 3 };
    for (const part of [wheel, { ...wheel, w: 1, d: 3 }]) {
        const mesh = brickMesh(part, '#202735');
        const ghost = brickMesh(part, '#202735', true);
        assert.equal(mesh.children[0].geometry.type, 'CylinderGeometry');
        assert.equal(mesh.children[1].geometry.type, 'CylinderGeometry');
        assert.ok(ghost.children.every(child => child.material.transparent));
        const bounds = new THREE.Box3().setFromObject(mesh);
        const size = bounds.getSize(new THREE.Vector3());
        assert.ok(Math.abs(size.x - (part.w === 3 ? 2.6 : 0.97)) < 0.01);
        assert.ok(Math.abs(size.z - (part.d === 3 ? 2.6 : 0.97)) < 0.01);
        assert.ok(Math.abs(bounds.min.y + 1.34) < 0.01);
        assert.equal(mesh.children.length, 3);
        assert.ok(mesh.children.every(child => child.geometry.type === 'CylinderGeometry'));
        assert.ok(Math.abs((bounds.min.y + bounds.max.y) / 2 + 0.04) < 1e-6);
    }
    const { default: RAPIER } = await import('@dimforge/rapier3d-compat');
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -19, z: 0 });
    try {
        world.createCollider(RAPIER.ColliderDesc.cuboid(10, 0.1, 10).setTranslation(0, -0.1, 0));
        const scene = Object.create(SnapScene3D.prototype);
        Object.assign(scene, { world, level: heightLevel([wheel]), order: [wheel],
            loose: new Map(), pileScene: new THREE.Scene() });
        scene.spawnLoose(wheel, false, new THREE.Vector3(0, 3, 0));
        const body = scene.loose.get(wheel.id).body;
        assert.equal(body.numColliders(), 1);
        assert.equal(body.collider(0).shapeType(), RAPIER.ShapeType.Cylinder);
        for (let i = 0; i < 240; i++) world.step();
        const mesh = scene.loose.get(wheel.id).mesh;
        mesh.position.copy(body.translation());
        mesh.quaternion.copy(body.rotation());
        const bottom = new THREE.Box3().setFromObject(mesh, true).min.y;
        assert.ok(bottom > -0.06, `wheel penetrated the floor by ${-bottom}`);
    } finally { world.free(); }
});

test('height-2 pile colliders match the tall body and rest above the floor', async () => {
    const { default: RAPIER } = await import('@dimforge/rapier3d-compat');
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -19, z: 0 });
    try {
        world.createCollider(RAPIER.ColliderDesc.cuboid(10, 0.1, 10).setTranslation(0, -0.1, 0));
        const brick = { ...unit, h: 2 };
        const scene = Object.create(SnapScene3D.prototype);
        Object.assign(scene, { world, level: heightLevel([brick]), order: [brick],
            loose: new Map(), pileScene: new THREE.Scene() });
        scene.spawnLoose(brick, false, new THREE.Vector3(0, 3, 0));
        const body = scene.loose.get(brick.id).body;
        assert.ok(Math.abs(body.collider(0).halfExtents().y - BRICK_HEIGHT) < 1e-6);
        for (let i = 0; i < 240; i++) world.step();
        assert.ok(Math.abs(body.translation().y - BRICK_HEIGHT) < 0.04);
    } finally {
        world.free();
    }
});

test('height-2 mystery volumes and camera framing include the top layer', async () => {
    const { mysteryModel, disposeMystery } = await import(sceneModule('mystery3d'));
    const brick = { ...unit, h: 2 };
    const level = heightLevel([brick]);
    const mystery = mysteryModel(level);
    const fill = mystery.children[0];
    fill.geometry.computeBoundingBox();
    assert.ok(Math.abs(fill.geometry.boundingBox.max.y + fill.position.y - 2 * BRICK_HEIGHT) < 1e-6);
    assert.ok(Math.abs(fill.geometry.boundingBox.min.y + fill.position.y) < 1e-6);
    disposeMystery(mystery);
    const scene = sceneHarness();
    scene.startLevel(level, [], false, () => {});
    assert.ok(scene.viewBox.max.y >= 2 * BRICK_HEIGHT);
    assert.ok(scene.viewFullBox.max.y >= 2 * BRICK_HEIGHT);
});

test('the intro frames the whole model, then play frames only what is built', () => {
    const bigBen = catalog.find(level => level.id === 'big-ben');
    const scene = sceneHarness();
    scene.startLevel(bigBen, [], true, () => {});
    const introRadius = scene.view.radius;
    assert.equal(scene.desiredView().radius, introRadius);
    scene.finishIntro();
    assert.ok(scene.desiredView().radius < introRadius / 2);
});

test('mystery intro hides finished bricks and launches every piece in one burst', () => {
    for (const level of catalog) {
        const scene = sceneHarness();
        const cues = [];
        scene.setIntroCallbacks(() => cues.push('breakup'), () => cues.push('rain'), () => cues.push('cancel'));
        Object.assign(scene, {
            modelCamera: new THREE.PerspectiveCamera(), pileCamera: new THREE.PerspectiveCamera(),
            overlayScene: new THREE.Scene(), canvas: { clientHeight: 800 },
            screenPoint() { return new THREE.Vector2(200, 200); }
        });
        let finished = 0;
        scene.startLevel(level, [], true, () => { finished++; });
        assert.ok(scene.mystery);
        assert.ok([...scene.staticMeshes.values()].every(mesh => !mesh.visible));
        const launch = scene.introNext;
        scene.advanceIntro(launch - 1);
        assert.equal(scene.flights.length, 0);
        assert.deepEqual(cues, []);
        scene.advanceIntro(launch);
        assert.deepEqual(cues, ['breakup']);
        assert.equal(scene.introQueue.length, 0);
        assert.equal(scene.staticMeshes.size, 0);
        assert.equal(scene.mystery, null);
        assert.equal(scene.flights.length, level.bricks.length);
        assert.ok(scene.flights.every(flight => flight.start === launch && flight.landingPosition));
        scene.advanceFlights(launch);
        assert.ok(scene.flights.every(flight => flight.mesh.scale.x === 0));
        // The pour leads the first brick's fall from its flight's end onto the table.
        const pourAt = scene.introRainAt;
        const firstImpact = Math.min(...scene.flights.map(flight => flight.start + flight.duration +
            Math.sqrt(2 * (flight.landingPosition.y - BRICK_HEIGHT * (flight.brick.h ?? 1) / 2) / 19) * 1000));
        // The current sound tuning leads impact by 800 ms, including taller wheel assemblies.
        assert.ok(Math.abs(firstImpact - pourAt - 800) < 1e-6);
        assert.ok(pourAt > launch);
        scene.advanceFlights(pourAt - 1);
        assert.deepEqual(cues, ['breakup']);
        scene.advanceFlights(pourAt);
        assert.deepEqual(cues, ['breakup', 'rain']);
        scene.advanceFlights(launch + 3000);
        assert.deepEqual(cues, ['breakup', 'rain']);
        assert.equal(scene.flights.length, 0);
        assert.equal(finished, 1);
        const ids = [...scene.loose.keys(), ...scene.reserve.map(brick => brick.id)];
        assert.equal(ids.length, level.bricks.length);
        assert.equal(new Set(ids).size, level.bricks.length);
    }
});

test('skipping a burst in flight removes overlays and preserves the pile inventory', () => {
    const scene = sceneHarness();
    const cues = [];
    scene.setIntroCallbacks(() => cues.push('breakup'), () => cues.push('rain'), () => cues.push('cancel'));
    Object.assign(scene, {
        modelCamera: new THREE.PerspectiveCamera(), pileCamera: new THREE.PerspectiveCamera(),
        overlayScene: new THREE.Scene(), screenPoint() { return new THREE.Vector2(); }
    });
    scene.startLevel(duck, [], true, () => {});
    const launch = scene.introNext;
    scene.advanceIntro(launch);
    scene.advanceFlights(launch + 300);
    scene.skipIntro();
    scene.advanceFlights(launch + 3000);
    assert.deepEqual(cues, ['breakup', 'cancel']);
    assert.equal(scene.overlayScene.children.length, 0);
    assert.equal(scene.flights.length, 0);
    assert.equal(scene.mystery, null);
    assert.equal(scene.loose.size + scene.reserve.length, duck.bricks.length);
});

test('reduced-motion intro skips both cues', () => {
    const scene = sceneHarness();
    const cues = [];
    scene.setIntroCallbacks(() => cues.push('breakup'), () => cues.push('rain'), () => {});
    reducedMotion.matches = true;
    try {
        scene.startLevel(duck, [], true, () => {});
        scene.advanceIntro(scene.introNext);
        assert.deepEqual(cues, []);
        assert.equal(scene.interactive, true);
    } finally { reducedMotion.matches = false; }
});

test('shrinking trays preserves inventory, clamps loose bricks and flight landings, and defers during drag', async () => {
    const { default: RAPIER } = await import('@dimforge/rapier3d-compat');
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -19, z: 0 });
    const scene = Object.create(SnapScene3D.prototype);
    const brick = { ...unit, w: 4, d: 2 };
    const landing = new THREE.Vector3(70, 5, 70);
    Object.assign(scene, { world, tray: { width: 160, depth: 160, distance: 29 },
        table: null, tableColliders: [], pileScene: new THREE.Scene(),
        pileElement: { clientWidth: 364, clientHeight: 472 },
        level: heightLevel([brick]), order: [brick], loose: new Map(),
        flights: [{ brick, landingPosition: landing }], reserve: ['reserved'], placedIds: ['placed'], drag: null });
    try {
        scene.makeTable();
        scene.spawnLoose(brick, false, new THREE.Vector3(70, 2, 70));
        const body = scene.loose.get(brick.id).body;
        scene.drag = {};
        scene.resizeTray();
        assert.equal(scene.tray.width, 160);
        scene.drag = null;
        scene.resizeTray();
        assert.equal(scene.loose.size, 1);
        assert.equal(scene.loose.get(brick.id).body, body);
        assert.deepEqual(scene.reserve, ['reserved']);
        assert.deepEqual(scene.placedIds, ['placed']);
        const bounded = trayPoint(scene.tray, brick, 70, 70);
        assert.ok(Math.abs(body.translation().x - bounded.x) < 1e-5);
        assert.ok(Math.abs(body.translation().z - bounded.z) < 1e-5);
        assert.equal(landing.x, bounded.x);
        assert.equal(landing.z, bounded.z);
        assert.equal(landing.y, 5);
        assert.equal(scene.tableColliders.length, 5);
        assert.equal(world.colliders.len(), 6);
        for (let i = 0; i < 120; i++) world.step();
        assert.ok(body.translation().y > 0);
    } finally {
        scene.table?.geometry.dispose(); scene.table?.material.dispose(); world.free();
    }
});
