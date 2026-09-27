export function centeredScroll(current: number, cardCenter: number, trackCenter: number, maximum: number): number {
    return Math.max(0, Math.min(maximum, current + cardCenter - trackCenter));
}

export function easeOutCubic(progress: number): number {
    return 1 - (1 - Math.max(0, Math.min(1, progress))) ** 3;
}

/** Owns scrolling, never keyboard focus or the page's scroll position. */
export class GalleryMotion {
    private frame = 0;
    private timer = 0;
    private target: number | null = null;
    private touches = new Set<number>();
    private pointer: { id: number; x: number; scroll: number; dragging: boolean } | null = null;
    private suppressUntil = 0;
    private observer: ResizeObserver;
    private events = new AbortController();
    private selected = 0;
    constructor(private track: HTMLElement, private onSelect: (index: number) => void) {
        const signal = this.events.signal;
        track.addEventListener('pointerdown', e => {
            this.cancel();
            if (e.pointerType === 'touch') { this.touches.add(e.pointerId); return; }
            if (e.button === 0 && !this.pointer) this.pointer = { id: e.pointerId, x: e.clientX,
                scroll: track.scrollLeft, dragging: false };
        }, { signal });
        track.addEventListener('pointermove', e => {
            const p = this.pointer;
            if (!p || p.id !== e.pointerId) return;
            const delta = e.clientX - p.x;
            if (!p.dragging && Math.abs(delta) > 6) {
                p.dragging = true; track.classList.add('is-dragging'); track.setPointerCapture(e.pointerId);
            }
            if (p.dragging) { e.preventDefault(); track.scrollLeft = p.scroll - delta; }
        }, { signal });
        const release = (e: PointerEvent) => {
            this.touches.delete(e.pointerId);
            const p = this.pointer;
            if (p?.id === e.pointerId) {
                this.pointer = null; track.classList.remove('is-dragging');
                if (track.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId);
                if (p.dragging) {
                    this.suppressUntil = performance.now() + 350;
                    this.select(this.nearest());
                }
            }
            this.schedule();
        };
        window.addEventListener('pointerup', release, { signal });
        window.addEventListener('pointercancel', release, { signal });
        track.addEventListener('lostpointercapture', release, { signal });
        // Touch pointercancel occurs when native scrolling takes ownership. Touch events
        // keep settling disabled until the user's fingers actually leave the screen.
        track.addEventListener('touchstart', () => { this.touchActive = true; this.cancel(); }, { passive: true, signal });
        const touchEnd = (e: TouchEvent) => { this.touchActive = e.touches.length > 0; this.schedule(); };
        window.addEventListener('touchend', touchEnd, { passive: true, signal });
        window.addEventListener('touchcancel', touchEnd, { passive: true, signal });
        track.addEventListener('wheel', () => { this.cancel(); this.schedule(); }, { passive: true, signal });
        track.addEventListener('scroll', () => this.schedule(), { passive: true, signal });
        track.addEventListener('scrollend', () => this.schedule(), { signal });
        track.addEventListener('click', e => {
            if (this.suppressesClick(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
        }, { capture: true, signal });
        this.observer = new ResizeObserver(() => this.reset(this.selected));
        this.observer.observe(track);
    }
    private touchActive = false;
    suppressesClick(event: MouseEvent): boolean { return event.detail > 0 && performance.now() < this.suppressUntil; }
    private schedule(): void {
        window.clearTimeout(this.timer);
        if (this.frame || this.pointer || this.touchActive || this.touches.size || !this.track.offsetParent) return;
        this.timer = window.setTimeout(() => this.select(this.nearest()), 160);
    }
    private nearest(): number {
        const rect = this.track.getBoundingClientRect();
        const center = rect.left + this.track.clientWidth / 2;
        let result = this.selected, distance = Infinity;
        Array.from(this.track.children).forEach((card, index) => {
            const r = card.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - center);
            if (d < distance) { result = index; distance = d; }
        });
        return result;
    }
    step(direction: number): void { this.select((this.target ?? this.selected) + direction); }
    reset(index: number): void {
        this.cancel();
        const card = this.track.firstElementChild;
        if (!card || !this.track.offsetParent) return;
        this.select(index, false);
    }
    select(index: number, animate = true): void {
        this.cancel();
        index = Math.max(0, Math.min(this.track.children.length - 1, index));
        const card = this.track.children[index];
        if (!card || !this.track.offsetParent) return;
        const r = card.getBoundingClientRect(), t = this.track.getBoundingClientRect();
        const start = this.track.scrollLeft;
        const end = centeredScroll(start, r.left + r.width / 2, t.left + this.track.clientWidth / 2,
            this.track.scrollWidth - this.track.clientWidth);
        const finish = () => { this.frame = 0; this.target = null; this.selected = index; this.onSelect(index); };
        if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches || Math.abs(end - start) < 0.5) {
            if (Math.abs(end - start) >= 0.5) this.track.scrollLeft = end;
            finish(); return;
        }
        this.target = index;
        const began = performance.now();
        const tick = (now: number) => {
            const progress = Math.min(1, (now - began) / 300);
            this.track.scrollLeft = start + (end - start) * easeOutCubic(progress);
            if (progress < 1) this.frame = requestAnimationFrame(tick); else finish();
        };
        this.frame = requestAnimationFrame(tick);
    }
    cancel(): void {
        cancelAnimationFrame(this.frame); window.clearTimeout(this.timer);
        this.frame = 0; this.target = null;
    }
    suspend(): void {
        this.cancel();
        const pointer = this.pointer; this.pointer = null;
        if (pointer && this.track.hasPointerCapture(pointer.id)) this.track.releasePointerCapture(pointer.id);
        this.touches.clear(); this.touchActive = false; this.track.classList.remove('is-dragging');
    }
    destroy(): void { this.suspend(); this.observer.disconnect(); this.events.abort(); }
}
