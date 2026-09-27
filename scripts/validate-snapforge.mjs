import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
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
const reserved = new Map([[1, 'duck'], [2, 'race-car'], [3, 'rocket'], [4, 'castle']]);
let failed = false;

for (const file of targets) {
    try {
        const level = validateLevel(JSON.parse(readFileSync(file, 'utf8')));
        if (reserved.has(level.order) && reserved.get(level.order) !== level.id) {
            throw new Error(`gallery order ${level.order} is reserved for ${reserved.get(level.order)}`);
        }
        if (ids.has(level.id)) throw new Error(`duplicate level id: ${level.id}`);
        if (orders.has(level.order)) throw new Error(`duplicate level order: ${level.order}`);
        ids.add(level.id);
        orders.add(level.order);
        if (buildOrder(level).length !== level.bricks.length) throw new Error('build order omitted a brick');
        console.log(`✓ ${level.title}: ${level.bricks.length} bricks (${file})`);
    } catch (error) {
        failed = true;
        console.error(`✗ ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
if (failed || targets.length === 0) process.exitCode = 1;
