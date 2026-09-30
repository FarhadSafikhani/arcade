import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
    const expected = new Map([['starter', 5], ['farm', 5], ['fruit', 6], ['land-animal', 6],
        ['car', 6], ['ocean', 6], ['bird', 7], ['landmarks', 8], ['dinosaur', 0]]);
    for (const [collection, count] of expected)
        if ((collectionCounts.get(collection) ?? 0) !== count) {
            failed = true;
            console.error(`✗ ${collection}: expected ${count} models, found ${collectionCounts.get(collection) ?? 0}`);
        }
}
if (!files.length && !failed) {
    const recipeDir = resolve('src/games/snapforge/recipes');
    const cachePath = resolve('tmp/snapforge-validation.sha256');
    const inputs = [modulePath, resolve('scripts/snapforge-compiler.mjs'),
        resolve('scripts/compile-snapforge.mjs'), resolve('scripts/check-snapforge-recipes.mjs'),
        ...readdirSync(recipeDir).filter(name => name.endsWith('.json')).sort().map(name => resolve(recipeDir, name)),
        ...targets.sort()];
    const hash = createHash('sha256');
    for (const file of inputs) {
        hash.update(file);
        hash.update(readFileSync(file));
    }
    const fingerprint = hash.digest('hex');
    if (existsSync(cachePath) && readFileSync(cachePath, 'utf8') === fingerprint) {
        console.log('✓ Snapforge recipes unchanged; skipping compiler checks');
    } else {
        const recipes = spawnSync(process.execPath, [resolve('scripts/check-snapforge-recipes.mjs')], { stdio: 'inherit' });
        if (recipes.error) console.error(recipes.error.message);
        if (recipes.status !== 0) failed = true;
        if (!failed) {
            mkdirSync(resolve('tmp'), { recursive: true });
            writeFileSync(cachePath, fingerprint);
        }
    }
}
if (failed || targets.length === 0) process.exitCode = 1;
