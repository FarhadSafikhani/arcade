import * as THREE from 'three';

export interface PreviewScene {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    model: THREE.Group;
    /** Re-frame the camera once the card's real aspect ratio is known. */
    fit?: (camera: THREE.PerspectiveCamera) => void;
    dispose: () => void;
}
interface Target {
    element: HTMLElement;
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    create: () => PreviewScene;
    preview?: PreviewScene;
    near: boolean;
    visible: boolean;
    dirty: boolean;
}

/** One WebGL context produces pixels; DOM-owned canvases provide all clipping. */
export class PreviewGallery {
    private targets: Target[];
    private nearObserver!: IntersectionObserver;
    private visibleObserver: IntersectionObserver;
    private resizeObserver: ResizeObserver;
    private lastFrame = -Infinity;
    private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    private invalidate = () => { for (const target of this.targets) target.dirty = true; };

    constructor(private renderer: THREE.WebGLRenderer, track: HTMLElement,
        entries: { element: HTMLElement; create: () => PreviewScene }[]) {
        this.targets = entries.map(entry => {
            const canvas = document.createElement('canvas');
            canvas.className = 'preview-canvas'; canvas.setAttribute('aria-hidden', 'true');
            canvas.width = canvas.height = 0;
            entry.element.prepend(canvas);
            return { ...entry, canvas, context: canvas.getContext('2d')!, near: false, visible: false, dirty: true };
        });
        const byElement = new Map(this.targets.map(target => [target.element, target]));
        const updateNearby = (entries: IntersectionObserverEntry[]) => {
            for (const entry of entries) {
                const target = byElement.get(entry.target as HTMLElement)!;
                target.near = entry.isIntersecting;
                if (!target.near) this.release(target);
            }
        };
        const makeNearbyObserver = () => {
            const width = track.firstElementChild?.getBoundingClientRect().width ?? 330;
            this.nearObserver?.disconnect();
            this.nearObserver = new IntersectionObserver(updateNearby, { root: track, rootMargin: `0px ${width}px` });
            for (const target of this.targets) this.nearObserver.observe(target.element);
        };
        makeNearbyObserver();
        // A viewport-rooted observer accounts for both carousel and page clipping.
        this.visibleObserver = new IntersectionObserver(entries => {
            for (const entry of entries) {
                const target = byElement.get(entry.target as HTMLElement)!;
                target.visible = entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0;
            }
        });
        this.resizeObserver = new ResizeObserver(() => { this.invalidate(); makeNearbyObserver(); });
        for (const target of this.targets) {
            this.visibleObserver.observe(target.element);
            this.resizeObserver.observe(target.element);
        }
        this.reducedMotion.addEventListener('change', this.invalidate);
    }

    render(now: number): void {
        if (document.hidden || now - this.lastFrame < 1000 / 30) return;
        this.lastFrame = now;
        const ratio = Math.min(devicePixelRatio || 1, 1.5);
        for (const target of this.targets) {
            if (!target.near && !target.visible) continue;
            target.preview ??= target.create();
            if (!target.visible || !target.element.offsetParent) continue;
            const width = Math.max(1, Math.round(target.element.clientWidth * ratio));
            const height = Math.max(1, Math.round(target.element.clientHeight * ratio));
            if (target.canvas.width !== width || target.canvas.height !== height) {
                target.canvas.width = width; target.canvas.height = height; target.dirty = true;
            }
            if (this.reducedMotion.matches && !target.dirty) continue;
            const { scene, camera, model, fit } = target.preview;
            model.rotation.y = this.reducedMotion.matches ? 0 : now * 0.00006;
            camera.aspect = width / height; camera.updateProjectionMatrix();
            fit?.(camera);
            if (this.renderer.domElement.width !== width || this.renderer.domElement.height !== height)
                this.renderer.setSize(width, height, false);
            this.renderer.setViewport(0, 0, width, height);
            this.renderer.setScissorTest(false);
            this.renderer.clear(true, true, true);
            this.renderer.render(scene, camera);
            target.context.clearRect(0, 0, width, height);
            target.context.drawImage(this.renderer.domElement, 0, 0);
            target.element.classList.remove('is-preview-loading');
            target.dirty = false;
        }
    }
    private release(target: Target): void {
        target.preview?.dispose(); target.preview = undefined;
        target.canvas.width = target.canvas.height = 0; target.dirty = true;
        target.element.classList.add('is-preview-loading');
    }
    destroy(): void {
        this.nearObserver.disconnect(); this.visibleObserver.disconnect(); this.resizeObserver.disconnect();
        this.reducedMotion.removeEventListener('change', this.invalidate);
        for (const target of this.targets) { this.release(target); target.canvas.remove(); }
    }
}
