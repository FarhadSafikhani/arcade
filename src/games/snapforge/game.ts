/// <reference types="vite/client" />
import { buildOrder, SnapBrick, SnapLevel, validateLevel } from './level';
import { BrickRenderer, modelSVG, pieceSVG } from './renderer';

interface PartialBuild { version: number; usedPieceIds: string[]; }
interface Progress {
    completed: string[];
    partials: Record<string, PartialBuild>;
    seenIntro: string[];
    muted: boolean;
}
interface CatalogEntry {
    id: string;
    title: string;
    description: string;
    order: number;
    accent: string;
    level?: SnapLevel;
}

const STORAGE_KEY = 'snapforge-progress-v1';
const levelInputs = Object.values(import.meta.glob('./levels/*.json', { eager: true, import: 'default' }));
const levels = new Map<string, SnapLevel>();
for (const input of levelInputs) {
    try {
        const level = validateLevel(input);
        levels.set(level.id, level);
    } catch (error) {
        console.error('Snapforge level failed validation:', error);
    }
}

const teasers: CatalogEntry[] = [
    { id: 'duck', title: 'Little Duck', description: 'A bright little pond friend.', order: 1, accent: '#ffda51' },
    { id: 'race-car', title: 'Race Car', description: 'A speedy little machine is next in line.', order: 2, accent: '#ffad8f' },
    { id: 'rocket', title: 'Rocket', description: 'A colorful launch into the stars.', order: 3, accent: '#b8ddf1' },
    { id: 'castle', title: 'Castle', description: 'Make a tiny kingdom brick by brick.', order: 4, accent: '#d5c0fa' }
];
const knownIds = new Set(teasers.map(item => item.id));
const catalog: CatalogEntry[] = [
    ...teasers.map(item => ({ ...item, level: levels.get(item.id),
        title: levels.get(item.id)?.title ?? item.title,
        description: levels.get(item.id)?.description ?? item.description })),
    ...[...levels.values()].filter(level => !knownIds.has(level.id)).map(level => ({
        id: level.id, title: level.title, description: level.description, order: level.order,
        accent: '#ffda51', level
    }))
].sort((a, b) => a.order - b.order);

function element<T extends HTMLElement>(id: string): T {
    const found = document.getElementById(id);
    if (!found) throw new Error(`Snapforge: missing #${id}`);
    return found as T;
}

function loadProgress(): Progress {
    const initial: Progress = { completed: [], partials: {}, seenIntro: [], muted: false };
    try {
        const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (!value || typeof value !== 'object') return initial;
        return {
            completed: Array.isArray(value.completed) ? value.completed.filter((id: unknown) => typeof id === 'string') : [],
            partials: value.partials && typeof value.partials === 'object' ? value.partials : {},
            seenIntro: Array.isArray(value.seenIntro) ? value.seenIntro.filter((id: unknown) => typeof id === 'string') : [],
            muted: value.muted === true
        };
    } catch { return initial; }
}

function teaserSVG(id: string): string {
    const common = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 205" role="img"';
    if (id === 'race-car') return `<svg ${common} aria-label="Brick-built red race car"><ellipse cx="140" cy="172" rx="105" ry="16" fill="#b6646044"/><path d="M42 98h196v60H42z" fill="#e8483d"/><path d="M77 98l26-40h74l26 40z" fill="#ff7957"/><path d="M112 65h57l17 30H93z" fill="#bfe7ed"/><circle cx="85" cy="161" r="22" fill="#29354d"/><circle cx="197" cy="161" r="22" fill="#29354d"/><circle cx="85" cy="161" r="9" fill="#f5efdb"/><circle cx="197" cy="161" r="9" fill="#f5efdb"/><path d="M42 98h196v16H42z" fill="#ffab68"/><circle cx="62" cy="90" r="8" fill="#ffb690"/><circle cx="216" cy="90" r="8" fill="#ffb690"/></svg>`;
    if (id === 'rocket') return `<svg ${common} aria-label="Brick-built rocket"><ellipse cx="140" cy="186" rx="67" ry="11" fill="#638dad44"/><path d="M114 75l26-48 26 48v95h-52z" fill="#f7f3e9"/><path d="M114 75l26-48 26 48z" fill="#f06151"/><path d="M114 137l-27 24v21h27zM166 137l27 24v21h-27z" fill="#4463a8"/><rect x="113" y="153" width="54" height="17" fill="#f06151"/><circle cx="140" cy="104" r="18" fill="#65b9d7" stroke="#375a8c" stroke-width="8"/><path d="M127 173h26l-13 27z" fill="#ffb342"/><circle cx="101" cy="72" r="4" fill="#fff"/><circle cx="205" cy="43" r="6" fill="#fff"/></svg>`;
    return `<svg ${common} aria-label="Brick-built castle"><ellipse cx="140" cy="182" rx="107" ry="13" fill="#7e66a044"/><rect x="53" y="87" width="174" height="87" fill="#9b7cdf"/><rect x="40" y="65" width="57" height="109" fill="#b296ee"/><rect x="183" y="65" width="57" height="109" fill="#b296ee"/><path d="M40 65V48h17v17h22V48h18v17M183 65V48h18v17h22V48h17v17" fill="#9b7cdf"/><rect x="128" y="41" width="24" height="47" fill="#eb795f"/><path d="M128 41l30 10-30 9z" fill="#f9b34e"/><path d="M119 174v-34a21 21 0 0 1 42 0v34" fill="#594d8d"/><rect x="64" y="96" width="15" height="24" rx="8" fill="#594d8d"/><rect x="202" y="96" width="15" height="24" rx="8" fill="#594d8d"/></svg>`;
}

function hash(text: string): number {
    let value = 2166136261;
    for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
    return value >>> 0;
}

class SnapforgeGame {
    private progress = loadProgress();
    private gallery = element<HTMLElement>('galleryScreen');
    private track = element<HTMLElement>('galleryTrack');
    private play = element<HTMLElement>('playScreen');
    private area = element<HTMLElement>('playArea');
    private host = element<HTMLElement>('pixiHost');
    private stage = this.area.querySelector<HTMLElement>('.model-stage')!;
    private tray = element<HTMLElement>('pieceTray');
    private message = element<HTMLElement>('buildMessage');
    private counter = element<HTMLElement>('stepCounter');
    private completion = element<HTMLElement>('completion');
    private skipButton = element<HTMLButtonElement>('skipIntroButton');
    private soundButton = element<HTMLButtonElement>('soundButton');
    private renderer: BrickRenderer | null = null;
    private currentLevel: SnapLevel | null = null;
    private ordered: SnapBrick[] = [];
    private usedPieceIds: string[] = [];
    private selectedIndex = 0;
    private runId = 0;
    private introEpoch = 0;
    private busy = false;
    private audio: AudioContext | null = null;

    constructor() {
        this.updateSoundButton();
        this.soundButton.addEventListener('click', () => {
            this.progress.muted = !this.progress.muted;
            this.save();
            this.updateSoundButton();
            if (!this.progress.muted) this.tone(660, .06);
        });
        element<HTMLButtonElement>('modelsButton').addEventListener('click', () => this.showGallery());
        element<HTMLButtonElement>('galleryPrevious').addEventListener('click', () => this.selectCard(this.selectedIndex - 1));
        element<HTMLButtonElement>('galleryNext').addEventListener('click', () => this.selectCard(this.selectedIndex + 1));
        this.track.addEventListener('scroll', () => this.updateSelectionFromScroll(), { passive: true });
        this.renderGallery();
    }

    private save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.progress)); } catch { /* private mode */ } }
    private updateSoundButton() {
        this.soundButton.textContent = this.progress.muted ? 'Sound off' : 'Sound on';
        this.soundButton.setAttribute('aria-label', this.progress.muted ? 'Unmute sound' : 'Mute sound');
    }
    private tone(frequency: number, duration: number) {
        if (this.progress.muted) return;
        try {
            this.audio ??= new AudioContext();
            const oscillator = this.audio.createOscillator();
            const gain = this.audio.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(frequency, this.audio.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(frequency * .65, this.audio.currentTime + duration);
            gain.gain.setValueAtTime(.0001, this.audio.currentTime);
            gain.gain.exponentialRampToValueAtTime(.095, this.audio.currentTime + .012);
            gain.gain.exponentialRampToValueAtTime(.0001, this.audio.currentTime + duration);
            oscillator.connect(gain).connect(this.audio.destination);
            oscillator.start(); oscillator.stop(this.audio.currentTime + duration + .01);
        } catch { /* audio is optional */ }
    }

    private isUnlocked(index: number): boolean {
        return index === 0 || this.progress.completed.includes(catalog[index - 1].id);
    }

    private renderGallery() {
        this.track.replaceChildren();
        catalog.forEach((entry, index) => {
            const unlocked = this.isUnlocked(index);
            const completed = this.progress.completed.includes(entry.id);
            const partial = this.getPartial(entry.level);
            const card = document.createElement('article');
            card.className = `model-card${unlocked ? '' : ' locked'}`;
            card.dataset.id = entry.id;
            const art = document.createElement('div');
            art.className = 'card-art';
            art.style.backgroundColor = entry.accent;
            const illustration = document.createElement('img');
            illustration.alt = entry.level ? `${entry.title} brick model` : `${entry.title} preview artwork`;
            illustration.loading = 'lazy';
            illustration.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
                entry.level ? modelSVG(entry.level) : teaserSVG(entry.id))}`;
            art.appendChild(illustration);
            const badge = document.createElement('span');
            badge.className = 'card-badge';
            badge.textContent = !unlocked ? '🔒 LOCKED' : !entry.level ? '✦ COMING SOON' :
                partial ? '◒ IN PROGRESS' : completed ? '✓ COMPLETED' : '✦ READY TO BUILD';
            art.appendChild(badge);
            const body = document.createElement('div');
            body.className = 'card-body';
            const number = document.createElement('span');
            number.className = 'card-index';
            number.textContent = `MODEL ${String(entry.order).padStart(2, '0')}`;
            const title = document.createElement('h2'); title.textContent = entry.title;
            const description = document.createElement('p'); description.textContent = entry.description;
            const actions = document.createElement('div'); actions.className = 'card-actions';
            if (unlocked && entry.level) {
                const primary = document.createElement('button');
                primary.type = 'button';
                primary.textContent = partial ? 'Continue →' : completed ? 'Replay →' : 'Start building →';
                primary.addEventListener('click', () => this.startLevel(entry.level!, Boolean(partial)));
                actions.appendChild(primary);
                if (partial) {
                    const restart = document.createElement('button');
                    restart.type = 'button'; restart.className = 'secondary'; restart.textContent = 'Restart';
                    restart.addEventListener('click', () => this.startLevel(entry.level!, false));
                    actions.appendChild(restart);
                }
            } else {
                const disabled = document.createElement('button');
                disabled.type = 'button'; disabled.disabled = true;
                disabled.textContent = unlocked ? 'Coming soon' : 'Complete the previous model';
                actions.appendChild(disabled);
            }
            body.append(number, title, description, actions);
            card.append(art, body);
            card.addEventListener('click', () => { this.selectedIndex = index; this.updateGalleryControls(); });
            this.track.appendChild(card);
        });
        this.updateGalleryControls();
    }

    private selectCard(index: number) {
        this.selectedIndex = Math.max(0, Math.min(catalog.length - 1, index));
        const card = this.track.children[this.selectedIndex] as HTMLElement;
        card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        this.updateGalleryControls();
    }
    private updateSelectionFromScroll() {
        const cards = [...this.track.children] as HTMLElement[];
        const center = this.track.scrollLeft + this.track.clientWidth / 2;
        let best = this.selectedIndex, distance = Infinity;
        cards.forEach((card, index) => {
            const delta = Math.abs(card.offsetLeft + card.offsetWidth / 2 - center);
            if (delta < distance) { best = index; distance = delta; }
        });
        this.selectedIndex = best;
        this.updateGalleryControls();
    }
    private updateGalleryControls() {
        element<HTMLElement>('galleryCount').textContent = `${String(this.selectedIndex + 1).padStart(2, '0')} / ${String(catalog.length).padStart(2, '0')}`;
        element<HTMLButtonElement>('galleryPrevious').disabled = this.selectedIndex === 0;
        element<HTMLButtonElement>('galleryNext').disabled = this.selectedIndex === catalog.length - 1;
    }

    private getPartial(level?: SnapLevel): PartialBuild | null {
        if (!level) return null;
        const partial = this.progress.partials[level.id];
        if (!partial || partial.version !== level.version || !Array.isArray(partial.usedPieceIds) ||
            partial.usedPieceIds.length === 0) return null;
        const ids = new Set(level.bricks.map(brick => brick.id));
        if (partial.usedPieceIds.length >= level.bricks.length ||
            partial.usedPieceIds.some(id => !ids.has(id)) || new Set(partial.usedPieceIds).size !== partial.usedPieceIds.length) return null;
        const actual = partial.usedPieceIds.map(id => level.bricks.find(brick => brick.id === id)!)
            .map(brick => `${brick.color}:${brick.w}:${brick.d}`).sort();
        const expected = buildOrder(level).slice(0, partial.usedPieceIds.length)
            .map(brick => `${brick.color}:${brick.w}:${brick.d}`).sort();
        if (actual.some((type, index) => type !== expected[index])) return null;
        return partial;
    }

    private showGallery() {
        this.runId++;
        this.introEpoch++;
        this.busy = false;
        this.currentLevel = null;
        this.renderer?.clear();
        this.completion.hidden = true;
        this.play.hidden = true;
        this.gallery.hidden = false;
        this.renderGallery();
        this.selectCard(this.selectedIndex);
    }

    private startLevel(level: SnapLevel, resume: boolean) {
        this.runId++;
        const run = this.runId;
        this.currentLevel = level;
        this.ordered = buildOrder(level);
        this.usedPieceIds = resume ? [...(this.getPartial(level)?.usedPieceIds ?? [])] : [];
        this.progress.partials[level.id] = { version: level.version, usedPieceIds: [...this.usedPieceIds] };
        this.save();
        this.busy = false;
        this.gallery.hidden = true;
        this.play.hidden = false;
        this.completion.hidden = true;
        element<HTMLElement>('playTitle').textContent = level.title;
        if (this.renderer) this.renderer.setLevel(level);
        else this.renderer = new BrickRenderer(this.host, this.stage, level);
        this.renderTray();
        if (resume && this.usedPieceIds.length) {
            this.tray.classList.remove('waiting');
            this.showBuildStep();
        } else {
            this.tray.classList.add('waiting');
            this.renderer.showSilhouette();
            this.message.textContent = 'Watch the shape come apart...';
            this.counter.textContent = `0 / ${this.ordered.length}`;
            void this.playIntro(run);
        }
    }

    private async playIntro(run: number) {
        const epoch = ++this.introEpoch;
        const cancelled = () => run !== this.runId || epoch !== this.introEpoch;
        this.skipButton.hidden = !this.progress.seenIntro.includes(this.currentLevel!.id);
        this.skipButton.onclick = () => { this.introEpoch++; this.finishIntro(run); };
        await this.renderer!.emerge(cancelled);
        if (cancelled()) return;
        await new Promise(resolve => setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 80 : 480));
        if (cancelled()) return;
        const targets = new Map([...this.tray.querySelectorAll<HTMLButtonElement>('.piece-button')]
            .map(button => [button.dataset.brickId!, button]));
        await this.renderer!.scatter(targets, cancelled);
        if (!cancelled()) this.finishIntro(run);
    }

    private finishIntro(run: number) {
        if (run !== this.runId || !this.currentLevel) return;
        this.skipButton.hidden = true;
        if (!this.progress.seenIntro.includes(this.currentLevel.id)) {
            this.progress.seenIntro.push(this.currentLevel.id);
            this.save();
        }
        this.tray.classList.remove('waiting');
        this.showBuildStep();
    }

    private renderTray() {
        if (!this.currentLevel) return;
        const used = new Set(this.usedPieceIds);
        const currentScroll = this.tray.scrollLeft;
        this.tray.replaceChildren();
        const pieces = [...this.currentLevel.bricks].sort((a, b) => hash(a.id) - hash(b.id));
        for (const brick of pieces) {
            if (used.has(brick.id)) continue;
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'piece-button'; button.dataset.brickId = brick.id;
            button.setAttribute('aria-label', `${brick.color} ${brick.w} by ${brick.d} brick`);
            button.innerHTML = pieceSVG(brick, this.currentLevel.palette[brick.color]);
            const label = document.createElement('span'); label.textContent = `${brick.color} · ${brick.w}×${brick.d}`;
            button.appendChild(label);
            button.addEventListener('click', () => void this.choosePiece(brick, button));
            this.tray.appendChild(button);
        }
        this.tray.scrollLeft = currentScroll;
    }

    private showBuildStep() {
        if (!this.currentLevel || !this.renderer) return;
        const step = this.usedPieceIds.length;
        this.renderer.showBuild(this.ordered.slice(0, step), this.ordered[step]);
        this.counter.textContent = `${Math.min(step + 1, this.ordered.length)} / ${this.ordered.length}`;
        const next = this.ordered[step];
        this.message.textContent = next ? `Find the ${next.color} ${next.w}×${next.d} brick` : 'All done!';
        this.renderTray();
    }

    private async choosePiece(piece: SnapBrick, button: HTMLButtonElement) {
        if (this.busy || !this.currentLevel || !this.renderer) return;
        const expected = this.ordered[this.usedPieceIds.length];
        if (!expected) return;
        if (piece.w !== expected.w || piece.d !== expected.d || piece.color !== expected.color) {
            button.classList.remove('wrong');
            void button.offsetWidth;
            button.classList.add('wrong');
            this.tone(210, .11);
            return;
        }
        const run = this.runId;
        this.busy = true;
        button.style.visibility = 'hidden';
        await this.renderer.flyFrom(button, expected, () => run !== this.runId);
        if (run !== this.runId || !this.currentLevel) return;
        this.usedPieceIds.push(piece.id);
        this.progress.partials[this.currentLevel.id] = {
            version: this.currentLevel.version, usedPieceIds: [...this.usedPieceIds]
        };
        this.save();
        this.tone(770, .15);
        this.busy = false;
        if (this.usedPieceIds.length === this.ordered.length) this.finishLevel(run);
        else this.showBuildStep();
    }

    private finishLevel(run: number) {
        if (!this.currentLevel || !this.renderer) return;
        const id = this.currentLevel.id;
        if (!this.progress.completed.includes(id)) this.progress.completed.push(id);
        delete this.progress.partials[id];
        this.save();
        this.renderer.showBuild(this.ordered);
        this.counter.textContent = `${this.ordered.length} / ${this.ordered.length}`;
        this.message.textContent = 'You built it!';
        this.completion.hidden = false;
        this.tone(990, .28);
        setTimeout(() => { if (run === this.runId) this.showGallery(); }, 1650);
    }
}

new SnapforgeGame();
