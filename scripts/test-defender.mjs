import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const moduleUrl = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const transpile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;

const tuningJs = transpile('../src/games/defender/tuning.ts');
const rulesJs = transpile('../src/games/defender/rules.ts').replace("from './tuning'", `from '${moduleUrl(tuningJs)}'`);
const { BOW, GOBLIN, PLAYER, WAVES } = await import(moduleUrl(tuningJs));
const rules = await import(moduleUrl(rulesJs));

test('draw eases from nothing to full and stays clamped', () => {
    assert.equal(rules.drawFraction(0), 0);
    assert.equal(rules.drawFraction(BOW.drawTime), 1);
    assert.equal(rules.drawFraction(BOW.drawTime * 3), 1);
    const half = rules.drawFraction(BOW.drawTime / 2);
    assert.ok(half > 0.5 && half < 1, 'the first half of the pull covers more than half the draw');
});

test('a quick tap still looses a weak arrow, and a full draw hits hardest', () => {
    assert.equal(rules.arrowSpeed(0), BOW.speed.min);
    assert.equal(rules.arrowDamage(0), BOW.damage.min);
    assert.equal(rules.arrowSpeed(1), BOW.speed.max);
    assert.equal(rules.arrowDamage(1), BOW.damage.max);
    assert.ok(rules.arrowDamage(1) >= GOBLIN.health, 'a full draw drops a wave-one goblin');
    assert.ok(rules.arrowDamage(0) < GOBLIN.health);
});

test('walking slows while the bow is drawn', () => {
    assert.equal(rules.walkSpeed(false), PLAYER.walkSpeed);
    assert.equal(rules.walkSpeed(true), PLAYER.walkSpeed * PLAYER.drawWalkFactor);
});

test('the eye leans over the battlements only when looking down', () => {
    assert.equal(rules.leanDistance(0), 0);
    assert.equal(rules.leanDistance(PLAYER.leanStartPitch), 0);
    assert.equal(rules.leanDistance(PLAYER.leanFullPitch), PLAYER.leanDistance);
    assert.equal(rules.leanDistance(-PLAYER.pitchLimit), PLAYER.leanDistance);
});

test('waves grow in size, toughness, and pace without passing their limits', () => {
    const first = rules.waveSpec(1, GOBLIN);
    assert.equal(first.count, WAVES.baseCount);
    assert.equal(first.health, GOBLIN.health);
    assert.equal(first.speed, GOBLIN.speed);
    assert.equal(first.spawnGap, WAVES.baseSpawnGap);
    let previous = first;
    for (let wave = 2; wave <= 40; wave++) {
        const spec = rules.waveSpec(wave, GOBLIN);
        assert.ok(spec.count > previous.count);
        assert.ok(spec.health >= previous.health);
        assert.ok(spec.speed >= previous.speed && spec.speed <= WAVES.maxSpeed);
        assert.ok(spec.spawnGap <= previous.spawnGap && spec.spawnGap >= WAVES.minSpawnGap);
        previous = spec;
    }
});

test('the gate takes every striker into account and never drops below zero', () => {
    assert.equal(rules.gateAfterStrikes(100, [], 5), 100);
    assert.equal(rules.gateAfterStrikes(100, [2, 2, 3], 2), 86);
    assert.equal(rules.gateAfterStrikes(5, [10], 1), 0);
});

test('an ignored first wave breaks the gate', () => {
    const spec = rules.waveSpec(1, GOBLIN);
    const rates = Array(spec.count).fill(spec.gateDamagePerSecond);
    assert.equal(rules.gateAfterStrikes(100, rates, 60), 0);
});

test('best wave reads defensively from storage', () => {
    assert.equal(rules.readBestWave({ getItem: () => '7' }, 'key'), 7);
    assert.equal(rules.readBestWave({ getItem: () => null }, 'key'), 0);
    assert.equal(rules.readBestWave({ getItem: () => 'nope' }, 'key'), 0);
    assert.equal(rules.readBestWave({ getItem: () => { throw new Error('blocked'); } }, 'key'), 0);
});
