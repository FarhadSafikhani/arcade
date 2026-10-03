/// <reference types="vite/client" />
import { GalleryMotion } from './gallery-motion';
import { availableCollections, collectionLevels, collections, CollectionId, modelUnlocked } from './collections';
import { buildOrder, SnapLevel, validPlacedIds, validateLevel } from './level';
import { SnapScene3D } from './scene3d';
import { openModelViewer } from './model-viewer';
import musicUrl from './audio/music.mp3';
import { createClickBuffer, loadSnapSamples, SnapSamples } from './sound';

interface PartialBuild { version: number; placedIds: string[]; }
interface Progress { completed: string[]; partials: Record<string, PartialBuild>; seenIntro: string[]; muted: boolean; unlockAll: boolean; }

const STORAGE_KEY = 'snapforge-3d-progress-v2';
const DEV_MUSIC_KEY = 'snapforge-dev-disable-music';
const levels = new Map<string, SnapLevel>();
for (const input of Object.values(import.meta.glob('./levels/*.json', { eager: true, import: 'default' }))) {
    try { const level = validateLevel(input); levels.set(level.id, level); }
    catch (error) { console.error('Invalid Snapforge level', error); }
}
const catalog = new Map(collections.map(collection => [collection.id,
    collectionLevels(levels.values(), collection.id)]));

function byId<T extends HTMLElement>(id: string): T {
    const result = document.getElementById(id);
    if (!result) throw new Error(`Snapforge missing #${id}`);
    return result as T;
}
function loadProgress(): Progress {
    const empty: Progress = { completed: [], partials: {}, seenIntro: [], muted: false, unlockAll: false };
    try {
        const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (!stored || typeof stored !== 'object') return empty;
        const data = stored as Record<string, unknown>;
        return { completed: Array.isArray(data.completed) ? data.completed.filter(id => typeof id === 'string') : [],
            partials: data.partials && typeof data.partials === 'object' ? data.partials as Record<string, PartialBuild> : {},
            seenIntro: Array.isArray(data.seenIntro) ? data.seenIntro.filter(id => typeof id === 'string') : [],
            muted: data.muted === true, unlockAll: data.unlockAll === true };
    } catch { return empty; }
}

class SnapforgeGame {
    private root = byId<HTMLElement>('snapforge');
    private gallery = byId<HTMLElement>('galleryScreen');
    private collectionList = byId<HTMLElement>('collectionList');
    private collectionPanel = byId<HTMLElement>('collectionPanel');
    private galleryArrows = byId<HTMLElement>('galleryArrows');
    private galleryTrack = byId<HTMLElement>('galleryTrack');
    private play = byId<HTMLElement>('playScreen');
    private model = byId<HTMLElement>('modelViewport');
    private pile = byId<HTMLElement>('pileViewport');
    private message = byId<HTMLElement>('buildMessage');
    private counter = byId<HTMLElement>('stepCounter');
    private previewCount = byId<HTMLElement>('galleryCount');
    private introPlaying = false;
    private hint = byId<HTMLButtonElement>('hintButton');
    private consecutiveWrongAttempts = 0;
    private completion = byId<HTMLElement>('completion');
    private completionBurst = byId<HTMLElement>('completionBurst');
    private back = byId<HTMLAnchorElement>('backButton');
    private backLabel = byId<HTMLElement>('backLabel');
    private sound = byId<HTMLButtonElement>('soundButton');
    private progress = loadProgress();
    private scene: SnapScene3D | null = null;
    private current: SnapLevel | null = null;
    private placedIds: string[] = [];
    private selectedIndex = 0;
    private activeCollection: CollectionId = 'starter';
    private selectedByCollection = new Map<CollectionId, number>();
    private galleryMotion!: GalleryMotion;
    private audio: AudioContext | null = null;
    private music: HTMLAudioElement | null = null;
    private clickBuffer: AudioBuffer | null = null;
    private samples: SnapSamples | null = null;
    private samplesRequested = false;
    private introSources = new Map<AudioBufferSourceNode, GainNode>();
    private introGeneration = 0;
    private devSnap: HTMLButtonElement | null = null;
    private devFinish: HTMLButtonElement | null = null;
    private devMusic: HTMLButtonElement | null = null;
    private devPop: HTMLButtonElement | null = null;
    private devPanel: HTMLDetailsElement | null = null;
    private viewAll: HTMLDialogElement | null = null;
    private devWindow: Window | null = null;
    private devPopGeneration = 0;
    private musicDisabled = false;
    private devSnapDisabled = true;
    private devFinishDisabled = true;

    constructor() {
        this.renderCollections();
        this.renderGallery();
        if (import.meta.env.DEV) {
            try { this.musicDisabled = localStorage.getItem(DEV_MUSIC_KEY) === '1'; }
            catch { /* Dev preference is optional. */ }
        }
        this.updateSound();
        this.syncMusic();
        if (import.meta.env.DEV) this.installDevPanel();
        // Placement completes in an animation frame, so unlock audio during a user gesture.
        // The mute control handles music itself; starting it on the way down would blip before the click.
        const unlockAudio = (event: Event) => {
            if (event.target instanceof Element && event.target.closest('#soundButton')) return;
            this.prepareAudio();
        };
        this.root.addEventListener('pointerdown', unlockAudio, { passive: true });
        this.root.addEventListener('keydown', unlockAudio);
        this.play.addEventListener('contextmenu', event => event.preventDefault());
        // Capture before actions hide/rebuild their controls or disable the final gallery arrow.
        this.root.addEventListener('click', event => {
            const control = event.target instanceof Element
                ? event.target.closest('button, a[href], [role="button"]') : null;
            if (!control || control === this.sound || control === this.devMusic || control.matches(':disabled, [aria-disabled="true"]')) return;
            if (control.closest('#galleryTrack') && this.galleryMotion?.suppressesClick(event)) return;
            this.playEffect('click');
        }, true);
        this.sound.addEventListener('click', () => {
            this.progress.muted = !this.progress.muted;
            if (this.progress.muted) this.stopIntroEffects();
            this.save(); this.updateSound();
            this.syncMusic();
            if (!this.progress.muted) this.playEffect('click');
        });
        this.back.addEventListener('click', event => {
            if (this.play.hidden) {
                // Give the click time to sound before same-tab navigation tears down audio.
                if (!this.progress.muted && this.audio?.state === 'running' && event.button === 0 &&
                    !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
                    event.preventDefault();
                    window.setTimeout(() => window.location.assign(this.back.href), 120);
                }
                return;
            }
            event.preventDefault();
            this.showGallery();
        });
        this.galleryMotion = new GalleryMotion(this.galleryTrack, index => {
            this.selectedIndex = index;
            this.selectedByCollection.set(this.activeCollection, index);
            this.updateGalleryControls();
        });
        byId<HTMLButtonElement>('galleryPrevious').addEventListener('click', () => this.galleryMotion.step(-1));
        byId<HTMLButtonElement>('galleryNext').addEventListener('click', () => this.galleryMotion.step(1));
        this.galleryMotion.reset(this.selectedIndex);
        window.addEventListener('pagehide', event => {
            this.devWindow?.close();
            this.music?.pause();
            this.stopIntroEffects();
            this.galleryMotion.suspend();
            if (!event.persisted) { this.galleryMotion.destroy(); this.scene?.destroy(); }
        });
        window.addEventListener('pageshow', () => this.syncMusic());
        this.hint.addEventListener('click', () => {
            if (this.scene?.hint()) {
                this.resetHintPrompt();
                this.message.textContent = 'Look for the glowing ring in the pile';
                window.setTimeout(() => this.updateStep(), 2300);
            }
        });
        byId<HTMLButtonElement>('completionGalleryButton').addEventListener('click', () => this.showGallery());
        this.model.addEventListener('keydown', event => {
            if (this.completion.hidden || !['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
            event.preventDefault();
            if (event.key === 'Home') this.scene?.resetShowcase();
            else this.scene?.rotateShowcase(event.key === 'ArrowLeft' ? -Math.PI / 12 : Math.PI / 12);
        });
        void this.initializeScene();
    }

    private async initializeScene(): Promise<void> {
        const loading = byId<HTMLElement>('studioLoading');
        const retry = byId<HTMLButtonElement>('loadingRetry');
        retry.addEventListener('click', () => window.location.reload());
        try {
            this.scene = await SnapScene3D.create(this.root, this.model, this.pile);
            this.scene.setCallbacks(id => this.placed(id), () => this.wrong(), () => this.playEffect('grab'));
            this.scene.setIntroCallbacks(() => this.playIntroEffect('breakup'),
                () => this.playIntroEffect('pour'), () => this.stopIntroEffects());
            this.scene.setPreviews(this.galleryTrack, this.previewEntries());
            this.root.classList.remove('is-warming');
            this.gallery.inert = false;
            loading.hidden = true;
        } catch (error) {
            console.error('Snapforge 3D could not start', error);
            loading.classList.add('is-error');
            loading.setAttribute('aria-label', 'Studio unavailable');
            byId<HTMLElement>('loadingTitle').textContent = 'The studio couldn’t start';
            byId<HTMLElement>('loadingNote').textContent = 'Try again, or use a browser with WebGL support.';
            retry.hidden = false;
        } finally {
            this.gallery.setAttribute('aria-busy', 'false');
        }
    }

    private save(): void {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.progress)); }
        catch { /* Game still works if storage is unavailable. */ }
    }
    private updateSound(): void {
        const label = this.progress.muted ? 'Unmute sound' : 'Mute sound';
        this.sound.classList.toggle('is-muted', this.progress.muted);
        this.sound.setAttribute('aria-label', label);
        this.sound.setAttribute('aria-pressed', String(this.progress.muted));
        this.sound.title = label;
    }
    private ensureMusic(): HTMLAudioElement | null {
        if (this.music) return this.music;
        try {
            const music = new Audio(musicUrl);
            music.loop = true;
            music.preload = 'auto';
            music.volume = 0.42;
            this.music = music;
            return music;
        } catch { return null; /* Music is optional. */ }
    }
    /** Starts the looping theme, or pauses it while sound is muted or dev has disabled music. */
    private syncMusic(): void {
        if (this.progress.muted || this.musicDisabled) {
            this.music?.pause();
            return;
        }
        const music = this.ensureMusic();
        if (!music) return;
        const pending = music.play();
        if (pending) void pending.then(() => {
            if (this.progress.muted || this.musicDisabled) music.pause();
        }).catch(() => { /* The next pointer or key press retries. */ });
    }
    private installDevPanel(): void {
        try { this.devPanel?.remove(); } catch { /* The popped document may already be gone. */ }
        const panel = document.createElement('details');
        panel.className = 'dev-panel';
        const toggle = document.createElement('summary');
        toggle.textContent = '[DEV]';
        const actions = document.createElement('div');
        actions.className = 'dev-actions';
        this.devSnap = document.createElement('button');
        this.devSnap.type = 'button';
        this.devSnap.textContent = 'Snap next piece';
        this.devSnap.disabled = this.devSnapDisabled;
        this.devSnap.addEventListener('click', () => this.scene?.snapNextPiece());
        this.devFinish = document.createElement('button');
        this.devFinish.type = 'button';
        this.devFinish.textContent = 'Finish model';
        this.devFinish.disabled = this.devFinishDisabled;
        this.devFinish.addEventListener('click', () => {
            if (!this.current || !this.scene) return;
            this.scene.skipIntro();
            while (this.current && this.placedIds.length < this.current.bricks.length && this.scene.snapNextPiece()) { /* Place each remaining piece. */ }
        });
        const unlockAll = document.createElement('button');
        unlockAll.type = 'button';
        unlockAll.textContent = 'Unlock all';
        unlockAll.addEventListener('click', () => {
            this.progress.unlockAll = true;
            this.save();
            this.renderGallery();
            this.scene?.setPreviews(this.galleryTrack, this.previewEntries());
            this.galleryMotion?.reset(this.selectedIndex);
        });
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.textContent = 'Fresh start';
        reset.addEventListener('click', () => {
            this.devWindow?.close();
            localStorage.clear();
            window.location.reload();
        });
        this.devMusic = document.createElement('button');
        this.devMusic.type = 'button';
        // The root gesture handler would start the theme on the way down, before this click silences it.
        this.devMusic.addEventListener('pointerdown', event => event.stopPropagation());
        this.devMusic.addEventListener('click', () => {
            this.musicDisabled = !this.musicDisabled;
            try { localStorage.setItem(DEV_MUSIC_KEY, this.musicDisabled ? '1' : '0'); }
            catch { /* Dev preference is optional. */ }
            this.updateDevMusic();
            this.syncMusic();
            if (!this.progress.muted) this.playEffect('click');
        });
        this.updateDevMusic();
        const viewAll = document.createElement('button');
        viewAll.type = 'button';
        viewAll.textContent = 'View All';
        viewAll.addEventListener('click', () => this.openViewAll());
        this.devPop = document.createElement('button');
        this.devPop.type = 'button';
        this.devPop.addEventListener('click', () => this.popDevPanel());
        this.updateDevPopLabel();
        actions.append(this.devSnap, this.devFinish, unlockAll, reset, this.devMusic, viewAll, this.devPop);
        panel.append(toggle, actions);
        this.devPanel = panel;
        this.root.appendChild(panel);
    }
    private updateDevMusic(): void {
        if (!this.devMusic) return;
        this.devMusic.textContent = this.musicDisabled ? 'Enable music' : 'Disable music';
        this.devMusic.setAttribute('aria-pressed', String(this.musicDisabled));
    }
    /** Every model, one labeled row per collection. A cell opens the model viewer. */
    private openViewAll(): void {
        if (this.viewAll?.open) {
            window.focus();
            return;
        }
        const dialog = document.createElement('dialog');
        dialog.className = 'view-all';
        dialog.setAttribute('aria-label', 'All models');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'view-all-close';
        close.textContent = 'Close';
        const grid = document.createElement('div');
        grid.className = 'view-all-grid';
        for (const collection of collections) {
            const models = catalog.get(collection.id);
            if (!models?.length) continue;
            const group = document.createElement('section');
            group.className = 'view-all-group';
            const name = document.createElement('h2');
            name.className = 'view-all-name';
            name.textContent = collection.name;
            const row = document.createElement('div');
            row.className = 'view-all-row';
            for (const level of models) {
                const count = level.bricks.length;
                const cell = document.createElement('button');
                cell.type = 'button';
                cell.className = 'view-all-cell';
                if (!level.vetted) cell.classList.add('is-unvetted');
                const title = document.createElement('span');
                title.className = 'view-all-title';
                title.textContent = level.title;
                const parts = document.createElement('span');
                parts.className = 'view-all-count';
                parts.textContent = String(count);
                cell.setAttribute('aria-label', `${level.title}, ${count} ${count === 1 ? 'part' : 'parts'}${level.vetted ? '' : ', not vetted'}`);
                cell.append(title, parts);
                if (!level.vetted) {
                    const mark = document.createElement('span');
                    mark.className = 'view-all-mark';
                    mark.setAttribute('aria-hidden', 'true');
                    cell.appendChild(mark);
                }
                cell.addEventListener('click', () => openModelViewer(level));
                row.appendChild(cell);
            }
            group.append(name, row);
            grid.appendChild(group);
        }
        dialog.append(close, grid);
        close.addEventListener('click', () => dialog.close());
        dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        dialog.addEventListener('close', () => {
            dialog.remove();
            if (this.viewAll === dialog) this.viewAll = null;
        }, { once: true });
        document.body.appendChild(dialog);
        this.viewAll = dialog;
        window.focus();
        dialog.showModal();
    }
    private updateDevPopLabel(): void {
        if (!this.devPop) return;
        const popped = !!this.devWindow && !this.devWindow.closed && this.devPanel?.ownerDocument !== document;
        this.devPop.textContent = popped ? 'Dock dev panel' : 'Pop dev panel';
    }
    private setDevPieceControls(snapDisabled: boolean, finishDisabled: boolean): void {
        this.devSnapDisabled = snapDisabled;
        this.devFinishDisabled = finishDisabled;
        if (this.devSnap) this.devSnap.disabled = snapDisabled;
        if (this.devFinish) this.devFinish.disabled = finishDisabled;
    }
    /** Moves the live dev panel into a child window. Closing that window docks it again. */
    private popDevPanel(): void {
        if (this.devWindow && !this.devWindow.closed) {
            const popup = this.devWindow;
            window.setTimeout(() => popup.close(), 0);
            return;
        }
        const generation = ++this.devPopGeneration;
        const popup = window.open('', `snapforge-dev-${generation}`, 'popup=yes,width=280,height=510');
        let doc: Document | null = null;
        try { doc = popup?.document ?? null; } catch { doc = null; }
        if (!popup || !doc?.body || !this.devPanel) {
            this.notePopBlocked();
            try { popup?.close(); } catch { /* A blocked window may already be unreachable. */ }
            return;
        }
        this.devWindow = popup;
        doc.title = 'Snapforge dev';
        doc.head.replaceChildren();
        doc.body.replaceChildren();
        for (const node of document.querySelectorAll('link[rel="stylesheet"]')) {
            if (!(node instanceof HTMLLinkElement) || !node.href) continue;
            const link = doc.createElement('link');
            link.rel = 'stylesheet';
            link.href = node.href;
            doc.head.appendChild(link);
        }
        for (const node of document.querySelectorAll('style')) doc.head.appendChild(doc.importNode(node, true));
        const layout = doc.createElement('style');
        layout.textContent = 'html,body{margin:0;height:100%;background:#27334d}';
        doc.head.appendChild(layout);
        this.devPanel.classList.add('is-popped');
        this.devPanel.open = true;
        doc.body.appendChild(doc.adoptNode(this.devPanel));
        this.updateDevPopLabel();
        let settled = false;
        const finishPop = () => {
            if (settled || generation !== this.devPopGeneration) return;
            settled = true;
            this.recoverDevPanel();
            try { if (!popup.closed) popup.close(); } catch { /* The window is already gone. */ }
        };
        // beforeunload still has the document, so the panel can move home before the window is discarded.
        popup.addEventListener('beforeunload', finishPop);
        popup.addEventListener('pagehide', finishPop);
        const watch = window.setInterval(() => {
            if (generation !== this.devPopGeneration) {
                try { if (!popup.closed) popup.close(); } catch { /* The window is already gone. */ }
            } else if (!popup.closed) return;
            if (!popup.closed) return;
            window.clearInterval(watch);
            if (!settled) finishPop();
        }, 200);
        popup.focus();
    }
    private notePopBlocked(): void {
        if (!this.devPop) return;
        this.devPop.textContent = 'Pop-up blocked';
        window.setTimeout(() => this.updateDevPopLabel(), 1600);
    }
    private recoverDevPanel(): void {
        const panel = this.devPanel;
        if (panel && panel.ownerDocument !== document) {
            panel.classList.remove('is-popped');
            try { this.root.appendChild(document.adoptNode(panel)); }
            catch {
                this.devPanel = null;
                this.installDevPanel();
            }
        } else if (!panel || !panel.isConnected) {
            this.devPanel = null;
            this.installDevPanel();
        } else panel.classList.remove('is-popped');
        this.devWindow = null;
        this.updateDevPopLabel();
    }
    private prepareAudio(): AudioContext | null {
        if (this.progress.muted) return null;
        this.syncMusic();
        try {
            this.audio ??= new AudioContext();
            if (this.audio.state === 'suspended') void this.audio.resume().catch(() => {});
            if (!this.samplesRequested) {
                this.samplesRequested = true;
                void loadSnapSamples(this.audio).then(samples => { this.samples = samples; });
            }
            return this.audio;
        } catch { return null; /* Sound is optional. */ }
    }
    private playBuffer(audio: AudioContext, buffer: AudioBuffer, volume: number, rate = 1,
        onEnded?: () => void, offset = 0): [AudioBufferSourceNode, GainNode] {
        const source = audio.createBufferSource();
        const gain = audio.createGain();
        source.buffer = buffer;
        source.playbackRate.value = rate;
        gain.gain.value = volume;
        source.connect(gain).connect(audio.destination);
        source.onended = () => { onEnded?.(); source.disconnect(); gain.disconnect(); };
        source.start(0, offset);
        return [source, gain];
    }
    private playEffect(kind: 'click' | 'grab' | 'snap'): void {
        const audio = this.prepareAudio();
        if (!audio) return;
        try {
            // Recordings that are still decoding stay silent rather than substituting another sound.
            const buffer = kind === 'click' ? (this.clickBuffer ??= createClickBuffer(audio)) : this.samples?.[kind];
            if (!buffer) return;
            const volume = kind === 'grab' ? 0.6 : 0.85;
            this.playBuffer(audio, buffer, volume * (0.94 + Math.random() * 0.1), 0.96 + Math.random() * 0.08);
        } catch { /* Sound is optional. */ }
    }
    private playIntroEffect(kind: 'breakup' | 'pour'): void {
        const audio = this.prepareAudio();
        const buffer = this.samples?.[kind];
        if (!audio || !buffer) return;
        const requested = performance.now(), generation = this.introGeneration;
        const play = () => {
            // Skip the part of the clip that has already passed so it stays in sync with the animation.
            const offset = (performance.now() - requested) / 1000;
            if (generation !== this.introGeneration || offset > buffer.duration * 0.6) return;
            try {
                const [source, gain] = this.playBuffer(audio, buffer, kind === 'breakup' ? 0.7 : 0.75, 1,
                    () => this.introSources.delete(source), offset);
                this.introSources.set(source, gain);
            } catch { /* Sound is optional. */ }
        };
        // The click that starts a first level can also create the context, which may take a moment to start.
        if (audio.state === 'running') play();
        else void audio.resume().then(play).catch(() => {});
    }
    private stopIntroEffects(): void {
        this.introGeneration++;
        const now = this.audio?.currentTime ?? 0;
        // A short fade avoids the click of cutting a clip mid-waveform.
        for (const [source, gain] of this.introSources) {
            try {
                gain.gain.cancelScheduledValues(now);
                gain.gain.setValueAtTime(gain.gain.value, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.08);
                source.stop(now + 0.08);
            } catch { /* An ended source needs no further action. */ }
        }
        this.introSources.clear();
    }
    private tone(frequency: number, duration: number, second?: number): void {
        if (!this.prepareAudio()) return;
        try {
            const note = (pitch: number, delay: number) => {
                const oscillator = this.audio!.createOscillator();
                const gain = this.audio!.createGain();
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(pitch, this.audio!.currentTime + delay);
                oscillator.frequency.exponentialRampToValueAtTime(pitch * 0.79, this.audio!.currentTime + delay + duration);
                gain.gain.setValueAtTime(0.0001, this.audio!.currentTime + delay);
                gain.gain.exponentialRampToValueAtTime(0.26, this.audio!.currentTime + delay + 0.012);
                gain.gain.exponentialRampToValueAtTime(0.0001, this.audio!.currentTime + delay + duration);
                oscillator.connect(gain).connect(this.audio!.destination);
                oscillator.start(this.audio!.currentTime + delay);
                oscillator.stop(this.audio!.currentTime + delay + duration + 0.02);
            };
            note(frequency, 0);
            if (second) note(second, duration + 0.035);
        } catch { /* Sound is optional. */ }
    }
    private fanfare(): void {
        const audio = this.prepareAudio();
        if (!audio) return;
        try {
            // Let the final connection speak before the celebration begins.
            const start = audio.currentTime + 0.10;
            for (const [pitch, delay, duration] of [
                [523.25, 0, 0.16], [659.25, 0.12, 0.16], [783.99, 0.24, 0.18],
                [1046.5, 0.39, 0.48], [783.99, 0.39, 0.48]
            ]) {
                const oscillator = audio.createOscillator();
                const gain = audio.createGain();
                oscillator.type = 'triangle';
                oscillator.frequency.value = pitch;
                gain.gain.setValueAtTime(0.0001, start + delay);
                gain.gain.exponentialRampToValueAtTime(0.055, start + delay + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + duration);
                oscillator.connect(gain).connect(audio.destination);
                oscillator.start(start + delay);
                oscillator.stop(start + delay + duration + 0.02);
            }
        } catch { /* Sound is optional. */ }
    }
    private celebrate(): void {
        const colors = ['#ef694c', '#ffd247', '#80c9b5', '#7d9be2', '#fffdf7'];
        const radius = Math.min(340, window.innerWidth * 0.43);
        const pieces = document.createDocumentFragment();
        for (let index = 0; index < 36; index++) {
            const confetti = document.createElement('span');
            const angle = index * Math.PI * 2 / 36;
            const distance = radius * (0.65 + (index % 5) * 0.09);
            confetti.className = 'confetti';
            confetti.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
            confetti.style.setProperty('--y', `${Math.sin(angle) * distance}px`);
            confetti.style.setProperty('--spin', `${(index % 2 ? 1 : -1) * (360 + index * 13)}deg`);
            confetti.style.setProperty('--delay', `${(index % 4) * 35}ms`);
            confetti.style.setProperty('--size', `${7 + index % 4 * 2}px`);
            confetti.style.setProperty('--color', colors[index % colors.length]);
            pieces.appendChild(confetti);
        }
        this.completionBurst.replaceChildren(pieces);
    }

    private activeLevels(): SnapLevel[] {
        return catalog.get(this.activeCollection) ?? [];
    }
    private unlocked(index: number): boolean {
        return this.progress.unlockAll || modelUnlocked(this.activeLevels(), index, this.progress.completed);
    }
    private renderCollections(): void {
        for (const collection of collections) {
            const comingSoon = !availableCollections.has(collection.id);
            const row = document.createElement('section');
            row.className = 'collection-row';
            row.dataset.collection = collection.id;
            row.classList.toggle('is-active', collection.id === this.activeCollection);
            row.classList.toggle('is-coming-soon', comingSoon);
            const header = document.createElement('div');
            header.className = 'collection-heading';
            const heading = document.createElement('h2');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'collection-name';
            button.textContent = collection.name;
            button.disabled = comingSoon;
            button.setAttribute('aria-expanded', String(collection.id === this.activeCollection));
            button.setAttribute('aria-controls', 'collectionPanel');
            button.addEventListener('click', () => this.selectCollection(collection.id));
            heading.appendChild(button);
            header.appendChild(heading);
            if (comingSoon) {
                const label = document.createElement('span');
                label.className = 'collection-coming-soon';
                label.textContent = 'Coming soon';
                header.appendChild(label);
            }
            row.appendChild(header);
            this.collectionList.appendChild(row);
        }
        const firstRow = this.collectionList.firstElementChild!;
        firstRow.querySelector('.collection-heading')?.append(this.previewCount, this.galleryArrows);
        firstRow.appendChild(this.collectionPanel);
        this.collectionPanel.hidden = false;
    }
    private selectCollection(id: CollectionId): void {
        if (id === this.activeCollection || !availableCollections.has(id)) return;
        this.galleryMotion.suspend();
        this.activeCollection = id;
        this.selectedIndex = this.selectedByCollection.get(id) ?? 0;
        const row = this.collectionList.querySelector<HTMLElement>(`[data-collection="${id}"]`)!;
        row.querySelector('.collection-heading')?.append(this.previewCount, this.galleryArrows);
        row.appendChild(this.collectionPanel);
        for (const collectionRow of this.collectionList.querySelectorAll<HTMLElement>('.collection-row')) {
            const active = collectionRow === row;
            collectionRow.classList.toggle('is-active', active);
            collectionRow.querySelector<HTMLButtonElement>('.collection-name')!
                .setAttribute('aria-expanded', String(active));
        }
        this.renderGallery();
        this.scene?.setPreviews(this.galleryTrack, this.previewEntries());
        this.galleryMotion.reset(this.selectedIndex);
    }
    private partial(level?: SnapLevel): PartialBuild | null {
        if (!level) return null;
        const partial = this.progress.partials[level.id];
        return partial?.version === level.version && validPlacedIds(level, partial.placedIds) &&
            partial.placedIds.length > 0 ? partial : null;
    }
    private previewEntries() {
        return this.activeLevels().map(level => ({ id: level.id,
            element: byId<HTMLElement>(`preview-${level.id}`), level,
            completed: this.progress.completed.includes(level.id) }));
    }
    private renderGallery(): void {
        this.galleryMotion?.suspend();
        this.galleryTrack.replaceChildren();
        const items = this.activeLevels();
        for (const [index, level] of items.entries()) {
            const item = { id: level.id, title: level.title, order: level.order, level };
            const isUnlocked = this.unlocked(index);
            const isCompleted = this.progress.completed.includes(item.id);
            const isInProgress = Boolean(this.partial(item.level));
            const card = document.createElement('article');
            card.className = 'gallery-card';
            card.setAttribute('aria-label', `${item.title}, ${!isUnlocked ? 'locked' : isInProgress ? 'in progress' : isCompleted ? 'completed' : 'ready to build'}`);
            const visual = document.createElement('div');
            visual.className = 'card-visual is-preview-loading';
            visual.id = `preview-${item.id}`;
            if (!isUnlocked || isCompleted && !isInProgress) {
                const icon = document.createElement('span');
                icon.className = 'card-status-icon';
                icon.setAttribute('aria-hidden', 'true');
                icon.innerHTML = !isUnlocked
                    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>'
                    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 12.5 5 5 10-11"/></svg>';
                visual.appendChild(icon);
            } else if (isInProgress) {
                const badge = document.createElement('span');
                badge.className = 'card-badge';
                badge.textContent = 'IN PROGRESS';
                visual.appendChild(badge);
            }
            const copy = document.createElement('div');
            copy.className = 'card-copy';
            const eyebrow = document.createElement('small');
            eyebrow.textContent = `MODEL ${String(item.order).padStart(2, '0')}`;
            const title = document.createElement('h2'); title.textContent = item.title;
            const pieceCount = document.createElement('p');
            pieceCount.className = 'card-piece-count';
            const count = item.level.bricks.length;
            pieceCount.textContent = `${count} ${count === 1 ? 'piece' : 'pieces'}`;
            card.setAttribute('aria-label', `${card.getAttribute('aria-label')}, ${pieceCount.textContent}`);
            const action = document.createElement('span');
            action.className = 'card-action';
            if (this.unlocked(index)) {
                const level = item.level;
                card.classList.add('is-available');
                card.setAttribute('role', 'button');
                card.tabIndex = 0;
                card.addEventListener('click', () => this.startLevel(level, Boolean(this.partial(level))));
                card.addEventListener('keydown', event => {
                    if (event.target !== card) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        card.click();
                    }
                });
                action.textContent = this.partial(level) ? 'Continue build →' :
                    this.progress.completed.includes(item.id) ? 'Replay' : 'Start building →';
            } else {
                action.textContent = 'Finish previous model';
                action.classList.add('is-disabled');
            }
            const actions = document.createElement('div');
            actions.className = 'card-actions';
            actions.appendChild(action);
            if (isCompleted && !isInProgress) {
                const view = document.createElement('button');
                view.type = 'button'; view.className = 'card-view'; view.textContent = 'View';
                view.setAttribute('aria-label', `View ${item.title}`);
                view.addEventListener('click', event => {
                    event.stopPropagation();
                    if (!this.galleryMotion.suppressesClick(event)) openModelViewer(item.level);
                });
                actions.appendChild(view);
            }
            copy.append(eyebrow, title, pieceCount, actions);
            card.append(visual, copy);
            this.galleryTrack.appendChild(card);
        }
        this.updateGalleryControls();
    }
    private updateGalleryControls(): void {
        const levels = this.activeLevels();
        const completed = levels.filter(level => this.progress.completed.includes(level.id)).length;
        this.previewCount.textContent = `${completed} / ${levels.length}`;
        this.previewCount.setAttribute('aria-label', `${completed} of ${levels.length} models completed`);
        byId<HTMLButtonElement>('galleryPrevious').disabled = this.selectedIndex === 0;
        byId<HTMLButtonElement>('galleryNext').disabled = this.selectedIndex === levels.length - 1;
    }
    private closeShowcase(): void {
        this.completion.hidden = true;
        this.play.classList.remove('is-complete');
        this.play.querySelector('.model-panel')!.appendChild(this.model);
        this.model.removeAttribute('tabindex');
        this.model.setAttribute('aria-label', 'Drag to turn the model');
    }
    private showGallery(): void {
        this.resetHintPrompt();
        this.stopIntroEffects();
        this.closeShowcase();
        this.scene?.leaveLevel();
        this.current = null;
        this.setDevPieceControls(true, true);
        this.play.hidden = true;
        this.gallery.hidden = false;
        this.root.classList.remove('is-playing');
        this.backLabel.textContent = 'Arcade';
        this.back.setAttribute('aria-label', 'Back to arcade');
        this.completion.hidden = true;
        this.renderGallery();
        this.scene?.setPreviews(this.galleryTrack, this.previewEntries());
        this.galleryMotion.reset(this.selectedIndex);
    }
    private startLevel(level: SnapLevel, resume: boolean): void {
        if (!this.scene) return;
        this.resetHintPrompt();
        this.stopIntroEffects();
        this.galleryMotion.suspend();
        this.closeShowcase();
        this.current = level;
        this.placedIds = resume ? [...(this.partial(level)?.placedIds ?? [])] : [];
        this.progress.partials[level.id] = { version: level.version, placedIds: [...this.placedIds] };
        this.save();
        this.gallery.hidden = true;
        this.play.hidden = false;
        this.root.classList.add('is-playing');
        this.backLabel.textContent = 'Menu';
        this.back.setAttribute('aria-label', 'Back to model gallery');
        this.completion.hidden = true;
        byId<HTMLElement>('playTitle').textContent = level.title;
        this.introPlaying = !resume;
        this.hint.disabled = !resume;
        this.setDevPieceControls(!resume, false);
        this.message.textContent = resume ? '' : 'Watch the model come apart…';
        this.updateStep();
        this.scene.startLevel(level, this.placedIds, !resume, () => {
            this.introPlaying = false;
            this.hint.disabled = false;
            this.setDevPieceControls(false, false);
            if (!this.progress.seenIntro.includes(level.id)) this.progress.seenIntro.push(level.id);
            this.save();
            this.updateStep();
        });
    }
    private updateStep(): void {
        if (!this.current) return;
        const order = buildOrder(this.current);
        const step = this.placedIds.length;
        this.counter.textContent = `${step} / ${order.length}`;
        const target = order[step];
        if (target && this.introPlaying) return;
        this.message.textContent = target ?
            `Find ${/^[aeiou]/i.test(target.color) ? 'an' : 'a'} ${target.color} ${target.kind === 'wheel' ? 'wheel' : 'brick'} that matches the shimmering one` :
            'You built it!';
    }
    private placed(id: string): void {
        if (!this.current) return;
        this.resetHintPrompt();
        this.placedIds.push(id);
        this.progress.partials[this.current.id] = { version: this.current.version, placedIds: [...this.placedIds] };
        this.save();
        this.playEffect('snap');
        if (this.placedIds.length >= this.current.bricks.length) this.finish();
        else this.updateStep();
    }
    private resetHintPrompt(): void {
        this.consecutiveWrongAttempts = 0;
        this.hint.classList.remove('is-pulsing');
    }
    private wrong(): void {
        this.consecutiveWrongAttempts++;
        this.hint.classList.toggle('is-pulsing', this.consecutiveWrongAttempts >= 3);
        this.tone(310, 0.11, 260);
        this.message.textContent = 'Not this one—try another shape!';
        window.setTimeout(() => this.updateStep(), 1000);
    }
    private finish(): void {
        if (!this.current) return;
        if (!this.progress.completed.includes(this.current.id)) this.progress.completed.push(this.current.id);
        delete this.progress.partials[this.current.id];
        this.save();
        this.message.textContent = 'You built it!';
        this.counter.textContent = `${this.placedIds.length} / ${this.placedIds.length}`;
        this.hint.disabled = true;
        this.setDevPieceControls(true, true);
        this.celebrate();
        this.play.classList.add('is-complete');
        this.completion.hidden = false;
        byId<HTMLElement>('completionStage').appendChild(this.model);
        this.model.tabIndex = 0;
        this.model.setAttribute('aria-label', `${this.current.title}, completed model. Drag or use arrow keys to rotate.`);
        byId<HTMLElement>('completionDescription').textContent = `${this.current.title} · ${this.placedIds.length} pieces, all snapped into place.`;
        this.scene?.showcase();
        this.fanfare();
        byId<HTMLElement>('completionTitle').focus({ preventScroll: true });
        this.root.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
}

new SnapforgeGame();
