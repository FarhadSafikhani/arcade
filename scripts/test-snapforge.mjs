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
const duck = JSON.parse(readFileSync(resolve('src/games/snapforge/levels/duck.json'), 'utf8'));
const catalog = readdirSync(resolve('src/games/snapforge/levels')).filter(name => name.endsWith('.json'))
    .map(name => validateLevel(JSON.parse(readFileSync(resolve('src/games/snapforge/levels', name), 'utf8'))))
    .sort((a, b) => a.order - b.order);

test('merged models preserve the original occupied cells and colors', () => {
    // Fingerprints captured from the height-1 catalog before merging pairs.
    const original = {
        duck: 'ebf55d3ded6afef3bbe7ca9c5c09329f0c85a5ddae391aa841f14fa52730c08c',
        apple: '065af5061391b2a9ab78bd1bd35b61699c08f389cb3f94e3cac68a3040064bf9',
        pineapple: 'da38f5a8cbc917d5b8e9fdb6c198280762fa5ba51943cae0c8a181e3b8c9d1df',
        'sports-car': '2e6374299b3b3e21e4cb1c0acedcc2ec8e52940a39c20d3a0a929d1edd5c4cc9',
        castle: 'e4adc50d66a66ba964bea8483b6b22b96130c0483dfe12ac414f38d0a825b62b'
    };
    for (const level of catalog) {
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
    order: 1, version: 1, palette: { yellow: '#FFD233' }, bricks });

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

test('five playable models progress from duck to fruit, sports car, and castle', () => {
    assert.deepEqual(catalog.map(level => level.id), ['duck', 'apple', 'pineapple', 'sports-car', 'castle']);
    assert.deepEqual(catalog.map(level => level.order), [1, 2, 3, 4, 5]);
    assert.deepEqual(catalog.map(level => level.title), ['Little Duck', 'Apple', 'Pineapple', 'Sports Car', 'Castle']);
    const targets = [29, 34, 49, 78, 79];
    for (const [index, level] of catalog.entries()) {
        assert.equal(level.bricks.length, targets[index]);
        if (index) assert.ok(level.bricks.length > catalog[index - 1].bricks.length);
        assert.deepEqual(new Set(buildOrder(level).map(p => p.id)), new Set(level.bricks.map(p => p.id)));
    }
    assert.deepEqual(catalog.map(level => level.version), [6, 2, 2, 1, 2], 'changed models invalidate older partial builds');
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

test('intro cues have nonzero attacks, a trailing rain, and bounded peaks', () => {
    const context = { sampleRate: 44100, createBuffer(_channels, length) {
        const samples = new Float32Array(length);
        return { duration: length / this.sampleRate, getChannelData: () => samples };
    } };
    const breakup = createBreakupBuffer(context);
    const rain = createBrickRainBuffer(context);
    for (const buffer of [breakup, rain]) {
        const samples = buffer.getChannelData(0);
        assert.ok(samples.some(sample => Math.abs(sample) > 0.05));
        assert.ok(samples.every(Number.isFinite));
        assert.ok(Math.max(...samples.slice(0, 10000).map(Math.abs)) <= 0.76);
    }
    assert.ok(breakup.duration < 0.5);
    assert.ok(rain.duration > 1 && rain.duration < 1.3);
    assert.ok(rain.getChannelData(0).slice(30000).some(sample => Math.abs(sample) > 0.02));
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
    scene.skipIntro();
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
