import { cardView, emptyBuild, isSpell, spellName, type CardId, type PassiveId, type RunBuild, type SpellId } from './cards';
import { DefenderAudio } from './audio';
import { LocalLink, NetLink, type Link, type PlayerView } from './net/link';
import { arrowSpeed, drawFraction, readBestWave, stepFeet, walkSpeed, xpToAdvance } from './rules';
import type { FxEvent } from './sim';
import { ARCHER_COLORS, BEST_WAVE_KEY, BOW, NET, PLAYER, type EnemyId } from './tuning';
import { DefenderWorld } from './world';

enum GameState {
    Loading = 'loading',
    Ready = 'ready',
    Connecting = 'connecting',
    Lobby = 'lobby',
    Playing = 'playing',
    WaveBreak = 'wave-break',
    Paused = 'paused',
    GameOver = 'game-over',
}

const MOVE_KEYS: Record<string, { forward?: number; right?: number }> = {
    KeyW: { forward: 1 }, ArrowUp: { forward: 1 },
    KeyS: { forward: -1 }, ArrowDown: { forward: -1 },
    KeyD: { right: 1 }, ArrowRight: { right: 1 },
    KeyA: { right: -1 }, ArrowLeft: { right: -1 },
};

const SPELL_SLOTS: Record<string, number> = {
    KeyQ: 0, Digit1: 0,
    KeyE: 1, Digit2: 1,
    KeyR: 2, Digit3: 2,
    KeyF: 3, Digit4: 3,
};

const CARD_KEYS: Record<string, number> = { Digit1: 0, Digit2: 1, Digit3: 2 };
const SLOT_LABELS = ['Q', 'E', 'R', 'F'];
const THREAT: Partial<Record<EnemyId, string>> = {
    runner: 'Runners — fast and thin',
    shield: 'Shields — flank them from the towers',
    brute: 'Brutes — they hit the gate hard',
    caster: 'Casters — shoot the fire down',
};
const NAME_KEY = 'defender.name';

function element<T extends HTMLElement>(id: string): T {
    const found = document.getElementById(id);
    if (!found) throw new Error(`Missing #${id}`);
    return found as T;
}

class DefenderGame {
    private state = GameState.Loading;
    private resumeState: GameState.Playing | GameState.WaveBreak = GameState.Playing;
    private world: DefenderWorld | null = null;
    private link: Link | null = null;
    private solo: LocalLink | null = null;
    private readonly audio = new DefenderAudio();
    private readonly listeners = new AbortController();
    private readonly keys = new Set<string>();
    private readonly stage = element<HTMLElement>('stage');
    private readonly ui = {
        root: element<HTMLElement>('defender'),
        wave: element<HTMLElement>('waveNumber'),
        level: element<HTMLElement>('levelLabel'),
        xpFill: element<HTMLElement>('xpFill'),
        gatePercent: element<HTMLElement>('gatePercent'),
        gateFill: element<HTMLElement>('gateFill'),
        banner: element<HTMLElement>('banner'),
        spells: element<HTMLElement>('spellBar'),
        crew: element<HTMLElement>('crew'),
        loading: element<HTMLElement>('loadingScreen'),
        loadingNote: element<HTMLElement>('loadingNote'),
        start: element<HTMLElement>('startScreen'),
        startBest: element<HTMLElement>('startBest'),
        startNote: element<HTMLElement>('startNote'),
        coopButton: element<HTMLButtonElement>('coopButton'),
        nameInput: element<HTMLInputElement>('nameInput'),
        lobby: element<HTMLElement>('lobbyScreen'),
        lobbyCode: element<HTMLElement>('lobbyCode'),
        lobbyCopy: element<HTMLButtonElement>('lobbyCopy'),
        lobbyArchers: element<HTMLElement>('lobbyArchers'),
        pause: element<HTMLElement>('pauseScreen'),
        pauseNote: element<HTMLElement>('pauseNote'),
        restartButton: element<HTMLButtonElement>('restartButton'),
        gameOver: element<HTMLElement>('gameOverScreen'),
        finalWave: element<HTMLElement>('finalWave'),
        finalBest: element<HTMLElement>('finalBest'),
        touchDraw: element<HTMLButtonElement>('touchDraw'),
        cards: element<HTMLElement>('cardScreen'),
        cardNote: element<HTMLElement>('cardNote'),
        cardChoices: element<HTMLElement>('cardChoices'),
    };
    private best = readBestWave(localStorage, BEST_WAVE_KEY);
    private phase = '';
    private feetX = 0;
    private feetZ = PLAYER.walk.z.min + 0.3;
    private yaw = 0;
    private pitch = -0.22;
    private moved = 0;
    private triggerHeld = false;
    private drawing = false;
    private drawHeld = 0;
    private nockTimer = 0;
    private seq = 0;
    private poseTimer = 0;
    private lastFrame = 0;
    private frameId = 0;
    private touchLook: { id: number; x: number; y: number } | null = null;
    private shown = { wave: -1, gate: -1, banner: '', level: -1, xp: -1, spells: '', crew: '', lobby: '' };
    private bannerTimer = 0;
    private offerKey = '';
    private suppressPause = false;
    private spellButtons: HTMLButtonElement[] = [];

    async init(): Promise<void> {
        this.bindEvents();
        try {
            this.world = await DefenderWorld.create(this.stage);
            this.solo = await LocalLink.create();
        } catch (error) {
            console.error(error);
            this.ui.loadingNote.textContent = 'This browser could not start the 3D scene.';
            return;
        }
        new ResizeObserver(() => this.world?.resize(this.stage.clientWidth, this.stage.clientHeight)).observe(this.stage);
        this.ui.loading.hidden = true;
        this.ui.startBest.textContent = this.best > 0 ? `Best: wave ${this.best}` : '';
        this.ui.nameInput.value = readName();
        const invited = invitedRoom();
        if (invited) this.ui.coopButton.textContent = 'Join the defense';
        this.setState(GameState.Ready);
        this.lastFrame = performance.now();
        this.frameId = requestAnimationFrame(now => this.frame(now));
    }

    destroy(): void {
        cancelAnimationFrame(this.frameId);
        this.listeners.abort();
        this.link?.leave();
        this.world?.destroy();
        this.audio.destroy();
    }

    private get active(): boolean {
        return this.state === GameState.Playing || this.state === GameState.WaveBreak;
    }

    private get nocked(): boolean {
        return this.nockTimer <= 0;
    }

    private get mine(): PlayerView | undefined {
        return this.link?.view.players.get(this.link.me);
    }

    private get choosing(): boolean {
        return (this.mine?.offer.length ?? 0) > 0;
    }

    private setState(state: GameState): void {
        this.state = state;
        this.ui.root.dataset.state = state;
        this.ui.start.hidden = state !== GameState.Ready && state !== GameState.Connecting;
        this.ui.lobby.hidden = state !== GameState.Lobby;
        this.ui.pause.hidden = state !== GameState.Paused;
        this.ui.gameOver.hidden = state !== GameState.GameOver;
        this.ui.coopButton.disabled = state === GameState.Connecting;
    }

    private bindEvents(): void {
        const signal = this.listeners.signal;
        element('startButton').addEventListener('click', () => this.playSolo(), { signal });
        this.ui.coopButton.addEventListener('click', () => void this.playTogether(), { signal });
        element('lobbyStart').addEventListener('click', () => this.beginRun(), { signal });
        element('lobbyLeave').addEventListener('click', () => this.leaveRoom(''), { signal });
        this.ui.lobbyCopy.addEventListener('click', () => void this.copyInvite(), { signal });
        element('resumeButton').addEventListener('click', () => this.resume(), { signal });
        this.ui.restartButton.addEventListener('click', () => this.beginRun(), { signal });
        element('leaveButton').addEventListener('click', () => this.leaveRoom(''), { signal });
        element('againButton').addEventListener('click', () => this.beginRun(), { signal });

        document.addEventListener('pointerlockchange', () => {
            const locked = document.pointerLockElement === this.world?.canvas;
            if (!locked && this.active) {
                if (this.suppressPause) {
                    this.suppressPause = false;
                    return;
                }
                this.pause();
            } else if (locked && this.state === GameState.Paused) this.continueRun();
        }, { signal });
        document.addEventListener('pointerlockerror', () => {
            this.ui.pauseNote.textContent = 'Click Resume again to lock the mouse.';
        }, { signal });
        document.addEventListener('visibilitychange', () => { if (document.hidden && this.active) this.pause(); }, { signal });

        document.addEventListener('mousemove', event => {
            if (this.active && document.pointerLockElement) this.look(event.movementX, event.movementY, PLAYER.lookSensitivity);
        }, { signal });
        document.addEventListener('mousedown', event => {
            if (!this.active || !document.pointerLockElement || this.choosing) return;
            if (event.button === 0) this.triggerHeld = true;
            if (event.button === 2) this.cancelDraw();
        }, { signal });
        document.addEventListener('mouseup', event => {
            if (event.button === 0) this.releaseTrigger();
        }, { signal });
        document.addEventListener('contextmenu', event => { if (this.active) event.preventDefault(); }, { signal });

        document.addEventListener('keydown', event => {
            if (event.target instanceof HTMLInputElement) return;
            if (event.code === 'KeyP' && this.active) {
                document.exitPointerLock();
                this.pause();
                return;
            }
            if (this.choosing && this.active && event.code in CARD_KEYS) {
                event.preventDefault();
                this.link?.pick(CARD_KEYS[event.code]);
                return;
            }
            if (!this.choosing && event.code in SPELL_SLOTS && !event.repeat) this.trySpell(SPELL_SLOTS[event.code]);
            if (MOVE_KEYS[event.code]) {
                this.keys.add(event.code);
                if (this.active) event.preventDefault();
            }
        }, { signal });
        document.addEventListener('keyup', event => this.keys.delete(event.code), { signal });
        window.addEventListener('blur', () => this.keys.clear(), { signal });

        this.stage.addEventListener('pointerdown', event => {
            if (event.pointerType !== 'touch' || !this.active || event.target === this.ui.touchDraw) return;
            this.touchLook = { id: event.pointerId, x: event.clientX, y: event.clientY };
        }, { signal });
        this.stage.addEventListener('pointermove', event => {
            if (!this.touchLook || event.pointerId !== this.touchLook.id) return;
            this.look(event.clientX - this.touchLook.x, event.clientY - this.touchLook.y, PLAYER.touchLookSensitivity);
            this.touchLook.x = event.clientX;
            this.touchLook.y = event.clientY;
        }, { signal });
        this.stage.addEventListener('click', () => {
            if (this.active && !this.choosing && !document.pointerLockElement) this.requestLock();
        }, { signal });
        const endTouch = (event: PointerEvent) => { if (this.touchLook?.id === event.pointerId) this.touchLook = null; };
        this.stage.addEventListener('pointerup', endTouch, { signal });
        this.stage.addEventListener('pointercancel', endTouch, { signal });
        this.ui.touchDraw.addEventListener('pointerdown', event => {
            event.preventDefault();
            if (this.active && !this.choosing) this.triggerHeld = true;
        }, { signal });
        this.ui.touchDraw.addEventListener('pointerup', () => this.releaseTrigger(), { signal });
        this.ui.touchDraw.addEventListener('pointercancel', () => this.cancelDraw(), { signal });
        const coarse = matchMedia('(pointer: coarse)');
        this.ui.touchDraw.hidden = !coarse.matches;
        coarse.addEventListener('change', () => { this.ui.touchDraw.hidden = !coarse.matches; }, { signal });

        window.addEventListener('pagehide', () => this.destroy(), { signal });
    }

    private requestLock(): void {
        const canvas = this.world?.canvas;
        if (!canvas || matchMedia('(pointer: coarse)').matches || this.choosing) return;
        try {
            const request = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
            request?.catch?.(() => { this.ui.pauseNote.textContent = 'Click Resume again to lock the mouse.'; });
        } catch {
            this.ui.pauseNote.textContent = 'Click Resume again to lock the mouse.';
        }
    }

    private playSolo(): void {
        if (!this.solo) return;
        this.audio.unlock();
        this.useLink(this.solo);
        this.beginRun();
    }

    private async playTogether(): Promise<void> {
        if (this.state === GameState.Connecting) return;
        this.audio.unlock();
        const name = this.ui.nameInput.value.trim().slice(0, 16);
        try { localStorage.setItem(NAME_KEY, name); } catch { /* storage may be unavailable */ }
        this.ui.startNote.textContent = 'Finding the gate…';
        this.setState(GameState.Connecting);
        try {
            const link = await NetLink.connect(invitedRoom(), name);
            link.onClose = reason => this.leaveRoom(reason);
            this.ui.startNote.textContent = '';
            this.useLink(link);
            history.replaceState(null, '', inviteUrl(link.roomId));
        } catch (error) {
            console.error(error);
            const message = error instanceof Error && error.message.includes('older') ? error.message
                : invitedRoom() ? 'That room is closed or full. Start or join another.'
                    : 'Could not reach the co-op server.';
            this.ui.startNote.textContent = message;
            if (invitedRoom()) {
                history.replaceState(null, '', inviteUrl(''));
                this.ui.coopButton.textContent = 'Defend together';
            }
            this.setState(GameState.Ready);
        }
    }

    private useLink(link: Link): void {
        if (this.link && this.link !== link) this.link.leave();
        this.link = link;
        this.phase = '';
        this.offerKey = '';
        this.world?.clear();
        this.shown.spells = '';
        this.shown.crew = '';
        this.shown.lobby = '';
        this.ui.restartButton.hidden = link.online;
        element('leaveButton').hidden = !link.online;
        this.ui.crew.hidden = !link.online;
    }

    private leaveRoom(reason: string): void {
        if (!this.link?.online) return;
        const link = this.link;
        this.link = null;
        link.onClose = null;
        link.leave();
        this.world?.clear();
        this.closeCards();
        this.cancelDraw();
        if (document.pointerLockElement) document.exitPointerLock();
        history.replaceState(null, '', inviteUrl(''));
        this.ui.coopButton.textContent = 'Defend together';
        this.ui.startNote.textContent = reason;
        this.ui.crew.hidden = true;
        this.showBanner('', 0);
        this.setState(GameState.Ready);
    }

    /** Asks for a fresh run: at once offline, for the whole room online. */
    private beginRun(): void {
        this.audio.unlock();
        this.link?.start();
        if (this.link && !this.link.online && this.phase === 'playing') this.onRunStart();
        this.requestLock();
    }

    private async copyInvite(): Promise<void> {
        if (!this.link?.online) return;
        try {
            await navigator.clipboard.writeText(new URL(inviteUrl(this.link.roomId), location.href).href);
            this.ui.lobbyCopy.textContent = 'Link copied';
        } catch {
            this.ui.lobbyCopy.textContent = 'Copy failed';
        }
    }

    /** A new run began: back to the middle of the wall, bow at rest. */
    private onRunStart(): void {
        const mine = this.mine;
        this.feetX = mine?.x ?? 0;
        this.feetZ = mine?.z ?? PLAYER.walk.z.min + 0.3;
        this.yaw = 0;
        this.pitch = -0.22;
        this.cancelDraw();
        this.nockTimer = 0;
        this.offerKey = '';
        this.shown.level = -1;
        this.shown.xp = -1;
        this.shown.spells = '';
        this.closeCards();
        this.world?.clear();
    }

    private pause(): void {
        if (!this.active) return;
        this.resumeState = this.state === GameState.WaveBreak ? GameState.WaveBreak : GameState.Playing;
        this.cancelDraw();
        this.keys.clear();
        this.touchLook = null;
        this.ui.pauseNote.textContent = this.link?.online ? 'The fight goes on without you.' : '';
        this.ui.cards.hidden = true;
        this.setState(GameState.Paused);
    }

    private resume(): void {
        if (this.state !== GameState.Paused) return;
        this.audio.unlock();
        if (matchMedia('(pointer: coarse)').matches) this.continueRun();
        else this.requestLock();
    }

    private continueRun(): void {
        this.lastFrame = performance.now();
        this.setState(this.resumeState);
        if (this.choosing) this.ui.cards.hidden = false;
    }

    private look(deltaX: number, deltaY: number, sensitivity: number): void {
        this.yaw -= deltaX * sensitivity;
        this.pitch = Math.min(PLAYER.pitchLimit, Math.max(-PLAYER.pitchLimit, this.pitch - deltaY * sensitivity));
    }

    private releaseTrigger(): void {
        this.triggerHeld = false;
        const mine = this.mine;
        if (!this.drawing || !this.link || !mine || this.choosing) return;
        const draw = drawFraction(this.drawHeld, BOW.drawTime * mine.drawTime);
        this.seq += 1;
        this.link.loose({ draw, yaw: this.yaw, pitch: this.pitch, x: this.feetX, z: this.feetZ, seq: this.seq });
        // Online, the shot flies here at once; the server's copy replaces it where it lands.
        // Twin String and Barrage extras show when the server sends them.
        if (this.link.online) this.world?.predict(this.seq, arrowSpeed(draw));
        this.audio.shot(draw);
        this.drawing = false;
        this.drawHeld = 0;
        this.nockTimer = BOW.nockDelay * mine.nock;
    }

    private trySpell(slot: number): void {
        if (!this.link || this.state !== GameState.Playing || this.choosing) return;
        this.link.cast(slot, this.yaw, this.pitch);
    }

    private cancelDraw(): void {
        this.triggerHeld = false;
        this.drawing = false;
        this.drawHeld = 0;
    }

    private frame(now: number): void {
        this.frameId = requestAnimationFrame(next => this.frame(next));
        const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
        this.lastFrame = now;
        const world = this.world;
        if (!world) return;
        const link = this.link;
        const mine = this.mine;

        this.moved = 0;
        if (link) {
            this.followPhase(link.view.phase);
            if (this.active && mine) this.steer(dt, mine);
            const paused = !link.online && this.state === GameState.Paused;
            const events = link.update(dt, paused || !this.active);
            if (this.link === link) {
                this.applyEffects(events);
                this.followCards();
                this.updateHud();
            }
        }

        this.bannerTimer = Math.max(0, this.bannerTimer - dt);
        if (this.bannerTimer === 0 && this.state !== GameState.WaveBreak && !this.choosing) this.showBanner('', 0);
        const draw = this.drawing && mine ? drawFraction(this.drawHeld, BOW.drawTime * mine.drawTime) : 0;
        this.ui.root.style.setProperty('--draw', draw.toFixed(3));
        world.setPose(this.feetX, this.feetZ, this.yaw, this.pitch, this.moved);
        if (link) world.sync(link.view, link.me, dt, link.online);
        world.render(dt, draw, this.nocked);
    }

    /** Walks, draws, and reports the pose. Movement is ours to predict; the server may pull us back. */
    private steer(dt: number, mine: PlayerView): void {
        const link = this.link;
        if (!link) return;
        if (link.online && Math.hypot(mine.x - this.feetX, mine.z - this.feetZ) > NET.snapDistance) {
            this.feetX = mine.x;
            this.feetZ = mine.z;
        }
        this.nockTimer = Math.max(0, this.nockTimer - dt);
        if (this.triggerHeld && !this.drawing && this.nocked && !this.choosing) {
            this.drawing = true;
            this.drawHeld = 0;
        }
        if (this.drawing) this.drawHeld += dt;

        let forward = 0;
        let right = 0;
        for (const code of this.keys) {
            forward += MOVE_KEYS[code]?.forward ?? 0;
            right += MOVE_KEYS[code]?.right ?? 0;
        }
        const length = Math.hypot(forward, right);
        this.moved = 0;
        if (length > 0 && this.state !== GameState.Paused) {
            const pace = walkSpeed(this.drawing) * (this.drawing ? mine.drawMove : 1) * dt;
            const sin = Math.sin(this.yaw);
            const cos = Math.cos(this.yaw);
            const dx = (-sin * forward + cos * right) / length * pace;
            const dz = (-cos * forward - sin * right) / length * pace;
            const next = stepFeet(this.feetX, this.feetZ, dx, dz);
            this.moved = Math.hypot(next.x - this.feetX, next.z - this.feetZ);
            this.feetX = next.x;
            this.feetZ = next.z;
        }

        this.poseTimer -= dt;
        if (!link.online || this.poseTimer <= 0) {
            this.poseTimer = NET.inputInterval;
            const draw = this.drawing ? drawFraction(this.drawHeld, BOW.drawTime * mine.drawTime) : 0;
            link.pose({ x: this.feetX, z: this.feetZ, yaw: this.yaw, pitch: this.pitch, draw });
        }
    }

    /** Moves the screens along with the run's phase, which the sim or server owns. */
    private followPhase(phase: string): void {
        if (phase === this.phase) return;
        const before = this.phase;
        this.phase = phase;
        if (phase === 'playing' && (before === 'lobby' || before === 'over' || before === '')) this.onRunStart();
        if (phase === 'lobby') {
            this.cancelDraw();
            this.closeCards();
            if (document.pointerLockElement) document.exitPointerLock();
            this.setState(this.link?.online ? GameState.Lobby : GameState.Ready);
            return;
        }
        if (phase === 'over') {
            this.cancelDraw();
            this.closeCards();
            this.setState(GameState.GameOver);
            if (document.pointerLockElement) document.exitPointerLock();
            return;
        }
        const next = phase === 'break' ? GameState.WaveBreak : GameState.Playing;
        if (this.state === GameState.Paused) this.resumeState = next;
        else this.setState(next);
    }

    private applyEffects(events: readonly FxEvent[]): void {
        const me = this.link?.me;
        let hits = 0;
        let kills = 0;
        for (const event of events) {
            switch (event.t) {
                case 'hit': hits++; break;
                case 'kill': kills++; break;
                case 'block': this.audio.blocked(); break;
                case 'stick': this.audio.stick(); break;
                case 'gate': this.audio.gateHit(); break;
                case 'loose':
                    if (event.owner !== me) this.audio.shot(event.draw * 0.5);
                    break;
                case 'spell':
                    if (event.owner === me) this.audio.spell();
                    break;
                case 'level':
                    if (event.owner === me) {
                        this.audio.level();
                        if (this.bannerTimer <= 0) this.showBanner('Level up', 1.2);
                    }
                    break;
                case 'wave': {
                    const fresh = event.fresh ? THREAT[event.fresh] : undefined;
                    this.showBanner(fresh ?? `Wave ${event.wave}`, 2.4);
                    this.audio.waveStart();
                    if (event.wave > this.best) {
                        this.best = event.wave;
                        try { localStorage.setItem(BEST_WAVE_KEY, String(event.wave)); } catch { /* storage may be unavailable */ }
                    }
                    break;
                }
                case 'over':
                    this.ui.finalWave.textContent = String(event.wave);
                    this.ui.finalBest.textContent = String(this.best);
                    this.showBanner('', 0);
                    this.audio.gameOver();
                    break;
                default:
                    break;
            }
        }
        if (hits > kills) this.audio.hit();
        if (kills > 0) this.audio.death();
        this.world?.effects(events);
    }

    /** Opens the card sheet whenever the sim deals this archer a fresh offer, and closes it after a pick. */
    private followCards(): void {
        const offer = [...(this.mine?.offer ?? [])];
        const key = offer.join(',');
        if (key === this.offerKey) return;
        this.offerKey = key;
        if (offer.length === 0) {
            this.closeCards();
            if (this.active) this.requestLock();
            return;
        }
        this.cancelDraw();
        if (document.pointerLockElement) {
            this.suppressPause = true;
            document.exitPointerLock();
        }
        this.showBanner('', 0);
        this.renderCards(offer as CardId[]);
    }

    private renderCards(offer: CardId[]): void {
        const mine = this.mine;
        const pending = mine?.pending ?? 0;
        this.ui.cardChoices.replaceChildren();
        this.ui.cardNote.textContent = pending > 1 ? `${pending} upgrades waiting. Keys 1 to 3.` : 'Keys 1 to 3.';
        const build = buildOf(mine);
        offer.forEach((id, index) => {
            const view = cardView(id, build);
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'card-choice';
            const kind = document.createElement('span');
            kind.className = 'card-kind';
            kind.textContent = view.kind === 'spell' ? 'Spell' : 'Passive';
            const name = document.createElement('span');
            name.className = 'card-name';
            name.textContent = `${index + 1}  ${view.name}`;
            const detail = document.createElement('span');
            detail.className = 'card-detail';
            detail.textContent = view.detail;
            button.append(kind, name, detail);
            button.addEventListener('click', event => {
                event.stopPropagation();
                this.link?.pick(index);
            });
            this.ui.cardChoices.append(button);
        });
        this.ui.cards.hidden = this.state === GameState.Paused;
    }

    private closeCards(): void {
        this.ui.cards.hidden = true;
        this.ui.cardChoices.replaceChildren();
    }

    private refreshSpells(spells: string[]): void {
        this.ui.spells.replaceChildren();
        this.spellButtons = [];
        spells.forEach((id, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'spell';
            const cool = document.createElement('span');
            cool.className = 'spell-cool';
            const key = document.createElement('span');
            key.className = 'spell-key';
            key.textContent = SLOT_LABELS[index] ?? String(index + 1);
            const name = document.createElement('span');
            name.className = 'spell-name';
            name.textContent = spellName(id as SpellId);
            const time = document.createElement('span');
            time.className = 'spell-time';
            button.append(cool, key, name, time);
            button.addEventListener('click', event => {
                event.stopPropagation();
                this.trySpell(index);
            });
            this.ui.spells.append(button);
            this.spellButtons.push(button);
        });
        this.ui.spells.hidden = spells.length === 0;
    }

    private updateHud(): void {
        const view = this.link?.view;
        const mine = this.mine;
        if (!view) return;
        if (this.shown.wave !== view.wave) {
            this.shown.wave = view.wave;
            this.ui.wave.textContent = String(Math.max(1, view.wave));
        }
        if (mine) {
            const need = xpToAdvance(mine.level);
            const xpMark = mine.level * 1000 + Math.floor(mine.xp);
            if (this.shown.level !== mine.level || this.shown.xp !== xpMark) {
                this.shown.level = mine.level;
                this.shown.xp = xpMark;
                this.ui.level.textContent = `Lv ${mine.level}`;
                this.ui.xpFill.style.setProperty('--xp', need > 0 ? String(mine.xp / need) : '0');
            }
            const spells = [...mine.spells];
            if (this.shown.spells !== spells.join(',')) {
                this.shown.spells = spells.join(',');
                this.refreshSpells(spells);
            }
            const left = [...mine.cooldowns];
            const max = [...mine.cooldownMax];
            this.spellButtons.forEach((button, index) => {
                const remaining = left[index] ?? 0;
                const total = max[index] ?? 0;
                button.style.setProperty('--cool', total > 0 ? String(clamp01(remaining / total)) : '0');
                const time = button.querySelector('.spell-time');
                if (time) time.textContent = remaining > 0.05 ? remaining.toFixed(1) : '';
            });
        }
        const gate = view.gateMax > 0 ? Math.ceil((view.gate / view.gateMax) * 100) : 100;
        if (this.shown.gate !== gate) {
            this.shown.gate = gate;
            this.ui.gatePercent.textContent = `${gate}%`;
            this.ui.gateFill.style.setProperty('--gate', String(gate / 100));
            this.ui.root.classList.toggle('is-gate-low', gate <= 30);
        }
        if (this.state === GameState.WaveBreak && !this.choosing) {
            let waiting = 0;
            view.players.forEach(player => { if (player.offer.length > 0) waiting++; });
            this.showBanner(waiting > 0
                ? `Waiting for ${waiting === 1 ? 'an archer' : `${waiting} archers`} to choose`
                : `Wave ${view.wave + 1} in ${Math.max(1, Math.ceil(view.breakLeft))}`, 0);
        }
        if (this.link?.online) this.paintCrew();
    }

    /** Who is on the wall: a corner list in play, and the roster in the lobby. */
    private paintCrew(): void {
        const link = this.link;
        if (!link) return;
        const names: { name: string; slot: number; me: boolean }[] = [];
        link.view.players.forEach((player, id) => names.push({ name: player.name, slot: player.slot, me: id === link.me }));
        names.sort((a, b) => a.slot - b.slot);
        const key = names.map(entry => `${entry.slot}:${entry.name}`).join('|') + link.roomId;
        if (key === this.shown.crew) return;
        this.shown.crew = key;
        const rows = names.map(entry => {
            const row = document.createElement('li');
            row.style.setProperty('--archer', `#${ARCHER_COLORS[entry.slot % ARCHER_COLORS.length].toString(16).padStart(6, '0')}`);
            row.textContent = entry.me ? `${entry.name} (you)` : entry.name;
            return row;
        });
        this.ui.crew.replaceChildren(...rows);
        this.ui.lobbyArchers.replaceChildren(...rows.map(row => row.cloneNode(true)));
        this.ui.lobbyCode.textContent = link.roomId;
        this.ui.lobbyCopy.textContent = 'Copy invite link';
        const lobbyNote = element<HTMLElement>('lobbyNote');
        lobbyNote.textContent = `${names.length} of ${NET.maxArchers} archers. Anyone can open the gate.`;
    }

    private showBanner(text: string, seconds: number): void {
        if (seconds > 0) this.bannerTimer = seconds;
        if (this.shown.banner === text) return;
        this.shown.banner = text;
        this.ui.banner.textContent = text;
        this.ui.banner.hidden = text === '';
    }
}

/** Enough of an archer's build to name their next cards. */
function buildOf(player: PlayerView | undefined): RunBuild {
    const build = emptyBuild();
    build.spells = [...(player?.spells ?? [])] as SpellId[];
    player?.ranks.forEach((rank, id) => {
        if (isSpell(id as CardId)) build.spellRanks[id as SpellId] = rank;
        else build.ranks[id as PassiveId] = rank;
    });
    return build;
}

function invitedRoom(): string {
    return new URLSearchParams(location.search).get('room')?.trim() ?? '';
}

function inviteUrl(roomId: string): string {
    const url = new URL(location.href);
    if (roomId) url.searchParams.set('room', roomId);
    else url.searchParams.delete('room');
    return `${url.pathname}${url.search}${url.hash}`;
}

function readName(): string {
    try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

void new DefenderGame().init();
