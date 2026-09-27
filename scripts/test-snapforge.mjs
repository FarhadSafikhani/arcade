import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const source = readFileSync(resolve('src/games/snapforge/level.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 }
}).outputText;
const { validateLevel, buildOrder } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const duck = JSON.parse(readFileSync(resolve('src/games/snapforge/levels/duck.json'), 'utf8'));

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
