import { addStorySticker, readStoryProgress, resetSceneProgress, restoredPage, sceneComplete, STORY_PAGE_KEY, STORY_SAVE_KEY, STORY_SCENES, stickerPath, StorySticker } from './story-state';

export class StickerStorybook {
    readonly element = document.createElement('section');
    private progress: StorySticker[] = [];
    private page = 0;
    private turnTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    constructor(private readonly start: (id: StorySticker, grid: number) => void) {
        try {
            this.progress = readStoryProgress(localStorage.getItem(STORY_SAVE_KEY));
            this.page = restoredPage(localStorage.getItem(STORY_PAGE_KEY), this.progress);
        } catch { /* Session-only progress when storage is unavailable. */ }
        this.element.id = 'stickerStorybook';
        this.element.className = 'story-shell';
        this.element.setAttribute('aria-label', 'Painted sticker book');
        document.body.appendChild(this.element);
        this.render();
    }
    private stopTurn(): void {
        if (this.turnTimer !== null) clearTimeout(this.turnTimer);
        this.turnTimer = null;
        this.element.classList.remove('turning-forward', 'turning-backward');
    }
    hide(): void { this.stopTurn(); this.element.hidden = true; }
    show(): void { this.element.hidden = false; this.render(); }
    destroy(): void { this.stopTurn(); this.element.remove(); }
    record(id: StorySticker): void {
        this.progress = addStorySticker(this.progress, id);
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
        if (this.reducedMotion.matches) return;
        const sticker = this.element.querySelector(`[data-sticker="${id}"]`);
        sticker?.classList.add('slap');
        sticker?.querySelector('img')?.addEventListener('animationend', () => sticker.classList.remove('slap'), { once: true });
    }
    private resetPage(): void {
        if (!import.meta.env.DEV) return;
        this.progress = resetSceneProgress(this.progress, this.page);
        try { localStorage.setItem(STORY_SAVE_KEY, JSON.stringify(this.progress)); } catch { /* Session-only reset. */ }
        this.render();
    }
    private turn(direction: -1 | 1): void {
        if (this.turnTimer !== null) return;
        const next = this.page + direction;
        if (!STORY_SCENES[next] || (direction === 1 && !sceneComplete(this.progress, this.page))) return;
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
        const scene = STORY_SCENES[this.page];
        const complete = sceneComplete(this.progress, this.page);
        this.element.innerHTML = `<div class="story-book"><div class="painted-page">
          <img class="pond-painting" src="/arcade/assets/stickers/story/${scene.background}" alt="${this.page === 0 ? 'Sunlit fantasy pond with water lilies and a mossy woodland bank' : 'A woodland pond glowing in the last light of dusk'}" draggable="false">
          ${scene.birds.map((bird, index) => {
              const id: StorySticker = `${scene.id}:${bird.id}`;
              const done = this.progress.includes(id);
              const dust = done ? '' : `<span class="shimmer-dust" aria-hidden="true">${[
                  [27, 40, -10, -25], [43, 29, 8, -32], [61, 38, -5, -28],
                  [72, 58, 14, -35], [36, 61, -14, -30], [57, 54, 6, -40],
              ].map(([x, y, drift, rise], mote) => `<span style="--dust-x:${x}%;--dust-y:${y}%;--drift:${drift}px;--rise:${rise}px;--dust-size:${mote % 2 ? 2 : 3}px"></span>`).join('')}</span>`;
              return `<button type="button" class="pond-sticker ${done ? 'completed' : 'silhouette'}" data-sticker="${id}" style="--x:${bird.x}%;--y:${bird.y}%;--w:${bird.width}%;--shimmer-delay:${index * 0.8}s;--bird:url('${stickerPath(id)}')" aria-label="${done ? 'Replay' : 'Build'} ${bird.id}"><img src="${stickerPath(id)}" alt="" draggable="false">${dust}</button>`;
          }).join('')}
          ${this.page > 0 ? '<button type="button" class="page-arrow previous-page" aria-label="Previous scene">‹</button>' : ''}
          ${this.page < STORY_SCENES.length - 1 ? `<button type="button" class="page-arrow next-page" aria-label="Next scene" ${complete ? '' : 'disabled'}>›</button>` : ''}
          <p class="story-error" role="alert" hidden></p>
        </div></div>${import.meta.env.DEV ? '<details class="stickers-dev-panel"><summary>[DEV]</summary><div><button type="button" class="reset-page">Reset page puzzles</button></div></details>' : ''}`;
        this.element.querySelectorAll<HTMLButtonElement>('[data-sticker]').forEach(button => {
            button.addEventListener('click', () => {
                const grid = Number(document.querySelector<HTMLSelectElement>('#storyDifficulty')?.value || 3);
                this.start(button.dataset.sticker as StorySticker, grid);
            });
        });
        this.element.querySelector('.next-page')?.addEventListener('click', () => this.turn(1));
        this.element.querySelector('.previous-page')?.addEventListener('click', () => this.turn(-1));
        this.element.querySelector('.reset-page')?.addEventListener('click', () => this.resetPage());
    }
}
