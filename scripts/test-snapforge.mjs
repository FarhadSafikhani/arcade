// Default Snapforge route: level rules, pile behavior, catalog, and tray math.
// Meshes, physics, intro timing, overlay, and gallery live in `npm run test:snapforge:scene`.
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
    const active = Array.from({ length: 29 }, (_, i) => ({ ...unit, id: `plain-${i}` }));
    assert.deepEqual(pileAdditions(active, wheels, [wheel]), [wheels[0]]);
    const level = heightLevel([wheel, { ...rotated, x: 5 }]);
    assert.ok(validPlacedIds(level, ['rotated']));
});

test('side contact is not an attachment, but a shared stud bridge connects ground pieces', () => {
    const left = { ...unit, w: 1 };
    const right = { ...left, id: 'right', x: 1 };
    const disconnected = heightLevel([left, right]);
    assert.throws(() => validateLevel(disconnected), /disconnected pieces/);
    assert.throws(() => validateLevel({ ...disconnected, buildSequence: ['base', 'right'] }), /disconnected pieces/);
    const connected = heightLevel([left, right, { ...unit, id: 'bridge', z: 1 }]);
    assert.doesNotThrow(() => validateLevel({ ...connected, buildSequence: ['base', 'right', 'bridge'] }));
});

test('height defaults to one and accepts compact h4 bricks', () => {
    for (const b of [unit, { ...unit, h: 1 }, { ...unit, h: 2 }, { ...unit, h: 3 }, { ...unit, w: 1, d: 2, h: 3 }]) {
        assert.doesNotThrow(() => validateLevel(heightLevel([b])));
    }
    assert.throws(() => validateLevel(heightLevel([{ ...unit, w: 2, d: 2, h: 3 }])), /h must/);
    for (const [w, d] of [[1, 1], [1, 2], [2, 1], [2, 2], [1, 3], [3, 1]])
        assert.doesNotThrow(() => validateLevel(heightLevel([{ ...unit, w, d, h: 4 }])));
    assert.throws(() => validateLevel(heightLevel([{ ...unit, w: 3, d: 3, h: 4 }])), /h must/);
    for (const h of [0, -1, 5, 1.5, '2', null, false]) {
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
    assert.equal(pileAdditions([], [...active, ...reserve], [reserve[0], ...active])
        .filter(b => b.h === 2).length, 1);
});

test('nine collections have ordered models and independent unlock paths', () => {
    const expected = new Map([
        ['starter', ['turtle', 'apple', 'duck', 'house', 'police-car']],
        ['farm', ['sheep', 'chicken', 'cow', 'horse', 'barn']],
        ['fruit', ['pear', 'orange', 'cherry', 'watermelon', 'strawberry', 'pineapple']],
        ['land-animal', ['hippo', 'rhino', 'lion', 'elephant', 'giraffe', 'zebra']],
        ['car', ['pickup-truck', 'sports-car', 'super-car', 'ambulance', 'semi-truck', 'fire-truck']],
        ['ocean', ['manta-ray', 'clownfish', 'blue-tang', 'red-crab', 'blue-whale', 'great-white']],
        ['bird', ['penguin', 'mallard', 'eagle', 'ostrich', 'flamingo', 'scarlet-macaw', 'peacock']],
        ['landmarks', ['stonehenge', 'eiffel-tower', 'big-ben', 'castle', 'pyramids', 'colosseum', 'cn-tower', 'azadi-tower']],
        ['dinosaur', []]
    ]);
    assert.equal(catalog.length, 49);
    for (const [collection, ids] of expected) {
        const group = catalog.filter(level => level.collection === collection).sort((a, b) => a.order - b.order);
        assert.deepEqual(group.map(level => level.id), ids);
        assert.deepEqual(group.map(level => level.order), ids.map((_, index) => index + 1));
        // Slots are authored metadata; actual packing counts need not increase strictly.
        assert.ok(group.every(level => Math.abs(level.bricks.length - level.targetParts) <= 2),
            `${collection}: piece counts should stay within the authored budgets`);
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
    assert.deepEqual(starter.map(level => level.version), [1, 4, 7, 3, 5]);
});

test('every catalog model can be built from its replenishing pile and resumed at every step', () => {
    for (const level of catalog) {
        let reserve = buildOrder(level), active = [];
        const placed = [];
        for (const target of buildOrder(level)) {
            // A replenishment can be staggered across frames before this target becomes available.
            const upcoming = buildOrder(level).slice(placed.length);
            // The scene admits one falling piece per refill tick.
            let next;
            while ((next = pileAdditions(active, reserve, upcoming)[0])) {
                reserve.splice(reserve.indexOf(next), 1);
                active.push(next);
            }
            assert.ok(active.length <= 30, `${level.id}: pile exceeds 30`);
            // Resuming uses the remaining physical IDs, even when later duplicates were used.
            const consumed = new Set(placed);
            const resumed = pileAdditions([], level.bricks.filter(p => !consumed.has(p.id)), upcoming);
            for (const pile of [active, resumed]) {
                const stocked = [...pile];
                for (const step of upcoming.slice(0, 24)) {
                    const match = stocked.findIndex(p => pieceMatches(p, step));
                    assert.ok(match >= 0, `${level.id}: pile missing ${step.id}`);
                    stocked.splice(match, 1);
                }
            }
            const index = active.findLastIndex(p => pieceMatches(p, target));
            assert.ok(index >= 0, `${level.id}: missing ${target.id}`);
            placed.push(active.splice(index, 1)[0].id);
            if (placed.length < level.bricks.length) assert.ok(validPlacedIds(level, placed));
            assert.equal(placed.length + reserve.length + active.length, level.bricks.length);
        }
        assert.equal(new Set(placed).size, level.bricks.length);
        assert.equal(reserve.length + active.length, 0);
    }
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

test('starting pile stocks repeated upcoming parts and limits oversized future clutter', () => {
    const small = parts(24, 'white', 1, 1);
    const roof = parts(20, 'blue', 4, 12);
    const later = parts(20, 'red', 1, 2);
    const upcoming = [...small, ...roof, ...later];
    const active = pileAdditions([], [...upcoming].reverse(), upcoming);
    assert.equal(active.length, 30);
    assert.equal(active.filter(p => p.color === 'white').length, 24);
    assert.equal(active.filter(p => p.color === 'blue').length, 2);
    assert.equal(active.filter(p => p.color === 'red').length, 4);
    // Large pieces are unrestricted when they are actually needed.
    assert.equal(pileAdditions([], roof, roof).length, 20);
    assert.equal(pileAdditions([], [...small, ...roof], [...small, ...roof]).length, 26);
});

test('small piles fill to 30 regardless of duplicate count, and exhaust the reserve', () => {
    const reserve = parts(100);
    const active = pileAdditions([], reserve, reserve);
    assert.equal(active.length, 30);
    assert.equal(pileAdditions(active, reserve.slice(30), reserve).length, 0);
    active.pop();
    assert.equal(pileAdditions(active, reserve.slice(30), reserve.slice(1)).length, 1);
    assert.equal(pileAdditions([], parts(29), parts(29)).length, 29);
    assert.equal(pileAdditions([], parts(30), parts(30)).length, 30);
});

test('reserve inventory can be completely built without losing or duplicating pieces', () => {
    const all = Array.from({ length: 15 }, (_, i) => parts(7, `color${i}`)).flat();
    let reserve = [...all], active = [], built = [];
    while (built.length < all.length) {
        const added = pileAdditions(active, reserve, all.slice(built.length));
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
globalThis.matchMedia = () => ({ matches: false });
globalThis.devicePixelRatio = 1;
const { SnapScene3D } = await import(sceneModule('scene3d'));
const THREE = await import('three');
const { brickPosition } = await import(sceneModule('brick3d'));
const { trayLayout, trayPoint } = await import(sceneModule('tray-layout'));
const { modelBox, workingBox, boxSphere, fitDistance, fitSpinningBox, viewDirection, easeFrame, MIN_FOOTPRINT } =
    await import(sceneModule('camera-fit'));

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

function fitsInView(box, sphere, fov, aspect, yaw) {
    const camera = new THREE.PerspectiveCamera(fov, aspect, .1, 300);
    const distance = fitDistance(sphere.radius, fov, aspect), direction = viewDirection(yaw);
    camera.position.set(sphere.x + direction.x * distance, sphere.y + direction.y * distance, sphere.z + direction.z * distance);
    camera.lookAt(sphere.x, sphere.y, sphere.z); camera.updateMatrixWorld();
    return [box.min.x, box.max.x].every(x => [box.min.y, box.max.y].every(y => [box.min.z, box.max.z].every(z => {
        const point = new THREE.Vector3(x, y, z).project(camera);
        return Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1;
    })));
}

test('the build view starts close, only grows, and always contains the working set', () => {
    const bigBen = catalog.find(level => level.id === 'big-ben');
    const order = buildOrder(bigBen), finished = boxSphere(modelBox(bigBen));
    let box = null, radius = 0;
    for (let placed = 0; placed <= order.length; placed++) {
        box = workingBox(bigBen, order, placed, box);
        const sphere = boxSphere(box);
        assert.ok(sphere.radius >= radius - 1e-9, `zoomed back in at step ${placed}`);
        radius = sphere.radius;
        if (placed === 0) assert.ok(radius < finished.radius / 2);
        if (placed % 36 === 0) for (const aspect of [0.6, 1.8, 3.2]) for (const yaw of [0, 1, 2.4, 4])
            assert.ok(fitsInView(box, sphere, 38, aspect, yaw), `step ${placed} clipped at aspect ${aspect}`);
    }
    // Headroom kept from earlier targets leaves the last frame slightly above the finished model.
    assert.ok(radius >= finished.radius && radius < finished.radius * 1.15);
});

test('a tiny model is never framed tighter than the minimum footprint', () => {
    const tiny = heightLevel([unit]);
    const sphere = boxSphere(workingBox(tiny, buildOrder(tiny), 0));
    assert.ok(sphere.radius >= Math.hypot(MIN_FOOTPRINT / 2, MIN_FOOTPRINT / 2));
});

test('view easing approaches the target without overshoot and at any frame rate', () => {
    const from = { x: 0, y: 2, z: 0, radius: 8 }, to = { x: 0, y: 14, z: 0, radius: 30 };
    assert.deepEqual(easeFrame(from, to, .016, 0), to);
    let coarse = from, fine = from;
    for (let i = 0; i < 10; i++) coarse = easeFrame(coarse, to, .05, .17);
    for (let i = 0; i < 20; i++) fine = easeFrame(fine, to, .025, .17);
    assert.ok(Math.abs(coarse.radius - fine.radius) < 1e-9);
    assert.ok(coarse.radius > from.radius && coarse.radius < to.radius && coarse.y < to.y);
});

test('gallery cards fit every turn angle and use less room than a sphere fit', () => {
    for (const id of ['big-ben', 'semi-truck', 'turtle']) {
        const level = catalog.find(item => item.id === id), box = modelBox(level), sphere = boxSphere(box);
        const direction = viewDirection(Math.atan2(0.65, 0.85));
        for (const aspect of [0.75, 1.34, 2]) {
            const distance = fitSpinningBox(box, sphere, direction, 40, aspect, 1);
            assert.ok(distance < fitDistance(sphere.radius, 40, aspect, 1), `${id}: no tighter than a sphere`);
            const camera = new THREE.PerspectiveCamera(40, aspect, .1, 300);
            camera.position.set(sphere.x + direction.x * distance, sphere.y + direction.y * distance, sphere.z + direction.z * distance);
            camera.lookAt(sphere.x, sphere.y, sphere.z); camera.updateMatrixWorld();
            let widest = 0;
            for (let turn = 0.05; turn < Math.PI * 2; turn += 0.1) for (const x of [box.min.x, box.max.x])
                for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
                    const point = new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn).project(camera);
                    widest = Math.max(widest, Math.abs(point.x), Math.abs(point.y));
                }
            assert.ok(widest <= 1.02 && widest > 0.9, `${id} at aspect ${aspect}: extent ${widest}`);
        }
    }
});
