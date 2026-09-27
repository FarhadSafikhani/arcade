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
        duck: 'ebf55d3ded6afef3bbe7ca9c5c09329f0c85a5ddae391aa841f14fa52730c08c',
        apple: '065af5061391b2a9ab78bd1bd35b61699c08f389cb3f94e3cac68a3040064bf9',
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

test('seven collections have ordered models and independent unlock paths', () => {
    const expected = new Map([
        ['starter', ['turtle', 'duck', 'apple', 'pineapple', 'sports-car', 'castle']],
        ['land-animal', ['rabbit', 'fox', 'elephant']],
        ['fruit', ['cherry', 'watermelon', 'pear']],
        ['bird', ['chick', 'owl', 'parrot']],
        ['car', ['compact-car', 'pickup-truck', 'race-car']],
        ['ocean', ['fish', 'sea-turtle', 'shark']],
        ['dinosaur', ['stegosaurus', 'triceratops', 't-rex']]
    ]);
    assert.equal(catalog.length, 24);
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
        assert.equal(modelUnlocked(group, 1, []), false);
        assert.equal(modelUnlocked(group, 1, [group[0].id]), true);
        const other = catalog.find(level => level.collection !== collection);
        assert.equal(modelUnlocked(group, 1, [other.id]), false);
    }
    const starter = catalog.filter(level => level.collection === 'starter').sort((a, b) => a.order - b.order);
    assert.deepEqual(starter.map(level => level.version), [1, 6, 2, 2, 1, 2]);
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

test('duck is a supported, connected 25–35 brick model with a complete build order', () => {
    const level = validateLevel(duck);
    assert.ok(level.bricks.length >= 25 && level.bricks.length <= 35);
    const ordered = buildOrder(level);
    assert.deepEqual(new Set(ordered.map(brick => brick.id)), new Set(level.bricks.map(brick => brick.id)));
    assert.equal(ordered[0].z, 0);
    assert.equal(ordered.at(-1).z, Math.max(...level.bricks.map(brick => brick.z)));
});

test('rejects overlapping bricks', () => {
    const candidate = structuredClone(duck);
    candidate.bricks[1].x = candidate.bricks[0].x;
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
        `from '${specifier.startsWith('./') ? sceneModule(specifier.slice(2)) : import.meta.resolve(specifier)}'`);
    const url = `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
    moduleUrls.set(name, url);
    return url;
}
const reducedMotion = { matches: false };
globalThis.matchMedia = () => reducedMotion;
globalThis.devicePixelRatio = 1;
const { SnapScene3D } = await import(sceneModule('scene3d'));
const THREE = await import('three');
const { brickPosition, brickMesh, BRICK_HEIGHT } = await import(sceneModule('brick3d'));
const { createBreakupBuffer, createBrickRainBuffer } = await import(sceneModule('sound'));

test('intro cues have an immediate, dense stereo rain with bounded peaks', () => {
    const context = { sampleRate: 44100, createBuffer(channels, length) {
        const samples = Array.from({ length: channels }, () => new Float32Array(length));
        return { numberOfChannels: channels, duration: length / this.sampleRate,
            getChannelData: channel => samples[channel] };
    } };
    const breakup = createBreakupBuffer(context);
    const rain = createBrickRainBuffer(context);
    for (const buffer of [breakup, rain]) for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const samples = buffer.getChannelData(channel);
        assert.ok(samples.some(sample => Math.abs(sample) > 0.03));
        assert.ok(samples.every(Number.isFinite));
        assert.ok(samples.every(sample => Math.abs(sample) <= 0.76));
    }
    assert.ok(breakup.duration < 0.5);
    assert.ok(rain.duration > 1 && rain.duration < 1.2);
    assert.equal(rain.numberOfChannels, 2);
    const left = rain.getChannelData(0), right = rain.getChannelData(1);
    for (const time of [0, 0.18, 0.4, 0.65, 0.85]) {
        const start = Math.floor(time * context.sampleRate);
        assert.ok(left.slice(start, start + 0.1 * context.sampleRate)
            .some(sample => Math.abs(sample) > 0.01));
    }
    assert.ok(left.some((sample, index) => Math.abs(sample - right[index]) > 0.01));
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
        onIntroBreakup() {}, onIntroRain() {}, onIntroCancel() {}, introRainPlayed: false,
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
    const consumed = order.find(p => p.z > 0 && pieceMatches(p, order[0]));
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
        scene.advanceFlights(launch + 299);
        assert.deepEqual(cues, ['breakup']);
        scene.advanceFlights(launch + 300);
        assert.deepEqual(cues, ['breakup', 'rain']);
        scene.advanceFlights(launch + 1200);
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
    scene.advanceIntro(scene.introNext);
    scene.advanceFlights(scene.introNext + 300);
    scene.skipIntro();
    assert.deepEqual(cues, ['breakup', 'rain', 'cancel']);
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
