import { AmbientLayer } from './ambient/ambient-layer';
import { addStorySticker, readStoryProgress, resetSceneProgress, restoredPage, sceneComplete, STORY_PAGE_KEY, STORY_SAVE_KEY, STORY_SCENES, stickerPath, StorySticker } from './story-state';

/** Wait for pixels, including cached images, before uncovering the saved page. */
export async function waitForStoryImages(images: readonly HTMLImageElement[], signal: AbortSignal): Promise<void> {
    await Promise.all(images.map(async image => {
        await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                image.removeEventListener('load', loaded);
                image.removeEventListener('error', failed);
                signal.removeEventListener('abort', aborted);
            };
            const loaded = () => { cleanup(); resolve(); };
            const failed = () => { cleanup(); reject(new Error(`Could not load ${image.src}`)); };
            const aborted = () => { cleanup(); reject(new DOMException('Book loading cancelled', 'AbortError')); };
            if (signal.aborted) { aborted(); return; }
            if (image.complete) { if (image.naturalWidth > 0) loaded(); else failed(); return; }
            image.addEventListener('load', loaded, { once: true });
            image.addEventListener('error', failed, { once: true });
            signal.addEventListener('abort', aborted, { once: true });
        });
        await image.decode();
        if (signal.aborted) throw new DOMException('Book loading cancelled', 'AbortError');
    }));
}

export class StickerStorybook {
    readonly element = document.getElementById('stickerStorybook')!;
    private readonly ambient = new AmbientLayer();
    private progress: StorySticker[] = [];
    private page = 0;
    private pendingCompletionPage: number | null = null;
    private turnTimer: ReturnType<typeof setTimeout> | null = null;
    private boot: AbortController | null = null;
    private bootFinished = false;
    private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    constructor(private readonly start: (id: StorySticker, grid: number) => void) {
        try {
            this.progress = readStoryProgress(localStorage.getItem(STORY_SAVE_KEY));
            this.page = restoredPage(localStorage.getItem(STORY_PAGE_KEY), this.progress);
        } catch { /* Session-only progress when storage is unavailable. */ }
        this.element.id = 'stickerStorybook';
        this.element.classList.add('story-shell');
        this.element.setAttribute('aria-label', 'Painted sticker book');
        document.body.appendChild(this.element);
        this.element.querySelector('.book-boot-retry')?.addEventListener('click', () => void this.loadBook());
        void this.loadBook();
    }
    private stopTurn(): void {
        if (this.turnTimer !== null) clearTimeout(this.turnTimer);
        this.turnTimer = null;
        this.element.classList.remove('turning-forward', 'turning-backward');
    }
    hide(): void { this.stopTurn(); this.stopCelebration(); this.ambient.detach(); this.element.hidden = true; }
    show(): void { this.element.hidden = false; if (this.bootFinished) this.render(); }
    destroy(): void { this.boot?.abort(); this.stopTurn(); this.ambient.destroy(); this.element.remove(); }

    private async loadBook(): Promise<void> {
        this.boot?.abort();
        const boot = this.boot = new AbortController();
        const status = this.element.querySelector<HTMLElement>('.book-boot-status p')!;
        const retry = this.element.querySelector<HTMLButtonElement>('.book-boot-retry')!;
        this.element.classList.remove('boot-error', 'boot-fading', 'boot-opening');
        this.element.setAttribute('aria-busy', 'true');
        status.textContent = 'Gathering a little magic…';
        retry.hidden = true;
        this.render();
        try {
            await waitForStoryImages([...this.element.querySelectorAll<HTMLImageElement>('.story-pages img')], boot.signal);
            this.element.classList.add('boot-fading');
            status.textContent = 'Your story is ready';
            // CSS owns the pacing; reduced motion has no animations to wait for.
            await Promise.all(this.element.querySelector('.book-magic')!.getAnimations().map(animation => animation.finished.catch(() => {})));
            if (boot.signal.aborted) return;
            this.element.classList.add('boot-opening');
            await Promise.all(this.element.querySelector('.story-cover')!.getAnimations().map(animation => animation.finished.catch(() => {})));
            if (boot.signal.aborted) return;
            this.bootFinished = true;
            this.element.querySelector('.story-cover')?.remove();
            this.element.querySelector('.book-boot-status')?.remove();
            this.element.querySelector('.story-pages')?.removeAttribute('inert');
            this.element.classList.remove('boot-loading', 'boot-fading', 'boot-opening');
            this.element.setAttribute('aria-busy', 'false');
            this.renderDevControls();
            if (!this.element.hidden) this.attachAmbient();
        } catch {
            if (boot.signal.aborted) return;
            boot.abort(); // Release listeners on any images still pending after a failure.
            this.element.classList.add('boot-error');
            this.element.setAttribute('aria-busy', 'false');
            status.textContent = 'The story couldn’t load. Let’s try that again.';
            retry.hidden = false;
        }
    }

    private attachAmbient(): void {
        void this.ambient.attach(this.element.querySelector<HTMLElement>('.ambient-slot')!, STORY_SCENES[this.page].effects);
    }

    private renderDevControls(): void {
        this.element.querySelector('.stickers-dev-panel')?.remove();
        if (!import.meta.env.DEV || !this.bootFinished) return;
        this.element.insertAdjacentHTML('beforeend', '<details class="stickers-dev-panel"><summary>[DEV]</summary><div><button type="button" class="complete-page">Complete Page</button><button type="button" class="reset-page">Reset page puzzles</button></div></details>');
        this.element.querySelector('.complete-page')?.addEventListener('click', () => this.completePage());
        this.element.querySelector('.reset-page')?.addEventListener('click', () => this.resetPage());
    }
    record(id: StorySticker): void {
        const wasComplete = sceneComplete(this.progress, this.page);
        this.progress = addStorySticker(this.progress, id);
        if (!wasComplete && sceneComplete(this.progress, this.page)) this.pendingCompletionPage = this.page;
        try { localStorage.setItem(STORY_SAVE_KEY, JSON.stringify(this.progress)); } catch { /* Keep playing without disk. */ }
    }
    reportError(): void {
        const error = this.element.querySelector<HTMLElement>('.story-error')!;
        error.hidden = false;
        error.textContent = 'Could not load this sticker. Try again.';
    }
    place(id: StorySticker): void {
        this.record(id);
        this.show();
        this.celebrateCompletion();
        if (this.reducedMotion.matches) return;
        const sticker = this.element.querySelector(`[data-sticker="${id}"]`);
        sticker?.classList.add('slap');
        sticker?.querySelector('img')?.addEventListener('animationend', () => sticker.classList.remove('slap'), { once: true });
    }
    private completePage(): void {
        if (!import.meta.env.DEV) return;
        const scene = STORY_SCENES[this.page];
        for (const animal of scene.animals) this.record(`${scene.id}:${animal.id}` as StorySticker);
        this.render();
        this.celebrateCompletion();
    }
    private resetPage(): void {
        if (!import.meta.env.DEV) return;
        this.pendingCompletionPage = null;
        this.progress = resetSceneProgress(this.progress, this.page);
        try { localStorage.setItem(STORY_SAVE_KEY, JSON.stringify(this.progress)); } catch { /* Session-only reset. */ }
        this.render();
    }
    private turn(direction: -1 | 1): void {
        if (this.turnTimer !== null) return;
        const next = this.page + direction;
        if (!STORY_SCENES[next] || (direction === 1 && !sceneComplete(this.progress, this.page))) return;
        this.stopCelebration();
        const commit = () => {
            this.page = next;
            try { localStorage.setItem(STORY_PAGE_KEY, String(next)); } catch { /* Session-only page. */ }
            this.render();
        };
        if (this.reducedMotion.matches) { commit(); return; }
        this.element.classList.add(direction === 1 ? 'turning-forward' : 'turning-backward');
        this.turnTimer = setTimeout(commit, 450);
    }
    private render(): void {
        this.stopTurn();
        this.stopCelebration();
        const scene = STORY_SCENES[this.page];
        const complete = sceneComplete(this.progress, this.page);
        const nextDust = this.page < STORY_SCENES.length - 1 ? `<span class="next-hover-dust" aria-hidden="true">${Array.from({ length: 12 }, (_, mote) =>
            `<span style="--rush-x:${12 + mote % 4 * 9}%;--rush-y:${25 + mote * 17 % 51}%;--rush-dx:${.85 + mote % 5 * .08};--rush-dy:${-14 + mote * 11 % 29}px;--rush-delay:${mote * .018}s;--rush-size:${mote % 3 === 0 ? 3 : 2}px"></span>`).join('')}</span>` : '';
        this.element.querySelector('.story-pages')!.innerHTML = `<div class="painted-page ${complete ? 'page-complete' : ''}">
          <img class="pond-painting" src="/arcade/assets/stickers/story/${scene.background}" alt="${scene.description}" draggable="false">
          <div class="ambient-slot" aria-hidden="true"></div>
          ${scene.animals.map((animal, index) => {
              const id = `${scene.id}:${animal.id}` as StorySticker;
              const done = this.progress.includes(id);
              const dust = done ? '' : `<span class="shimmer-dust" aria-hidden="true">${[
                  [27, 40, -10, -25], [43, 29, 8, -32], [61, 38, -5, -28],
                  [72, 58, 14, -35], [36, 61, -14, -30], [57, 54, 6, -40],
              ].map(([x, y, drift, rise], mote) => `<span style="--dust-x:${x}%;--dust-y:${y}%;--drift:${drift}px;--rise:${rise}px;--dust-size:${mote % 2 ? 2 : 3}px"></span>`).join('')}</span>`;
              return `<button type="button" class="pond-sticker ${done ? 'completed' : 'silhouette'}" data-sticker="${id}" style="${animal.anchor === 'feet' ? 'translate:-50% -100%;' : ''}--x:${animal.x}%;--y:${animal.y}%;--w:${animal.width}%;--shimmer-delay:${index * 0.8}s;--bird:url('${stickerPath(id)}')" aria-label="${done ? 'Replay' : 'Build'} ${animal.id}"><img src="${stickerPath(id)}" alt="" draggable="false">${dust}</button>`;
          }).join('')}
          ${this.page > 0 ? '<button type="button" class="page-arrow previous-page" aria-label="Previous scene">‹</button>' : ''}
          ${this.page < STORY_SCENES.length - 1 ? `<button type="button" class="page-arrow next-page" aria-label="Next scene" ${complete ? '' : 'disabled'}>
            <svg class="next-ornament" viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M26 7c-7 0-19 12-19 19m31-19c7 0 19 12 19 19M7 38c0 7 12 19 19 19m31-19c0 7-12 19-19 19"/><path d="M32 4l3 4-3 4-3-4zm28 28-4 3-4-3 4-3zM32 60l-3-4 3-4 3 4zM4 32l4-3 4 3-4 3z"/></svg>
            <svg class="next-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h13m-5-6 6 6-6 6"/></svg>
          </button>` : complete ? '<span class="book-complete-note">Book complete <span aria-hidden="true">✧</span></span>' : ''}
          <p class="story-status" role="status" aria-live="polite"></p>
          <p class="story-error" role="alert" hidden></p>
        </div>${nextDust}`;
        this.renderDevControls();
        if (this.bootFinished) this.attachAmbient();
        this.element.querySelectorAll<HTMLButtonElement>('[data-sticker]').forEach(button => {
            button.addEventListener('click', () => {
                const grid = Number(document.querySelector<HTMLSelectElement>('#storyDifficulty')?.value || 3);
                this.start(button.dataset.sticker as StorySticker, grid);
            });
        });
        this.element.querySelector('.next-page')?.addEventListener('click', () => this.turn(1));
        this.element.querySelector('.previous-page')?.addEventListener('click', () => this.turn(-1));
    }

    private stopCelebration(): void {
        this.element.querySelector('.completion-fireflies')?.remove();
        this.element.querySelector('.painted-page')?.classList.remove('celebrating');
    }

    private celebrateCompletion(): void {
        if (this.pendingCompletionPage !== this.page || !sceneComplete(this.progress, this.page)) return;
        this.pendingCompletionPage = null;
        const page = this.element.querySelector<HTMLElement>('.painted-page')!;
        const hasNext = this.page < STORY_SCENES.length - 1;
        this.element.querySelector('.story-status')!.textContent = hasNext
            ? 'Page complete! Your next adventure is ready.' : 'Book complete! Every animal is home.';
        if (this.reducedMotion.matches) return;

        const flies = document.createElement('div');
        flies.className = 'completion-fireflies';
        flies.setAttribute('aria-hidden', 'true');
        const animals = STORY_SCENES[this.page].animals;
        flies.innerHTML = '<span class="completion-bloom"></span>' + animals.flatMap((animal, index) =>
            Array.from({ length: 5 }, (_, mote) => {
                const angle = mote * Math.PI * 2 / 5;
                const x = Math.min(91, Math.max(5, animal.x + animal.width * .5 + Math.cos(angle) * 3));
                const y = Math.min(87, Math.max(8, animal.y + animal.width * (animal.anchor === 'feet' ? -.45 : .35) + Math.sin(angle) * 4));
                return `<span class="completion-firefly" style="--fly-x:${x}%;--fly-y:${y}%;--fly-bend-x:${x + (94 - x) * .55}%;--fly-bend-y:${Math.max(8, y - 12)}%;--fly-sway:${mote % 2 ? -1 : 1};--fly-delay:${.55 + (index * 5 + mote) * .018}s;--fly-size:${mote % 2 ? 3 : 4}px"></span>`;
            })).join('');
        page.appendChild(flies);
        page.classList.add('celebrating');
        const last = flies.lastElementChild!;
        last.addEventListener('animationend', () => {
            flies.remove();
            page.classList.remove('celebrating');
        }, { once: true });
    }
}
