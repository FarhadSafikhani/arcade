import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const source = readFileSync(resolve('src/games/snapforge/level.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }
}).outputText;
const { validateLevel, buildOrder, pieceMatches, validPlacedIds, pileAdditions } =
    await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const collectionSource = readFileSync(resolve('src/games/snapforge/collections.ts'), 'utf8');
const collectionCompiled = ts.transpileModule(collectionSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }
}).outputText;
const { collections, collectionLevels, modelUnlocked } =
    await import(`data:text/javascript;base64,${Buffer.from(collectionCompiled).toString('base64')}`);
const duck = JSON.parse(readFileSync(resolve('src/games/snapforge/levels/duck.json'), 'utf8'));
const catalog = readdirSync(resolve('src/games/snapforge/levels')).filter(name => name.endsWith('.json'))
    .map(name => validateLevel(JSON.parse(readFileSync(resolve('src/games/snapforge/levels', name), 'utf8'))))
    .sort((a, b) => a.collection.localeCompare(b.collection) || a.order - b.order);

test('merged models preserve the original occupied cells and colors', () => {
    // Fingerprints captured from the height-1 catalog before merging pairs.
    const original = {
        pineapple: 'da38f5a8cbc917d5b8e9fdb6c198280762fa5ba51943cae0c8a181e3b8c9d1df',
        'sports-car': '2e6374299b3b3e21e4cb1c0acedcc2ec8e52940a39c20d3a0a929d1edd5c4cc9',
        castle: 'e4adc50d66a66ba964bea8483b6b22b96130c0483dfe12ac414f38d0a825b62b'
    };
    for (const level of catalog.filter(level => Object.hasOwn(original, level.id))) {
        const cells = [];
        for (const b of level.bricks)
            for (let x = b.x; x < b.x + b.w; x++)
                for (let y = b.y; y < b.y + b.d; y++)
                    for (let z = b.z; z < b.z + (b.h ?? 1); z++)
                        cells.push(`${x},${y},${z}:${level.palette[b.color]}`);
        assert.equal(createHash('sha256').update(cells.sort().join('\n')).digest('hex'), original[level.id]);
        for (const b of level.bricks.filter(b => (b.h ?? 1) === 1)) {
            assert.ok(!level.bricks.some(t => (t.h ?? 1) === 1 && t.z === b.z + 1 &&
                t.x === b.x && t.y === b.y && t.w === b.w && t.d === b.d && t.color === b.color),
            `${level.id}: unmerged pair above ${b.id}`);
        }
    }
});

const unit = { id: 'base', x: 0, y: 0, z: 0, w: 2, d: 1, color: 'yellow' };
const heightLevel = bricks => ({ id: 'height-test', title: 'Height test', description: '',
    collection: 'starter', order: 1, version: 1, targetParts: bricks.length, vetted: 0, palette: { yellow: '#FFD233' }, bricks });

test('wheel identity survives rotated matching, reserve grouping and saved progress', () => {
    const wheel = { ...unit, kind: 'wheel', w: 3, d: 1, h: 3 };
    const rotated = { ...wheel, id: 'rotated', w: 1, d: 3 };
    assert.doesNotThrow(() => validateLevel(heightLevel([wheel])));
    assert.doesNotThrow(() => validateLevel(heightLevel([rotated])));
    assert.ok(pieceMatches(wheel, rotated));
    assert.ok(!pieceMatches(wheel, { ...wheel, kind: 'brick' }));
    assert.ok(pieceMatches(unit, { ...unit, kind: 'brick' }));
    assert.throws(() => validateLevel(heightLevel([{ ...wheel, h: 2 }])), /wheel must/);
    assert.throws(() => validateLevel(heightLevel([{ ...unit, kind: 'unknown' }])), /unknown part kind/);
    const wheels = Array.from({ length: 5 }, (_, i) => ({ ...wheel, id: `wheel-${i}` }));
    const active = Array.from({ length: 31 }, (_, i) => ({ ...unit, id: `plain-${i}` }));
    assert.equal(pileAdditions(active, wheels).length, 3);
    const level = heightLevel([wheel, { ...rotated, x: 5 }]);
    assert.ok(validPlacedIds(level, ['rotated']));
});

test('height defaults to one and accepts only explicit one or two', () => {
    for (const b of [unit, { ...unit, h: 1 }, { ...unit, h: 2 }]) {
        assert.doesNotThrow(() => validateLevel(heightLevel([b])));
    }
    for (const h of [0, -1, 3, 1.5, '2', null, false]) {
        assert.throws(() => validateLevel(heightLevel([{ ...unit, h }])), /h must be 1 or 2/);
    }
});

test('tall bricks occupy both layers and support bricks on their top face', () => {
    const base = { ...unit, h: 2 };
    const upper = { ...unit, id: 'upper', z: 2 };
    assert.doesNotThrow(() => validateLevel(heightLevel([base, upper])));
    assert.throws(() => validateLevel(heightLevel([base, { ...upper, z: 1 }])), /overlaps/);
    assert.throws(() => validateLevel(heightLevel([{ ...upper, z: 1 }, base])), /overlaps/);
    assert.throws(() => validateLevel(heightLevel([base, { ...upper, z: 3 }])), /floating/);
    assert.throws(() => validateLevel(heightLevel([{ ...base, z: 1 }])), /floating/);
});

test('height participates in rotated matching, resume validation, and pile grouping', () => {
    const tall = { ...unit, h: 2 };
    assert.ok(pieceMatches(unit, { ...unit, h: 1 }));
    assert.ok(pieceMatches(tall, { ...tall, w: 1, d: 2 }));
    assert.ok(!pieceMatches(tall, unit));
    assert.ok(!pieceMatches(unit, tall));
    const level = heightLevel([tall, { ...unit, id: 'top', z: 2 }]);
    assert.ok(validPlacedIds(level, ['base']));
    assert.ok(!validPlacedIds(level, ['top']));
    const active = Array.from({ length: 30 }, (_, i) => ({ ...unit, id: `short-${i}` }));
    const reserve = Array.from({ length: 5 }, (_, i) => ({ ...tall, id: `tall-${i}` }));
    assert.equal(pileAdditions([], [...active, ...reserve]).filter(b => b.h === 2).length, 3);
});

test('eight collections have ordered models and independent unlock paths', () => {
    const expected = new Map([
        ['starter', ['turtle', 'apple', 'duck', 'house', 'police-car']],
        ['land-animal', ['rabbit', 'fox', 'elephant']],
        ['fruit', ['cherry', 'watermelon', 'pineapple', 'pear']],
        ['bird', ['chick', 'owl', 'parrot']],
        ['car', ['compact-car', 'sports-car', 'pickup-truck', 'race-car']],
        ['landmarks', ['castle']],
        ['ocean', ['fish', 'sea-turtle', 'shark']],
        ['dinosaur', ['stegosaurus', 'triceratops', 't-rex']]
    ]);
    assert.equal(catalog.length, 26);
    for (const [collection, ids] of expected) {
        const group = catalog.filter(level => level.collection === collection).sort((a, b) => a.order - b.order);
        assert.deepEqual(group.map(level => level.id), ids);
        assert.deepEqual(group.map(level => level.order), ids.map((_, index) => index + 1));
        assert.ok(group.every((level, index) => index === 0 || level.bricks.length > group[index - 1].bricks.length),
            `${collection}: piece counts should increase`);
        for (const level of group) assert.deepEqual(
            new Set(buildOrder(level).map(piece => piece.id)), new Set(level.bricks.map(piece => piece.id)));
    }
    assert.deepEqual(collections.map(item => item.id), [...expected.keys()]);
    for (const [collection, ids] of expected) {
        const group = collectionLevels(catalog, collection);
        assert.deepEqual(group.map(level => level.id), ids);
        assert.equal(modelUnlocked(group, 0, []), true);
        if (group.length > 1) {
            assert.equal(modelUnlocked(group, 1, []), false);
            assert.equal(modelUnlocked(group, 1, [group[0].id]), true);
            const other = catalog.find(level => level.collection !== collection);
            assert.equal(modelUnlocked(group, 1, [other.id]), false);
        }
    }
    const starter = catalog.filter(level => level.collection === 'starter').sort((a, b) => a.order - b.order);
    assert.deepEqual(starter.map(level => level.version), [1, 3, 7, 2, 5]);
});

test('every catalog model can be built from its replenishing pile and resumed at every step', () => {
    for (const level of catalog) {
        let reserve = buildOrder(level), active = [];
        const placed = [];
        for (const target of buildOrder(level)) {
            // A replenishment can be staggered across frames before this target becomes available.
            const added = pileAdditions(active, reserve);
            reserve = reserve.filter(p => !added.includes(p));
            active.push(...added);
            const index = active.findIndex(p => pieceMatches(p, target));
            assert.ok(index >= 0, `${level.id}: missing ${target.id}`);
            placed.push(active.splice(index, 1)[0].id);
            if (placed.length < level.bricks.length) assert.ok(validPlacedIds(level, placed));
            assert.equal(placed.length + reserve.length + active.length, level.bricks.length);
        }
        assert.equal(new Set(placed).size, level.bricks.length);
        assert.equal(reserve.length + active.length, 0);
    }
});

test('duck is a supported, connected 35 ±2 brick model with a complete build order', () => {
    const level = validateLevel(duck);
    assert.ok(level.targetParts === 35 && Math.abs(level.bricks.length - 35) <= 2);
    const ordered = buildOrder(level);
    assert.deepEqual(new Set(ordered.map(brick => brick.id)), new Set(level.bricks.map(brick => brick.id)));
    assert.equal(ordered[0].z, 0);
    assert.equal(ordered.at(-1).z, Math.max(...level.bricks.map(brick => brick.z)));
});

test('rejects overlapping bricks', () => {
    const candidate = structuredClone(duck);
    candidate.bricks[1] = { ...candidate.bricks[0], id: candidate.bricks[1].id };
    assert.throws(() => validateLevel(candidate), /overlaps/);
});

test('rejects a floating brick', () => {
    const candidate = structuredClone(duck);
    candidate.bricks.at(-1).z = 20;
    assert.throws(() => validateLevel(candidate), /floating/);
});

test('rejects disconnected ground pieces', () => {
    const candidate = structuredClone(duck);
    candidate.bricks.push({ id: 'stray', x: 99, y: 99, z: 0, w: 1, d: 1, color: 'yellow' });
    assert.throws(() => validateLevel(candidate), /disconnected/);
});

test('rejects malformed dimensions and palette references', () => {
    const malformed = structuredClone(duck);
    malformed.bricks[0].w = 0;
    assert.throws(() => validateLevel(malformed), /positive integer/);
    const badColor = structuredClone(duck);
    badColor.bricks[0].color = 'purple';
    assert.throws(() => validateLevel(badColor), /palette entry/);
});

test('accepts a brick rotated by a quarter turn and rejects wrong shapes or colors', () => {
    const target = { id: 'target', w: 4, d: 2, color: 'yellow' };
    assert.equal(pieceMatches({ id: 'rotated', w: 2, d: 4, color: 'yellow' }, target), true);
    assert.equal(pieceMatches({ id: 'wrong-shape', w: 2, d: 3, color: 'yellow' }, target), false);
    assert.equal(pieceMatches({ id: 'wrong-color', w: 2, d: 4, color: 'orange' }, target), false);
});

test('resumes interchangeable placed bricks only in the correct step order', () => {
    const level = validateLevel(duck);
    const order = buildOrder(level);
    const first = order[0];
    const interchangeable = level.bricks.find(brick => brick.id !== first.id && pieceMatches(brick, first));
    assert.ok(interchangeable);
    assert.equal(validPlacedIds(level, [interchangeable.id]), true);
    assert.equal(validPlacedIds(level, [interchangeable.id, interchangeable.id]), false);
    assert.equal(validPlacedIds(level, ['not-in-level']), false);
    assert.equal(validPlacedIds(level, [interchangeable.id, order.at(-1).id]), false);
});

const parts = (count, color = 'yellow', w = 2, d = 4) => Array.from({ length: count }, (_, i) =>
    ({ id: `${color}-${w}-${d}-${i}`, x: 0, y: 0, z: 0, w, d, color }));

test('large piles keep three per interchangeable type and retain every unique type', () => {
    const reserve = Array.from({ length: 12 }, (_, i) => parts(9, `color${i}`)).flat();
    const active = pileAdditions([], reserve);
    assert.equal(active.length, 36);
    for (const brick of reserve) assert.equal(active.filter(p => pieceMatches(p, brick)).length, 3);
    const used = active.shift();
    const hidden = reserve.filter(p => !active.includes(p) && p !== used);
    const refill = pileAdditions(active, hidden);
    assert.equal(refill.length, 1);
    assert.ok(pieceMatches(refill[0], used));
});

test('small piles fill to 30 regardless of duplicate count, and exhaust the reserve', () => {
    const reserve = parts(100);
    const active = pileAdditions([], reserve);
    assert.equal(active.length, 30);
    assert.equal(pileAdditions(active, reserve.slice(30)).length, 0);
    active.pop();
    assert.equal(pileAdditions(active, reserve.slice(30)).length, 1);
    assert.equal(pileAdditions([], parts(29)).length, 29);
    assert.equal(pileAdditions([], parts(30)).length, 30);
});

test('reserve inventory can be completely built without losing or duplicating pieces', () => {
    const all = Array.from({ length: 15 }, (_, i) => parts(7, `color${i}`)).flat();
    let reserve = [...all], active = [], built = [];
    while (built.length < all.length) {
        const added = pileAdditions(active, reserve);
        reserve = reserve.filter(p => !added.includes(p));
        active.push(...added);
        assert.ok(active.length);
        built.push(active.shift());
    }
    assert.equal(new Set(built.map(p => p.id)).size, all.length);
    assert.equal(reserve.length + active.length, 0);
});

// Exercise scene setup without constructing a WebGL renderer.
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
const { brickPosition, brickMesh, BRICK_HEIGHT } = await import(sceneModule('brick3d'));
const { loadSnapSamples } = await import(sceneModule('sound'));

test('recorded clips exist, stay small, and decode together or not at all', async () => {
    const names = ['snap', 'grab', 'breakup', 'pour'];
    for (const name of names) {
        const size = readFileSync(resolve(`src/games/snapforge/audio/${name}.mp3`)).byteLength;
        assert.ok(size > 1000 && size < 40000, `${name}.mp3 is ${size} bytes`);
    }
    const originalFetch = globalThis.fetch;
    const context = { decodeAudioData: async data => ({ decoded: new TextDecoder().decode(data) }) };
    try {
        globalThis.fetch = async url => new Response(url);
        const samples = await loadSnapSamples(context);
        assert.deepEqual(Object.keys(samples).sort(), [...names].sort());
        for (const name of names) assert.equal(samples[name].decoded, `./audio/${name}.mp3`);
        globalThis.fetch = async url => new Response('', { status: url.includes('pour') ? 404 : 200 });
        assert.equal(await loadSnapSamples(context), null);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

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
    assert.equal(scene.targetHeight, BRICK_HEIGHT);
});

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

test('fresh start and skipped breakup leave zero solid model bricks and preserve all inventory', () => {
    for (const level of catalog) for (const intro of [false, true]) {
        const scene = sceneHarness();
        scene.startLevel(level, [], intro, () => {});
        if (intro) scene.skipIntro();
        assert.equal(scene.staticMeshes.size, 0);
        assert.equal(scene.modelGroup.children.length, 0);
        assert.equal(scene.placedIds.length, 0);
        const ids = [...scene.loose.keys(), ...scene.reserve.map(p => p.id)];
        assert.equal(ids.length, level.bricks.length);
        assert.equal(new Set(ids).size, level.bricks.length);
    }
});

test('resume restores built target positions rather than original interchangeable piece locations', () => {
    const order = buildOrder(duck);
    const consumed = order.find(p => p.id !== order[0].id && pieceMatches(p, order[0]));
    assert.ok(consumed);
    const scene = sceneHarness();
    const cues = [];
    scene.setIntroCallbacks(() => cues.push('breakup'), () => cues.push('rain'), () => {});
    scene.startLevel(duck, [consumed.id], false, () => {});
    assert.deepEqual(cues, []);
    assert.deepEqual([...scene.staticMeshes.keys()], [order[0].id]);
    assert.deepEqual(scene.modelGroup.children[0].position.toArray(), brickPosition(order[0], duck).toArray());
    assert.ok(!scene.loose.has(consumed.id));
    assert.ok(!scene.reserve.some(p => p.id === consumed.id));
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


const { trayLayout, trayPoint } = await import(sceneModule('tray-layout'));

test('adaptive trays fit the camera and expand across wide views without shrinking bricks', () => {
    const narrow = trayLayout(600, 600), wide = trayLayout(1200, 600);
    assert.ok(wide.width > narrow.width);
    assert.equal(trayLayout(1200, 600).distance, trayLayout(1600, 600).distance);
    for (const [width, height] of [[364, 472], [742, 585], [1037, 637], [1414, 503], [403, 322]]) {
        const layout = trayLayout(width, height);
        const camera = new THREE.PerspectiveCamera(42, width / height, .1, 200);
        camera.position.set(0, layout.distance * .85, layout.distance * .72);
        camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
        for (const x of [-1, 1]) for (const z of [-1, 1]) {
            const corner = new THREE.Vector3(x * (layout.width + 1) / 2, 0, z * (layout.depth + 1) / 2).project(camera);
            assert.ok(Math.abs(corner.x) < 1 && Math.abs(corner.y) < 1, `surface clipped at ${width}×${height}`);
        }
        const point = trayPoint(layout, { w: 8, d: 2 }, 100, -100);
        const radius = Math.hypot(8, 2) / 2;
        assert.ok(point.x + radius < layout.width / 2);
        assert.ok(-point.z + radius < layout.depth / 2);
    }
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


test('long custom parts fit the adaptive surface even in short landscape views', () => {
    const brick = { w: 6, d: 14 };
    const minimum = Math.hypot(brick.w, brick.d) + 1;
    const layout = trayLayout(403, 322, minimum);
    assert.ok(layout.width >= minimum && layout.depth >= minimum);
    const point = trayPoint(layout, brick, 100, 100);
    const radius = Math.hypot(brick.w, brick.d) / 2;
    assert.ok(point.x + radius < layout.width / 2);
    assert.ok(point.z + radius < layout.depth / 2);
});
