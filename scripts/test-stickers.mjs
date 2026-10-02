import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/games/stickers/preparation.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { prepareStickerPixels, StickerPreparationCache } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

const moduleUrl = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const makerSource = readFileSync(new URL('../src/games/stickers/stickermaker.ts', import.meta.url), 'utf8');
const makerJs = ts.transpileModule(makerSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText
    .replace("from 'pixi.js'", `from '${new URL('../node_modules/pixi.js/lib/index.mjs', import.meta.url).href}'`)
    .replace("from './game'", `from '${moduleUrl('export const STICKER_GAME_CONFIG = { gideSizeMedium: 5 };')}'`)
    .replace("from '../../version'", `from '${moduleUrl('export const VERSION = "test";')}'`)
    .replace("from './preparation'", `from '${moduleUrl(js)}'`);
const { StickerMaker } = await import(moduleUrl(makerJs));

const storySource = readFileSync(new URL('../src/games/stickers/story-state.ts', import.meta.url), 'utf8');
const storyJs = ts.transpileModule(storySource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { readStoryProgress, addStorySticker, resetSceneProgress, sceneComplete, restoredPage, STORY_SCENES } = await import(moduleUrl(storyJs));

test('storybook saves are bounded, tolerate invalid data, and keep placements idempotent', () => {
    for (const raw of [null, '{', '{}', 'false', '"pond:duck"']) assert.deepEqual(readStoryProgress(raw), []);
    assert.deepEqual(readStoryProgress('["pond:duck","unknown","pond:duck","pond:swan"]'), ['pond:duck', 'pond:swan']);
    const progress = addStorySticker(['pond:duck'], 'pond:swan');
    assert.deepEqual(addStorySticker(progress, 'pond:swan'), ['pond:duck', 'pond:swan']);
    assert.deepEqual(addStorySticker(progress, 'pond:heron'), ['pond:duck', 'pond:swan', 'pond:heron']);
});

test('the first scene includes the raccoon; only all its own completions unlock the next scene', () => {
    assert.deepEqual(STORY_SCENES.map(scene => scene.birds.length), [4, 3]);
    const partial = ['pond:duck', 'pond:swan', 'twilight:heron'];
    assert.equal(sceneComplete(partial, 0), false);
    assert.equal(restoredPage('1', partial), 0);
    const birdsComplete = addStorySticker(partial, 'pond:heron');
    assert.equal(sceneComplete(birdsComplete, 0), false);
    assert.equal(restoredPage('1', birdsComplete), 0);
    const complete = addStorySticker(birdsComplete, 'pond:raccoon');
    assert.equal(sceneComplete(complete, 0), true);
    assert.equal(sceneComplete(complete, 1), false);
    assert.equal(restoredPage('1', complete), 1);
    for (const raw of ['-1', '2', 'NaN', '1.5']) assert.equal(restoredPage(raw, complete), 0);
});

test('resetting a page removes only its stickers and locks its next-page progression again', () => {
    const saved = ['pond:duck', 'pond:swan', 'pond:heron', 'pond:raccoon', 'twilight:duck'];
    const reset = resetSceneProgress(saved, 0);
    assert.deepEqual(reset, ['twilight:duck']);
    assert.deepEqual(saved, ['pond:duck', 'pond:swan', 'pond:heron', 'pond:raccoon', 'twilight:duck']);
    assert.equal(sceneComplete(reset, 0), false);
    assert.equal(restoredPage('1', reset), 0);
    assert.deepEqual(resetSceneProgress(saved, 1), ['pond:duck', 'pond:swan', 'pond:heron', 'pond:raccoon']);
});

test('storybook completion places only a finished puzzle and clears the pending return', async () => {
    const gameSource = readFileSync(new URL('../src/games/stickers/game.ts', import.meta.url), 'utf8');
    const gameJs = ts.transpileModule(gameSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
        .replace("from 'pixi.js'", `from '${new URL('../node_modules/pixi.js/lib/index.mjs', import.meta.url).href}'`)
        .replace("from './stickermaker'", `from '${moduleUrl('export class StickerMaker {}')}'`)
        .replace("from './storybook'", `from '${moduleUrl('export class StickerStorybook {}')}'`)
        .replace("from './story-state'", `from '${moduleUrl(storyJs)}'`);
    const previous = globalThis.window;
    globalThis.window = { addEventListener() {} };
    try {
        const { StickersGame } = await import(moduleUrl(gameJs));
        const placed = [];
        const saved = [];
        const game = Object.assign(Object.create(StickersGame.prototype), {
            levelRequest: 0, storySticker: 'pond:duck', storyCompleted: false,
            storybook: { place: id => placed.push(id), record: id => saved.push(id) }, stickerMaker: { cleanup() {} },
            gameContainer: { removeChildren() {} }, userState: { levelsCompleted: [] },
            setPreparing() {}, hideReturnButton() {}, showLevelMenu() {}, populateLevelMenu() {},
        });
        game.returnToLevelMenu();
        assert.deepEqual(placed, []);
        assert.deepEqual(saved, []);
        game.storySticker = 'pond:duck';
        game.setLevelCompleted('scene_pond:duck');
        assert.equal(game.storyCompleted, true);
        assert.deepEqual(saved, ['pond:duck']);
        assert.deepEqual(game.userState.levelsCompleted, []);
        game.returnToLevelMenu();
        assert.deepEqual(placed, ['pond:duck']);
        assert.equal(game.storySticker, null);
        assert.equal(game.storyCompleted, false);
        game.returnToLevelMenu();
        assert.deepEqual(placed, ['pond:duck']);
    } finally { globalThis.window = previous; }
});

function introFixture(reduced = false) {
    const callbacks = new Set();
    const container = () => ({ alpha: 0, eventMode: 'none', removeChildren() {} });
    const sprite = x => ({ x, width: 40, alpha: 0, destroy() { this.destroyed = true; } });
    const maker = Object.assign(Object.create(StickerMaker.prototype), {
        app: { ticker: { elapsedMS: 0, add: fn => callbacks.add(fn), remove: fn => callbacks.delete(fn) } },
        chunks: { left: { sprite: sprite(20) }, right: { sprite: sprite(940) } },
        holes: {}, holeContainer: container(), chunkContainer: container(), currentStickerSprite: null,
        reducedMotion: { matches: reduced }, gameWidth: 1000, generation: 0,
        activeChunk: null, pieceTextures: new Set(), maskTexture: null,
    });
    const advance = ms => { maker.app.ticker.elapsedMS = ms; for (const fn of [...callbacks]) fn(); };
    return { maker, advance, callbacks };
}

function pixels(width, height, alpha = () => 255) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[(y * width + x) * 4 + 3] = alpha(x, y);
    return data;
}

test('uneven grids cover the source exactly and preserve all three cut choices', async () => {
    const plan = await prepareStickerPixels(pixels(11, 7), 11, 7, 3, 0.1);
    const coverage = new Uint8Array(77);
    for (const [square, rising, falling] of plan.cells) {
        assert.equal(square.length, 1);
        assert.equal(rising.length, 2);
        assert.equal(falling.length, 2);
        const p = square[0];
        for (let y = p.y; y < p.y + p.height; y++) for (let x = p.x; x < p.x + p.width; x++) coverage[y * 11 + x]++;
        assert.deepEqual(rising[0].points, [0, 0, p.width, 0, 0, p.height]);
        assert.deepEqual(falling[1].points, [0, 0, p.width, p.height, 0, p.height]);
    }
    assert.ok(coverage.every(n => n === 1));
    assert.ok(plan.silhouette.every(n => n === 255));
});

test('visibility is measured per triangle; transparent pieces are skipped and faint edges stay uncovered', async () => {
    const plan = await prepareStickerPixels(pixels(10, 10, (x, y) => x + y < 9 ? 255 : 0), 10, 10, 1, 0.1);
    assert.equal(plan.cells[0][0].length, 1);
    assert.equal(plan.cells[0][1].length, 1);
    assert.deepEqual(plan.cells[0][1][0].points, [0, 0, 10, 0, 0, 10]);
    const empty = await prepareStickerPixels(pixels(4, 4, () => 0), 4, 4, 2, 0.1);
    assert.ok(empty.cells.flat(2).length === 0);
    const edges = await prepareStickerPixels(pixels(2, 2, x => x ? 201 : 200), 2, 2, 1, 0.1);
    assert.deepEqual([...edges.silhouette], [0, 255, 0, 255]);
    assert.equal(edges.cells[0][0].length, 1);
});

test('first preparation yields to the browser while scanning larger images', async () => {
    const original = globalThis.performance;
    let time = 0, yields = 0;
    globalThis.performance = { now: () => time += 2 };
    try {
        await prepareStickerPixels(pixels(128, 128), 128, 128, 7, 0.1, async () => { yields++; });
        assert.ok(yields > 1);
    } finally { globalThis.performance = original; }
});

test('concurrent loads share preparation; a new session reuses persisted data', async () => {
    const disk = new Map();
    let builds = 0;
    const create = async () => { builds++; return prepareStickerPixels(pixels(4, 4), 4, 4, 2, 0.1); };
    const read = async key => structuredClone(disk.get(key));
    const write = async (key, value) => { disk.set(key, structuredClone(value)); };
    const cache = new StickerPreparationCache(read, write);
    const [a, b] = await Promise.all([cache.get('release:lion:2', create), cache.get('release:lion:2', create)]);
    assert.strictEqual(a, b);
    assert.equal(builds, 1);
    const newSession = new StickerPreparationCache(read, write);
    const restored = await newSession.get('release:lion:2', create);
    assert.equal(builds, 1);
    assert.deepEqual(restored, a);
    await newSession.get('release:lion:3', create);
    await newSession.get('next-release:lion:2', create);
    assert.equal(builds, 3);
});

test('unavailable storage falls back to preparation; failures can be retried and memory is bounded', async () => {
    const cache = new StickerPreparationCache(async () => { throw new Error('Denied'); }, async () => { throw new Error('Quota'); });
    let builds = 0;
    const create = async () => { builds++; return { width: 1, height: 1, silhouette: new Uint8Array([255]), cells: [] }; };
    await assert.rejects(cache.get('broken', async () => { throw new Error('Image unavailable'); }));
    await cache.get('broken', create);
    for (let i = 0; i < 4; i++) await cache.get(`other:${i}`, create);
    await cache.get('broken', create);
    assert.equal(builds, 6);
});

test('slots appear before pieces arrive from opposite edges, with dragging enabled only after arrival', async () => {
    const { maker, advance, callbacks } = introFixture();
    const intro = maker.revealSticker();
    assert.ok(maker.chunks.left.sprite.x < 0);
    assert.ok(maker.chunks.right.sprite.x > 1000);
    advance(200);
    assert.ok(maker.holeContainer.alpha > 0);
    assert.equal(maker.chunks.left.sprite.alpha, 0);
    assert.equal(maker.chunkContainer.eventMode, 'none');
    advance(800);
    await intro;
    assert.equal(maker.chunks.left.sprite.x, 20);
    assert.equal(maker.chunks.right.sprite.x, 940);
    assert.equal(maker.chunks.right.sprite.alpha, 1);
    assert.equal(maker.chunkContainer.eventMode, 'auto');
    assert.equal(callbacks.size, 0);
});

test('reduced motion fades in place; leaving the scene stops the intro and resolves its pending load', async () => {
    const { maker, advance } = introFixture(true);
    const intro = maker.revealSticker();
    assert.equal(maker.chunks.left.sprite.x, 20);
    advance(120);
    await intro;
    const cancelled = introFixture();
    const pending = cancelled.maker.revealSticker();
    const oldSprite = cancelled.maker.chunks.left.sprite;
    cancelled.maker.cleanup();
    await pending;
    assert.equal(cancelled.callbacks.size, 0);
    assert.ok(oldSprite.destroyed);
    assert.deepEqual(cancelled.maker.chunks, {});
    assert.equal(cancelled.maker.generation, 1);
});
