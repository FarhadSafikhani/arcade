import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const modulePath = resolve('src/games/snapforge/level.ts');
const source = readFileSync(modulePath, 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }
}).outputText;
const { validateLevel, buildOrder } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const levelDir = resolve('src/games/snapforge/levels');
const files = process.argv.slice(2);
const targets = files.length ? files.map(path => resolve(path)) :
    readdirSync(levelDir).filter(name => name.endsWith('.json')).map(name => resolve(levelDir, name));
const ids = new Set();
const orders = new Set();
const collectionCounts = new Map();
let failed = false;

for (const file of targets) {
    try {
        const level = validateLevel(JSON.parse(readFileSync(file, 'utf8')));
        if (ids.has(level.id)) throw new Error(`duplicate level id: ${level.id}`);
        const orderKey = `${level.collection}/${level.order}`;
        if (orders.has(orderKey)) throw new Error(`duplicate level order: ${orderKey}`);
        ids.add(level.id);
        orders.add(orderKey);
        collectionCounts.set(level.collection, (collectionCounts.get(level.collection) ?? 0) + 1);
        if (buildOrder(level).length !== level.bricks.length) throw new Error('build order omitted a brick');
        console.log(`✓ ${level.title}: ${level.bricks.length} bricks (${file})`);
    } catch (error) {
        failed = true;
        console.error(`✗ ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
if (!files.length) {
    const expected = new Map([['starter', 7], ['land-animal', 3], ['fruit', 3], ['bird', 3],
        ['car', 3], ['ocean', 3], ['dinosaur', 3]]);
    for (const [collection, count] of expected)
        if (collectionCounts.get(collection) !== count) {
            failed = true;
            console.error(`✗ ${collection}: expected ${count} models, found ${collectionCounts.get(collection) ?? 0}`);
        }
}
if (!files.length && !failed) {
    const recipes = spawnSync(process.execPath, [resolve('scripts/check-snapforge-recipes.mjs')], { stdio: 'inherit' });
    if (recipes.error) console.error(recipes.error.message);
    if (recipes.status !== 0) failed = true;
}
if (failed || targets.length === 0) process.exitCode = 1;
