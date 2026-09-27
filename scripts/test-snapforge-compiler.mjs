import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { compileRecipe, expandRecipe, brickCells, standardSize } from './snapforge-compiler.mjs';

const source = readFileSync(new URL('../src/games/snapforge/level.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { validateLevel, buildOrder } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const recipe = (volumes, extras = {}) => ({ id: 'test', title: 'Test', description: '', collection: 'starter', order: 1,
    version: 1, targetParts: 1, palette: { main: '#669944', eye: '#222222' }, volumes, ...extras });
const box = (name, x, y, z, w, d, h, extras = {}) => ({ name, x, y, z, w, d, h, color: 'main', ...extras });
const turtleRecipe = JSON.parse(readFileSync(new URL('../src/games/snapforge/recipes/turtle.json', import.meta.url)));
const turtle = JSON.parse(readFileSync(new URL('../src/games/snapforge/levels/turtle.json', import.meta.url)));

test('packing merges adjacent volumes and different layer partitions into one 2×8 height-2 brick', () => {
    const input = recipe([box('lower-a', 0, 0, 0, 2, 4, 1), box('lower-b', 0, 4, 0, 2, 4, 1),
        box('upper-a', 0, 0, 1, 2, 3, 1), box('upper-b', 0, 3, 1, 2, 5, 1)]);
    const { level, report } = compileRecipe(input);
    assert.equal(level.bricks.length, 1);
    assert.deepEqual([level.bricks[0].w, level.bricks[0].d, level.bricks[0].h], [2, 8, 2]);
    assert.deepEqual(report.mergeOpportunities, []);
    assert.deepEqual(compileRecipe(input).level, level);
});

test('custom rectangles are allowed, protected boundaries retained, and no artificial padding occurs', () => {
    const { level, report } = compileRecipe(recipe([box('odd', 0, 0, 0, 3, 5, 2)], { targetParts: 20 }));
    assert.equal(level.bricks.length, 1);
    assert.equal(standardSize(level.bricks[0]), false);
    assert.deepEqual(report.customSizes, ['3×5 h2']);
    assert.equal(report.withinBudget, false);
    const protectedInput = recipe([box('base', 0, 0, 0, 2, 2, 1),
        box('top-left', 0, 0, 1, 1, 2, 1, { protected: true }), box('top-right', 1, 0, 1, 1, 2, 1, { protected: true })]);
    assert.equal(compileRecipe(protectedInput).level.bricks.length, 3);
});

test('rejects unsupported and side-only connected models without adding cells', () => {
    for (const input of [recipe([box('floating', 0, 0, 1, 2, 2, 1)]),
        recipe([box('a', 0, 0, 0, 1, 1, 1, { protected: true }), box('b', 1, 0, 0, 1, 1, 1, { protected: true })])]) {
        const original = structuredClone(input);
        assert.throws(() => compileRecipe(input), /Support failure/);
        assert.deepEqual(input, original);
    }
});

test('explicit overlays and documented symmetry exceptions are required', () => {
    assert.throws(() => expandRecipe(recipe([box('a', 0, 0, 0, 2, 2, 1), box('b', 0, 0, 0, 1, 1, 1)])), /overlap/);
    const asymmetric = recipe([box('a', 0, 0, 0, 2, 1, 1)], { symmetry: { axis: 'y', plane: 1 } });
    assert.throws(() => compileRecipe(asymmetric), /Symmetry failure/);
    asymmetric.symmetry.exceptions = [{ volumes: ['a'], reason: 'Intentional sideways pose' }];
    assert.equal(compileRecipe(asymmetric).level.bricks.length, 1);
    asymmetric.symmetry.exceptions[0].reason = '';
    assert.throws(() => expandRecipe(asymmetric), /reason/);
});

test('turtle is reproducible, preserves every recipe cell and color, and mirrors brick seams', () => {
    const { level, report } = compileRecipe(turtleRecipe, turtle);
    assert.deepEqual(level, turtle);
    assert.equal(report.withinBudget, true);
    assert.ok(level.bricks.length >= 18 && level.bricks.length <= 22);
    const expected = [...expandRecipe(turtleRecipe)].map(([key, c]) => `${key}:${c.color}`).sort();
    const actual = level.bricks.flatMap(b => brickCells(b).map(key => `${key}:${b.color}`)).sort();
    assert.deepEqual(actual, expected);
    for (const b of level.bricks) assert.ok(level.bricks.some(other => other.x === b.x && other.y === 10 - b.y - b.d &&
        other.z === b.z && other.w === b.w && other.d === b.d && other.h === b.h && other.color === b.color));
    assert.equal(buildOrder(level)[0].z, 0);
    assert.ok(buildOrder(level)[0].w * buildOrder(level)[0].d >= 12, 'start with a broad foundation');
    assert.equal(level.vetted, 0);
});

test('metadata and authored build sequences validate; legacy ordering remains unchanged', () => {
    assert.doesNotThrow(() => validateLevel(turtle));
    for (const value of [undefined, 0, -1, 1.5, '20']) assert.throws(() => validateLevel({ ...turtle, targetParts: value }), /targetParts/);
    for (const value of [undefined, true, -1, 2, '1']) assert.throws(() => validateLevel({ ...turtle, vetted: value }), /vetted/);
    for (const sequence of [[], [turtle.bricks[0].id], turtle.bricks.map(() => turtle.bricks[0].id)])
        assert.throws(() => validateLevel({ ...turtle, buildSequence: sequence }), /buildSequence/);
    assert.throws(() => validateLevel({ ...turtle, buildSequence: [...turtle.buildSequence].reverse() }), /before its support/);
    const duck = JSON.parse(readFileSync(new URL('../src/games/snapforge/levels/duck.json', import.meta.url)));
    assert.deepEqual(buildOrder(duck), [...duck.bricks].sort((a, b) => a.z - b.z || a.x + a.y - b.x - b.y || a.y - b.y || a.id.localeCompare(b.id)));
});

test('compiler never promotes vetting, preserves explicit vetting only unchanged, and guards saved versions', () => {
    const input = recipe([box('base', 0, 0, 0, 2, 2, 1)], { vetted: 1 });
    const initial = compileRecipe(input).level;
    assert.equal(initial.vetted, 0);
    const vetted = { ...initial, vetted: 1 };
    assert.equal(compileRecipe(input, vetted).level.vetted, 1);
    assert.equal(compileRecipe(input, Object.fromEntries(Object.entries(vetted).reverse())).level.vetted, 1);
    assert.equal(compileRecipe({ ...input, title: 'New title' }, vetted).level.vetted, 0);
    const changed = { ...input, volumes: [box('base', 0, 0, 0, 2, 3, 1)] };
    assert.throws(() => compileRecipe(changed, initial), /Increment recipe version/);
    assert.equal(compileRecipe({ ...changed, version: 2 }, vetted).level.vetted, 0);
});

test('legacy regeneration preserves targets, vetting and geometry, and skips migrated recipes', () => {
    // Execute just Model in an isolated temporary catalog, not the script's top-level catalog writes.
    const python = `
import ast, json, tempfile
from pathlib import Path
source = Path('scripts/generate-snapforge-collections.py').read_text()
tree = ast.parse(source)
model = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'Model')
with tempfile.TemporaryDirectory(prefix='snapforge-legacy-') as temp:
    root = Path(temp).resolve()
    output = root / 'levels'
    output.mkdir()
    namespace = {'json': json, 'OUT': output}
    exec(compile(ast.Module(body=[model], type_ignores=[]), '<legacy-test>', 'exec'), namespace)
    m = namespace['Model']('sample', 'Sample', 'bird', 1, '', {'main': '#669944'})
    m.box(0, 2, 0, 2, 0, 1, 'main').save()
    path = output / 'sample.json'
    data = json.loads(path.read_text())
    assert data['vetted'] == 0 and data['targetParts'] == 1
    data.update(vetted=1, targetParts=20, version=7)
    path.write_text(json.dumps(data))
    m.save()
    assert json.loads(path.read_text()) == data
    m.box(0, 2, 0, 2, 1, 2, 'main')
    try:
        m.save()
        raise AssertionError('Geometry change should fail')
    except ValueError:
        pass
    assert json.loads(path.read_text()) == data
    (root / 'recipes').mkdir()
    (root / 'recipes' / 'sample.json').write_text('{}')
    m.save()
    assert json.loads(path.read_text()) == data
`;
    const result = spawnSync('python', ['-c', python], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
});

test('CLI generates, checks without writing, rejects stale artifacts and out-of-budget output', () => {
    const dir = mkdtempSync(join(tmpdir(), 'snapforge-compiler-'));
    try {
        const inputPath = join(dir, 'recipe.json'), outputPath = join(dir, 'level.json');
        const input = recipe([box('base', 0, 0, 0, 2, 8, 2)]);
        writeFileSync(inputPath, JSON.stringify(input));
        const run = (...args) => spawnSync(process.execPath, ['scripts/compile-snapforge.mjs', inputPath, outputPath, ...args], { encoding: 'utf8' });
        assert.equal(run().status, 0);
        const before = readFileSync(outputPath, 'utf8');
        assert.equal(run('--check').status, 0);
        assert.equal(readFileSync(outputPath, 'utf8'), before);
        writeFileSync(inputPath, JSON.stringify({ ...input, title: 'Changed' }));
        assert.notEqual(run('--check').status, 0);
        assert.equal(readFileSync(outputPath, 'utf8'), before);
        writeFileSync(inputPath, JSON.stringify({ ...input, targetParts: 20 }));
        assert.match(run().stderr, /Outside N/);
        assert.equal(readFileSync(outputPath, 'utf8'), before);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
