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
const cardsJs = transpile('../src/games/defender/cards.ts').replace("from './tuning'", `from '${moduleUrl(tuningJs)}'`);
const { BOW, ENEMIES, GOBLIN, LAYOUT, PLAYER, WAVES } = await import(moduleUrl(tuningJs));
const rules = await import(moduleUrl(rulesJs));
const cards = await import(moduleUrl(cardsJs));

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

test('the walkway and both towers are standing room, and the moat between them is not', () => {
    assert.equal(rules.canStand(0, 2), true);
    assert.equal(rules.canStand(LAYOUT.towerX, 0.6), true);
    assert.equal(rules.canStand(LAYOUT.towerX, LAYOUT.towerZ - 2), true);
    assert.equal(rules.canStand(-LAYOUT.towerX, LAYOUT.towerZ), true);
    assert.equal(rules.canStand(0, -3), false);
    assert.equal(rules.canStand(LAYOUT.towerX, LAYOUT.towerZ - LAYOUT.towerRadius - 1), false);
    assert.equal(rules.canLean(0, PLAYER.leanLimitZ), true);
    assert.equal(rules.canLean(0, PLAYER.leanLimitZ - 0.4), false);
});

test('shields stop a shot into the face and let a flanking or plunging shot through', () => {
    assert.equal(rules.shieldBlocks(0, -1, -12, 0, 1), true);
    assert.equal(rules.shieldBlocks(8, -1, -1, 0, 1), false);
    assert.equal(rules.shieldBlocks(-6, -2, 3, 0, 1), false);
    assert.equal(rules.shieldBlocks(0.2, -14, -0.2, 0, 1), false);
});

test('experience levels up and keeps the remainder', () => {
    const first = rules.grantXp(0, 1, rules.xpToAdvance(1));
    assert.equal(first.level, 2);
    assert.equal(first.xp, 0);
    assert.equal(first.gainedLevels, 1);
    const extra = rules.grantXp(0, 1, rules.xpToAdvance(1) + 5);
    assert.equal(extra.level, 2);
    assert.equal(extra.xp, 5);
});

test('later waves add runners, shields, brutes, and casters without outrunning their speed caps', () => {
    const first = rules.spawnList(1);
    assert.equal(first.length, 5);
    assert.ok(first.every(id => id === 'goblin'));
    assert.ok(rules.spawnList(2).includes('runner'));
    assert.ok(!rules.spawnList(2).includes('shield'));
    const fifth = rules.spawnList(5);
    for (const id of ['goblin', 'runner', 'shield', 'brute', 'caster']) assert.ok(fifth.includes(id), id);
    assert.equal(rules.scaleEnemy(GOBLIN, 1).health, GOBLIN.health);
    const rushed = rules.scaleEnemy(ENEMIES.runner, 40);
    assert.ok(rushed.speed <= ENEMIES.runner.speedCap);
    assert.ok(rushed.health > ENEMIES.runner.health);
});

test('a deal offers three different cards, and spells occupy four slots', () => {
    const build = cards.emptyBuild();
    const dealt = cards.dealCards(() => 0.1, build);
    assert.equal(dealt.length, 3);
    assert.equal(new Set(dealt).size, 3);
    cards.applyCard(build, 'sharpened');
    cards.applyCard(build, 'sharpened');
    assert.equal(cards.combatMods(build).damage, 1.24);
    for (const id of ['volley', 'bolt', 'blast', 'rain', 'repel']) cards.applyCard(build, id);
    assert.equal(build.spells.length, 4);
    assert.equal(build.spells.includes('volley'), false);
    assert.equal(build.spells[0], 'bolt');
    const slower = cards.spellCooldown('bolt', build);
    cards.applyCard(build, 'bolt');
    assert.ok(cards.spellCooldown('bolt', build) < slower);
});

test('best wave reads defensively from storage', () => {
    assert.equal(rules.readBestWave({ getItem: () => '7' }, 'key'), 7);
    assert.equal(rules.readBestWave({ getItem: () => null }, 'key'), 0);
    assert.equal(rules.readBestWave({ getItem: () => 'nope' }, 'key'), 0);
    assert.equal(rules.readBestWave({ getItem: () => { throw new Error('blocked'); } }, 'key'), 0);
});
