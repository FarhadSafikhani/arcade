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

test('the aim the server fires along matches the camera, and the eye leans only where stone allows', () => {
    const level = rules.aimDirection(0, 0);
    assert.ok(Math.abs(level.x) < 1e-9 && Math.abs(level.y) < 1e-9 && Math.abs(level.z + 1) < 1e-9, 'yaw 0 looks down the bridge (-Z)');
    const up = rules.aimDirection(0, 0.5);
    assert.ok(up.y > 0, 'positive pitch looks up');
    const standing = rules.eyePosition(0, PLAYER.walk.z.max, 0, 0);
    assert.equal(standing.z, PLAYER.walk.z.max, 'looking level does not lean');
    const leaning = rules.eyePosition(0, PLAYER.walk.z.min, 0, -PLAYER.pitchLimit);
    assert.ok(leaning.z < PLAYER.walk.z.min && leaning.z >= PLAYER.leanLimitZ, 'looking down leans out, but not past the limit');
    const turned = rules.turnAboutY({ x: 0, y: 0, z: -1 }, Math.PI / 2);
    assert.ok(Math.abs(turned.x + 1) < 1e-9, 'turning a quarter left swings -Z to -X');
});

test('walking slides along the wall instead of stopping dead', () => {
    const edge = PLAYER.walk.z.min;
    const slid = rules.stepFeet(0, edge, 0.3, -0.5);
    assert.equal(slid.z, edge, 'cannot step off the front of the walkway');
    assert.ok(Math.abs(slid.x - 0.3) < 1e-9, 'but still moves sideways');
});

test('more archers on the wall draw bigger waves', () => {
    assert.deepEqual(rules.spawnList(4, 1), rules.spawnList(4), 'solo waves are unchanged');
    assert.ok(rules.spawnList(4, 3).length > rules.spawnList(4, 2).length);
    assert.ok(rules.spawnList(4, 2).length > rules.spawnList(4, 1).length);
});

test('each extra archer adds a quarter more foes and four fifths more health', () => {
    assert.equal(rules.crowdFactor(1), 1);
    assert.equal(rules.crowdFactor(2), 1.25);
    assert.equal(rules.crowdFactor(4), 1.75);
    assert.equal(rules.wavePlan(8, 1)[0].count, 12);
    assert.equal(rules.wavePlan(8, 2)[0].count, 15);
    assert.equal(rules.scaleEnemy(GOBLIN, 1, 1).health, GOBLIN.health);
    assert.equal(rules.scaleEnemy(GOBLIN, 1, 2).health, Math.round(GOBLIN.health * 1.8));
    assert.equal(rules.scaleEnemy(GOBLIN, 1, 3).health, Math.round(GOBLIN.health * 2.6));
});
