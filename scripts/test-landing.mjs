import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/landing/rainyAlley.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function fixture({ reduced = false, loaded = true, contextAvailable = true, phone = false } = {}) {
    const motion = Object.assign(new EventTarget(), { matches: reduced });
    const portrait = Object.assign(new EventTarget(), { matches: false });
    const frames = new Map();
    let nextFrame = 0;
    let clears = 0;
    const painted = { strokes: 0, rings: 0, refractions: 0 };
    const clips = [];
    let clipped = false;
    const context = {
        clearRect() { clears++; }, setTransform() {},
        drawImage() { if (clipped) painted.refractions++; },
        save() { clips.push(clipped); }, restore() { clipped = clips.pop(); },
        translate() {}, scale() {}, fillRect() {}, beginPath() {},
        moveTo() {}, lineTo() {}, closePath() {}, clip() { clipped = true; },
        stroke() { painted.strokes++; }, ellipse() { painted.rings++; },
        createRadialGradient() { return { addColorStop() {} }; },
        getImageData() { return { data: new Uint8ClampedArray(4) }; }, putImageData() {},
    };
    const canvas = { clientWidth: phone ? 390 : 1440, clientHeight: phone ? 844 : 900, getContext: () => contextAvailable ? context : null };
    const image = Object.assign(new EventTarget(), { complete: loaded, naturalWidth: phone ? 854 : 1600, naturalHeight: phone ? 1842 : 1000 });
    const document = Object.assign(new EventTarget(), { hidden: false, createElement: () => ({ getContext: () => context }) });
    const window = Object.assign(new EventTarget(), { devicePixelRatio: 2, matchMedia: query => query.includes('reduced-motion') ? motion : portrait });
    const exports = {};
    runInNewContext(js, {
        exports, window, document,
        requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
        cancelAnimationFrame: id => frames.delete(id),
    });
    const alley = new exports.RainyAlley(canvas, image);
    alley.init();
    return { alley, frames, image, motion, window, document, painted,
        advance(now) {
            const [id, callback] = frames.entries().next().value;
            frames.delete(id);
            callback(now);
        },
        get clears() { return clears; },
    };
}

test('reduced motion starts static and responds to preference changes without duplicate loops', () => {
    const f = fixture({ reduced: true });
    assert.equal(f.frames.size, 0);
    f.motion.matches = false;
    f.motion.dispatchEvent(new Event('change'));
    assert.equal(f.frames.size, 1);
    f.motion.dispatchEvent(new Event('change'));
    assert.equal(f.frames.size, 1);
    const clears = f.clears;
    f.motion.matches = true;
    f.motion.dispatchEvent(new Event('change'));
    assert.equal(f.frames.size, 0);
    assert.ok(f.clears > clears, 'changing preference clears the animated overlay');
    f.alley.destroy();
});

test('hidden pages and back-forward cache pause and resume the weather', () => {
    const f = fixture();
    assert.equal(f.frames.size, 1);
    f.document.hidden = true;
    f.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(f.frames.size, 0);
    f.document.hidden = false;
    f.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(f.frames.size, 1);
    f.window.dispatchEvent(new Event('pagehide'));
    assert.equal(f.frames.size, 0);
    f.window.dispatchEvent(new Event('pageshow'));
    assert.equal(f.frames.size, 1);
    f.alley.destroy();
});

test('weather waits for background load and destruction removes event listeners', () => {
    const f = fixture({ loaded: false });
    assert.equal(f.frames.size, 0);
    f.image.dispatchEvent(new Event('load'));
    assert.equal(f.frames.size, 1);
    f.alley.destroy();
    const clears = f.clears;
    for (const [target, event] of [[f.image, 'load'], [f.window, 'pageshow'], [f.document, 'visibilitychange'], [f.motion, 'change']]) {
        target.dispatchEvent(new Event(event));
    }
    assert.equal(f.frames.size, 0);
    assert.equal(f.clears, clears);
});

test('a browser without canvas keeps a static background without scheduling work', () => {
    const f = fixture({ contextAvailable: false });
    assert.equal(f.frames.size, 0);
    assert.doesNotThrow(() => f.alley.destroy());
});

test('animation frames paint rain, ripple rings and clipped water refraction on desktop and phone', () => {
    for (const phone of [false, true]) {
        const f = fixture({ phone });
        for (let time = 1000; time < 4000; time += 40) f.advance(time);
        assert.ok(f.painted.strokes > 0, 'rain must actually be drawn');
        assert.ok(f.painted.rings > 0, 'water impacts must produce expanding rings');
        assert.ok(f.painted.refractions > 0, 'moving reflections must be clipped to water');
        assert.equal(f.frames.size, 1, 'rendering retains a single animation loop');
        f.alley.destroy();
        assert.equal(f.frames.size, 0);
    }
});
