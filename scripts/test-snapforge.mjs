import test from 'node:test';
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

test('five playable models progress from duck to fruit, sports car, and castle', () => {
    assert.deepEqual(catalog.map(level => level.id), ['duck', 'apple', 'pineapple', 'sports-car', 'castle']);
    assert.deepEqual(catalog.map(level => level.order), [1, 2, 3, 4, 5]);
    assert.deepEqual(catalog.map(level => level.title), ['Little Duck', 'Apple', 'Pineapple', 'Sports Car', 'Castle']);
    const targets = [35, 40, 55, 75, 100];
    for (const [index, level] of catalog.entries()) {
        assert.ok(Math.abs(level.bricks.length - targets[index]) <= 5);
        if (index) assert.ok(level.bricks.length > catalog[index - 1].bricks.length);
        assert.deepEqual(new Set(buildOrder(level).map(p => p.id)), new Set(level.bricks.map(p => p.id)));
    }
    assert.equal(duck.version, 5, 'existing duck saves stay compatible');
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
globalThis.matchMedia = () => ({ matches: false });
const { SnapScene3D } = await import(sceneModule('scene3d'));
const THREE = await import('three');
const { brickPosition } = await import(sceneModule('brick3d'));
function sceneHarness() {
    const scene = Object.create(SnapScene3D.prototype);
    Object.assign(scene, {
        clearLevel() {}, modelGroup: new THREE.Group(), staticMeshes: new Map(),
        loose: new Map(), flights: [], updateTarget() {},
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
    scene.startLevel(duck, [consumed.id], false, () => {});
    assert.deepEqual([...scene.staticMeshes.keys()], [order[0].id]);
    assert.deepEqual(scene.modelGroup.children[0].position.toArray(), brickPosition(order[0], duck).toArray());
    assert.ok(!scene.loose.has(consumed.id));
    assert.ok(!scene.reserve.some(p => p.id === consumed.id));
});


test('mystery intro hides finished bricks and launches every piece in one burst', () => {
    for (const level of catalog) {
        const scene = sceneHarness();
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
        scene.advanceIntro(launch);
        assert.equal(scene.introQueue.length, 0);
        assert.equal(scene.staticMeshes.size, 0);
        assert.equal(scene.mystery, null);
        assert.equal(scene.flights.length, level.bricks.length);
        assert.ok(scene.flights.every(flight => flight.start === launch && flight.landingPosition));
        scene.advanceFlights(launch);
        assert.ok(scene.flights.every(flight => flight.mesh.scale.x === 0));
        scene.advanceFlights(launch + 1200);
        assert.equal(scene.flights.length, 0);
        assert.equal(finished, 1);
        const ids = [...scene.loose.keys(), ...scene.reserve.map(brick => brick.id)];
        assert.equal(ids.length, level.bricks.length);
        assert.equal(new Set(ids).size, level.bricks.length);
    }
});

test('skipping a burst in flight removes overlays and preserves the pile inventory', () => {
    const scene = sceneHarness();
    Object.assign(scene, {
        modelCamera: new THREE.PerspectiveCamera(), pileCamera: new THREE.PerspectiveCamera(),
        overlayScene: new THREE.Scene(), screenPoint() { return new THREE.Vector2(); }
    });
    scene.startLevel(duck, [], true, () => {});
    scene.advanceIntro(scene.introNext);
    scene.skipIntro();
    assert.equal(scene.overlayScene.children.length, 0);
    assert.equal(scene.flights.length, 0);
    assert.equal(scene.mystery, null);
    assert.equal(scene.loose.size + scene.reserve.length, duck.bricks.length);
});
