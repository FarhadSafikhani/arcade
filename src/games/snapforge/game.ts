/// <reference types="vite/client" />
import { buildOrder, SnapLevel, validPlacedIds, validateLevel } from './level';
import { SnapScene3D } from './scene3d';
import { createClickBuffer, createConnectionBuffer } from './sound';

interface PartialBuild { version: number; placedIds: string[]; }
interface Progress { completed: string[]; partials: Record<string, PartialBuild>; seenIntro: string[]; muted: boolean; }

const STORAGE_KEY = 'snapforge-3d-progress-v1';
const levels = new Map<string, SnapLevel>();
for (const input of Object.values(import.meta.glob('./levels/*.json', { eager: true, import: 'default' }))) {
    try { const level = validateLevel(input); levels.set(level.id, level); }
    catch (error) { console.error('Invalid Snapforge level', error); }
}
const catalog = [...levels.values()]
    .map(level => ({ id: level.id, title: level.title, order: level.order, level }))
    .sort((a, b) => a.order - b.order);

function byId<T extends HTMLElement>(id: string): T {
    const result = document.getElementById(id);
    if (!result) throw new Error(`Snapforge missing #${id}`);
    return result as T;
}
function loadProgress(): Progress {
    const empty: Progress = { completed: [], partials: {}, seenIntro: [], muted: false };
    try {
        const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (!stored || typeof stored !== 'object') return empty;
        const data = stored as Record<string, unknown>;
        return { completed: Array.isArray(data.completed) ? data.completed.filter(id => typeof id === 'string') : [],
            partials: data.partials && typeof data.partials === 'object' ? data.partials as Record<string, PartialBuild> : {},
            seenIntro: Array.isArray(data.seenIntro) ? data.seenIntro.filter(id => typeof id === 'string') : [],
            muted: data.muted === true };
    } catch { return empty; }
}

class SnapforgeGame {
    private root = byId<HTMLElement>('snapforge');
    private gallery = byId<HTMLElement>('galleryScreen');
    private galleryTrack = byId<HTMLElement>('galleryTrack');
    private play = byId<HTMLElement>('playScreen');
    private model = byId<HTMLElement>('modelViewport');
    private pile = byId<HTMLElement>('pileViewport');
    private message = byId<HTMLElement>('buildMessage');
    private counter = byId<HTMLElement>('stepCounter');
    private previewCount = byId<HTMLElement>('galleryCount');
    private skip = byId<HTMLButtonElement>('skipIntroButton');
    private hint = byId<HTMLButtonElement>('hintButton');
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
    private galleryPointer: { id: number; startX: number; scrollLeft: number; dragging: boolean } | null = null;
    private suppressGalleryClickUntil = 0;
    private audio: AudioContext | null = null;
    private clickBuffer: AudioBuffer | null = null;
    private connectionBuffer: AudioBuffer | null = null;
    private devSnap: HTMLButtonElement | null = null;
    private devFinish: HTMLButtonElement | null = null;

    constructor() {
        this.renderGallery();
        this.updateSound();
        if (import.meta.env.DEV) {
            const panel = document.createElement('details');
            panel.className = 'dev-panel';
            const toggle = document.createElement('summary');
            toggle.textContent = '[DEV]';
            const actions = document.createElement('div');
            actions.className = 'dev-actions';
            this.devSnap = document.createElement('button');
            this.devSnap.type = 'button';
            this.devSnap.textContent = 'Snap next piece';
            this.devSnap.disabled = true;
            this.devSnap.addEventListener('click', () => this.scene?.snapNextPiece());
            this.devFinish = document.createElement('button');
            this.devFinish.type = 'button';
            this.devFinish.textContent = 'Finish model';
            this.devFinish.disabled = true;
            this.devFinish.addEventListener('click', () => {
                if (!this.current || !this.scene) return;
                this.scene.skipIntro();
                while (this.current && this.placedIds.length < this.current.bricks.length && this.scene.snapNextPiece()) { /* Place each remaining piece. */ }
            });
            const reset = document.createElement('button');
            reset.type = 'button';
            reset.textContent = 'Fresh start';
            reset.addEventListener('click', () => {
                localStorage.clear();
                window.location.reload();
            });
            actions.append(this.devSnap, this.devFinish, reset);
            panel.append(toggle, actions);
            this.root.appendChild(panel);
        }
        // Placement completes in an animation frame, so unlock audio during a user gesture.
        this.root.addEventListener('pointerdown', () => this.prepareAudio(), { passive: true });
        this.root.addEventListener('keydown', () => this.prepareAudio());
        // Capture before actions hide/rebuild their controls or disable the final gallery arrow.
        this.root.addEventListener('click', event => {
            const control = event.target instanceof Element
                ? event.target.closest('button, a[href], [role="button"]') : null;
            if (!control || control === this.sound || control.matches(':disabled, [aria-disabled="true"]')) return;
            if (control.closest('#galleryTrack') && event.detail &&
                performance.now() < this.suppressGalleryClickUntil) return;
            this.playEffect('click');
        }, true);
        this.sound.addEventListener('click', () => {
            this.progress.muted = !this.progress.muted;
            this.save(); this.updateSound();
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
        byId<HTMLButtonElement>('galleryPrevious').addEventListener('click', () => this.selectCard(this.selectedIndex - 1));
        byId<HTMLButtonElement>('galleryNext').addEventListener('click', () => this.selectCard(this.selectedIndex + 1));
        this.galleryTrack.addEventListener('scroll', () => this.updateCardFromScroll(), { passive: true });
        this.galleryTrack.addEventListener('pointerdown', event => this.galleryDown(event));
        this.galleryTrack.addEventListener('pointermove', event => this.galleryMove(event));
        this.galleryTrack.addEventListener('pointerup', event => this.galleryUp(event));
        this.galleryTrack.addEventListener('pointercancel', event => this.galleryUp(event));
        this.galleryTrack.addEventListener('click', event => {
            if (event.detail && performance.now() < this.suppressGalleryClickUntil) {
                event.preventDefault();
                event.stopPropagation();
            }
        }, true);
        this.skip.addEventListener('click', () => this.scene?.skipIntro());
        this.hint.addEventListener('click', () => {
            if (this.scene?.hint()) {
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
        try {
            this.scene = await SnapScene3D.create(this.root, this.model, this.pile);
            this.scene.setCallbacks(id => this.placed(id), () => this.wrong(), () => this.playEffect('click'));
            this.scene.setPreviews(this.previewEntries());
            byId<HTMLElement>('loadingNote').hidden = true;
        } catch (error) {
            console.error('Snapforge 3D could not start', error);
            byId<HTMLElement>('loadingNote').textContent = '3D could not start on this device. Please try a browser with WebGL support.';
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
    private prepareAudio(): AudioContext | null {
        if (this.progress.muted) return null;
        try {
            this.audio ??= new AudioContext();
            if (this.audio.state === 'suspended') void this.audio.resume().catch(() => {});
            return this.audio;
        } catch { return null; /* Sound is optional. */ }
    }
    private playEffect(kind: 'click' | 'connection'): void {
        const audio = this.prepareAudio();
        if (!audio) return;
        try {
            const buffer = kind === 'click'
                ? (this.clickBuffer ??= createClickBuffer(audio))
                : (this.connectionBuffer ??= createConnectionBuffer(audio));
            const source = audio.createBufferSource();
            const gain = audio.createGain();
            source.buffer = buffer;
            source.playbackRate.value = 0.97 + Math.random() * 0.06;
            gain.gain.value = 0.85 + Math.random() * 0.08;
            source.connect(gain).connect(audio.destination);
            source.onended = () => { source.disconnect(); gain.disconnect(); };
            source.start();
        } catch { /* Sound is optional. */ }
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
                gain.gain.exponentialRampToValueAtTime(0.09775, this.audio!.currentTime + delay + 0.012);
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

    private unlocked(index: number): boolean {
        return index === 0 || this.progress.completed.includes(catalog[index - 1].id);
    }
    private partial(level?: SnapLevel): PartialBuild | null {
        if (!level) return null;
        const partial = this.progress.partials[level.id];
        return partial?.version === level.version && validPlacedIds(level, partial.placedIds) &&
            partial.placedIds.length > 0 ? partial : null;
    }
    private previewEntries() {
        return catalog.map(item => ({ id: item.id,
            element: byId<HTMLElement>(`preview-${item.id}`), level: item.level,
            completed: this.progress.completed.includes(item.id) }));
    }
    private renderGallery(): void {
        this.galleryTrack.replaceChildren();
        for (const [index, item] of catalog.entries()) {
            const isUnlocked = this.unlocked(index);
            const isCompleted = this.progress.completed.includes(item.id);
            const isInProgress = Boolean(this.partial(item.level));
            const card = document.createElement('article');
            card.className = 'gallery-card';
            card.setAttribute('aria-label', `${item.title}, ${!isUnlocked ? 'locked' : isInProgress ? 'in progress' : isCompleted ? 'completed' : 'ready to build'}`);
            const visual = document.createElement('div');
            visual.className = 'card-visual';
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
            copy.append(eyebrow, title, pieceCount, action);
            card.append(visual, copy);
            this.galleryTrack.appendChild(card);
        }
        this.updateGalleryControls();
    }
    private galleryDown(event: PointerEvent): void {
        if (event.pointerType === 'touch' || event.button !== 0) return;
        this.galleryPointer = { id: event.pointerId, startX: event.clientX,
            scrollLeft: this.galleryTrack.scrollLeft, dragging: false };
    }
    private galleryMove(event: PointerEvent): void {
        const pointer = this.galleryPointer;
        if (!pointer || pointer.id !== event.pointerId) return;
        const distance = event.clientX - pointer.startX;
        if (!pointer.dragging && Math.abs(distance) > 6) {
            pointer.dragging = true;
            this.galleryTrack.classList.add('is-dragging');
            this.galleryTrack.setPointerCapture(event.pointerId);
        }
        if (pointer.dragging) {
            event.preventDefault();
            this.galleryTrack.scrollLeft = pointer.scrollLeft - distance;
        }
    }
    private galleryUp(event: PointerEvent): void {
        const pointer = this.galleryPointer;
        if (!pointer || pointer.id !== event.pointerId) return;
        if (pointer.dragging) this.suppressGalleryClickUntil = performance.now() + 350;
        this.galleryTrack.classList.remove('is-dragging');
        if (this.galleryTrack.hasPointerCapture(event.pointerId))
            this.galleryTrack.releasePointerCapture(event.pointerId);
        this.galleryPointer = null;
    }
    private selectCard(index: number): void {
        this.selectedIndex = Math.max(0, Math.min(catalog.length - 1, index));
        (this.galleryTrack.children[this.selectedIndex] as HTMLElement)?.scrollIntoView({ behavior: 'smooth',
            block: 'nearest', inline: 'center' });
        this.updateGalleryControls();
    }
    private updateCardFromScroll(): void {
        const trackRect = this.galleryTrack.getBoundingClientRect();
        const center = trackRect.left + trackRect.width / 2;
        let closest = Infinity;
        Array.from(this.galleryTrack.children).forEach((card, index) => {
            const rect = card.getBoundingClientRect();
            const distance = Math.abs(rect.left + rect.width / 2 - center);
            if (distance < closest) { closest = distance; this.selectedIndex = index; }
        });
        this.updateGalleryControls();
    }
    private updateGalleryControls(): void {
        this.previewCount.textContent = `${String(this.selectedIndex + 1).padStart(2, '0')} / ${String(catalog.length).padStart(2, '0')}`;
        byId<HTMLButtonElement>('galleryPrevious').disabled = this.selectedIndex === 0;
        byId<HTMLButtonElement>('galleryNext').disabled = this.selectedIndex === catalog.length - 1;
    }
    private closeShowcase(): void {
        this.completion.hidden = true;
        this.play.classList.remove('is-complete');
        this.play.querySelector('.model-panel')!.insertBefore(this.model, this.play.querySelector('.build-status'));
        this.model.removeAttribute('tabindex');
        this.model.setAttribute('aria-label', 'Drag to turn the model');
    }
    private showGallery(): void {
        this.closeShowcase();
        this.scene?.leaveLevel();
        this.current = null;
        if (this.devSnap) this.devSnap.disabled = true;
        if (this.devFinish) this.devFinish.disabled = true;
        this.play.hidden = true;
        this.gallery.hidden = false;
        this.root.classList.remove('is-playing');
        this.backLabel.textContent = 'Arcade';
        this.back.setAttribute('aria-label', 'Back to arcade');
        this.completion.hidden = true;
        this.renderGallery();
        this.scene?.setPreviews(this.previewEntries());
        this.selectCard(this.selectedIndex);
    }
    private startLevel(level: SnapLevel, resume: boolean): void {
        if (!this.scene) return;
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
        this.skip.hidden = resume;
        this.hint.disabled = !resume;
        if (this.devSnap) this.devSnap.disabled = !resume;
        if (this.devFinish) this.devFinish.disabled = false;
        this.message.textContent = resume ? '' : 'Watch the model come apart…';
        byId<HTMLElement>('colorCue').style.backgroundColor = 'transparent';
        this.updateStep();
        this.scene.startLevel(level, this.placedIds, !resume, () => {
            this.skip.hidden = true;
            this.hint.disabled = false;
            if (this.devSnap) this.devSnap.disabled = false;
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
        if (target && !this.skip.hidden) return;
        this.message.textContent = target ?
            `Find ${/^[aeiou]/i.test(target.color) ? 'an' : 'a'} ${target.color} brick that matches the shimmering one` :
            'You built it!';
        byId<HTMLElement>('colorCue').style.backgroundColor = target ? this.current.palette[target.color] : 'transparent';
    }
    private placed(id: string): void {
        if (!this.current) return;
        this.placedIds.push(id);
        this.progress.partials[this.current.id] = { version: this.current.version, placedIds: [...this.placedIds] };
        this.save();
        this.playEffect('connection');
        if (this.placedIds.length >= this.current.bricks.length) this.finish();
        else this.updateStep();
    }
    private wrong(): void {
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
        if (this.devSnap) this.devSnap.disabled = true;
        if (this.devFinish) this.devFinish.disabled = true;
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
