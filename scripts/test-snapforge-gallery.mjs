import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

async function load(name) {
    const source = readFileSync(new URL(`../src/games/snapforge/${name}.ts`, import.meta.url), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
    return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
const { GalleryMotion, centeredScroll, easeOutCubic } = await load('gallery-motion');
const { PreviewGallery } = await load('preview-gallery');
let frames, timers, resizeObservers, intersections, reduced;
function environment() {
    frames = new Map(); timers = new Map(); resizeObservers = []; intersections = []; reduced = false;
    let id = 0;
    globalThis.window = new EventTarget();
    window.setTimeout = fn => { timers.set(++id, fn); return id; };
    window.clearTimeout = id => timers.delete(id);
    globalThis.requestAnimationFrame = fn => { frames.set(++id, fn); return id; };
    globalThis.cancelAnimationFrame = id => frames.delete(id);
    globalThis.matchMedia = () => ({ get matches() { return reduced; }, addEventListener() {}, removeEventListener() {} });
    globalThis.ResizeObserver = class {
        constructor(callback) { this.callback = callback; resizeObservers.push(this); }
        observe() {} disconnect() { this.disconnected = true; }
    };
    globalThis.IntersectionObserver = class {
        constructor(callback, options) { this.callback = callback; this.options = options; intersections.push(this); }
        observe() {} disconnect() { this.disconnected = true; }
    };
    globalThis.devicePixelRatio = 2;
}
function emit(target, type, fields = {}) {
    const e = new Event(type, { cancelable: true }); Object.assign(e, fields); target.dispatchEvent(e); return e;
}
function advance(time) { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(time)); }
function idle() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); }
function trackFixture() {
    const track = new EventTarget();
    Object.assign(track, { clientWidth: 1000, scrollWidth: 2400, scrollLeft: 0, style: {}, offsetParent: {},
        getBoundingClientRect: () => ({ left: 20, width: 1000 }),
        classList: { add() {}, remove() {} }, hasPointerCapture: () => false, setPointerCapture() {}, releasePointerCapture() {} });
    track.children = Array.from({ length: 5 }, (_, i) => ({ getBoundingClientRect: () => ({ left: 355 + i * 350 - track.scrollLeft, width: 330 }) }));
    track.firstElementChild = track.children[0];
    return track;
}
test('centering clamps to reachable bounds; easing is monotonic with a gentle finish', () => {
    assert.equal(centeredScroll(0, 200, 500, 1000), 0);
    assert.equal(centeredScroll(400, 700, 500, 1000), 600);
    assert.equal(centeredScroll(900, 800, 500, 1000), 1000);
    assert.equal(easeOutCubic(0), 0); assert.equal(easeOutCubic(1), 1);
    assert.ok(easeOutCubic(0.5) > 0.5);
    assert.ok(easeOutCubic(0.9) - easeOutCubic(0.8) < easeOutCubic(0.2) - easeOutCubic(0.1));
});
test('navigation keeps destination stable and repeated arrows advance from pending target', () => {
    environment(); const track = trackFixture(); const selected = [];
    const motion = new GalleryMotion(track, index => selected.push(index));
    motion.step(1); motion.step(1);
    assert.deepEqual(selected, []);
    advance(performance.now() + 400);
    assert.deepEqual(selected, [2]); assert.equal(track.scrollLeft, 700);
    motion.destroy(); assert.equal(frames.size, 0); assert.ok(resizeObservers[0].disconnected);
});
test('wheel and pointer interrupt easing; drag release settles without activating the card', () => {
    environment(); const track = trackFixture(); const motion = new GalleryMotion(track, () => {});
    motion.step(1); emit(track, 'wheel'); assert.equal(frames.size, 0);
    emit(track, 'pointerdown', { pointerType: 'mouse', button: 0, pointerId: 1, clientX: 600 });
    emit(track, 'pointermove', { pointerId: 1, clientX: 170 }); assert.equal(track.scrollLeft, 430);
    emit(window, 'pointerup', { pointerId: 1 }); assert.equal(frames.size, 1);
    assert.equal(emit(track, 'click', { detail: 1 }).defaultPrevented, true);
    advance(performance.now() + 400); assert.equal(track.scrollLeft, 350);
    motion.destroy();
});
test('native touch ownership prevents settling until fingers lift and scrolling is idle', () => {
    environment(); const track = trackFixture(); const motion = new GalleryMotion(track, () => {});
    emit(track, 'pointerdown', { pointerType: 'touch', pointerId: 1 });
    emit(track, 'touchstart'); emit(window, 'pointercancel', { pointerId: 1 });
    track.scrollLeft = 430; emit(track, 'scroll'); idle(); assert.equal(frames.size, 0);
    emit(window, 'touchend', { touches: [] }); emit(track, 'scroll'); idle(); assert.equal(frames.size, 1);
    advance(performance.now() + 400); assert.equal(track.scrollLeft, 350);
    motion.destroy();
});
test('reduced motion aligns immediately and resize realigns without animation', () => {
    environment(); reduced = true; const track = trackFixture(); const motion = new GalleryMotion(track, () => {});
    motion.select(3); assert.equal(track.scrollLeft, 1050); assert.equal(frames.size, 0);
    resizeObservers[0].callback(); assert.equal(track.scrollLeft, 1050); assert.equal(frames.size, 0);
    motion.destroy();
});
test('preview visibility bounds work, caps updates, releases buffers, and cleans observers', () => {
    environment(); let draws = 0, created = 0, disposed = 0, copies = 0;
    globalThis.document = { hidden: false, createElement: () => ({ width: 0, height: 0, setAttribute() {},
        getContext: () => ({ clearRect() {}, drawImage() { copies++; } }), remove() {} }) };
    const renderer = { domElement: { width: 1, height: 1 }, setSize(w, h) { this.domElement.width = w; this.domElement.height = h; },
        setViewport() {}, setScissorTest() {}, clear() {}, render() { draws++; } };
    const elements = Array.from({ length: 3 }, () => {
        const classes = new Set(['is-preview-loading']);
        return { clientWidth: 328, clientHeight: 244, offsetParent: {},
            classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
            prepend(canvas) { this.canvas = canvas; } };
    });
    const gallery = new PreviewGallery(renderer, trackFixture(), elements.map(element => ({ element, create: () => {
        created++; return { scene: {}, camera: { updateProjectionMatrix() {} }, model: { rotation: {} }, dispose() { disposed++; } };
    } })));
    const near = intersections[0], visible = intersections[1];
    near.callback(elements.slice(0, 2).map(target => ({ target, isIntersecting: true })));
    visible.callback([{ target: elements[0], isIntersecting: true, intersectionRect: { width: 50, height: 244 } }]);
    gallery.render(0); assert.equal(created, 2); assert.equal(draws, 1); assert.equal(copies, 1);
    assert.equal(elements[0].classList.contains('is-preview-loading'), false);
    assert.equal(elements[1].classList.contains('is-preview-loading'), true);
    assert.equal(elements[0].canvas.width, 492); assert.equal(elements[1].canvas.width, 0);
    gallery.render(16); assert.equal(draws, 1); gallery.render(34); assert.equal(draws, 2);
    document.hidden = true; gallery.render(100); assert.equal(draws, 2); document.hidden = false;
    reduced = true; gallery.render(150); assert.equal(draws, 2);
    resizeObservers[0].callback(); gallery.render(200); assert.equal(draws, 3);
    visible.callback([{ target: elements[0], isIntersecting: false, intersectionRect: { width: 0, height: 0 } }]);
    near.callback([{ target: elements[0], isIntersecting: false }]);
    assert.equal(disposed, 1); assert.equal(elements[0].canvas.width, 0);
    assert.equal(elements[0].classList.contains('is-preview-loading'), true);
    gallery.render(240); assert.equal(draws, 3);
    gallery.destroy(); assert.equal(disposed, 2); assert.ok(intersections.every(o => o.disconnected));
});
