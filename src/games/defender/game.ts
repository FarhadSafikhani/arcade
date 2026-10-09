import { DefenderAudio } from './audio';
import { arrowDamage, arrowSpeed, drawFraction, gateAfterStrikes, readBestWave, walkSpeed, WaveSpec, waveSpec } from './rules';
import { BEST_WAVE_KEY, BOW, GATE, GOBLIN, PLAYER, SIM, WAVES } from './tuning';
import { DefenderWorld, StepReport } from './world';

enum GameState {
    Loading = 'loading',
    Ready = 'ready',
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

function element<T extends HTMLElement>(id: string): T {
    const found = document.getElementById(id);
    if (!found) throw new Error(`Missing #${id}`);
    return found as T;
}

class DefenderGame {
    private state = GameState.Loading;
    private resumeState: GameState.Playing | GameState.WaveBreak = GameState.Playing;
    private world: DefenderWorld | null = null;
    private readonly audio = new DefenderAudio();
    private readonly listeners = new AbortController();
    private readonly keys = new Set<string>();
    private readonly stage = element<HTMLElement>('stage');
    private readonly ui = {
        root: element<HTMLElement>('defender'),
        wave: element<HTMLElement>('waveNumber'),
        gatePercent: element<HTMLElement>('gatePercent'),
        gateFill: element<HTMLElement>('gateFill'),
        banner: element<HTMLElement>('banner'),
        loading: element<HTMLElement>('loadingScreen'),
        loadingNote: element<HTMLElement>('loadingNote'),
        start: element<HTMLElement>('startScreen'),
        startBest: element<HTMLElement>('startBest'),
        pause: element<HTMLElement>('pauseScreen'),
        pauseNote: element<HTMLElement>('pauseNote'),
        gameOver: element<HTMLElement>('gameOverScreen'),
        finalWave: element<HTMLElement>('finalWave'),
        finalBest: element<HTMLElement>('finalBest'),
        touchDraw: element<HTMLButtonElement>('touchDraw'),
    };
    private wave = 0;
    private spec: WaveSpec = waveSpec(1, GOBLIN);
    private toSpawn = 0;
    private spawnTimer = 0;
    private breakTimer = 0;
    private gate = GATE.health;
    private best = readBestWave(localStorage, BEST_WAVE_KEY);
    private triggerHeld = false;
    private drawing = false;
    private drawHeld = 0;
    private nockTimer = 0;
    private accumulator = 0;
    private lastFrame = 0;
    private frameId = 0;
    private touchLook: { id: number; x: number; y: number } | null = null;
    private shown = { wave: -1, gate: -1, banner: '' };
    private bannerTimer = 0;

    async init(): Promise<void> {
        this.bindEvents();
        try {
            this.world = await DefenderWorld.create(this.stage);
        } catch (error) {
            console.error(error);
            this.ui.loadingNote.textContent = 'This browser could not start the 3D scene.';
            return;
        }
        new ResizeObserver(() => this.world?.resize(this.stage.clientWidth, this.stage.clientHeight)).observe(this.stage);
        this.ui.loading.hidden = true;
        this.ui.startBest.textContent = this.best > 0 ? `Best: wave ${this.best}` : '';
        this.setState(GameState.Ready);
        this.lastFrame = performance.now();
        this.frameId = requestAnimationFrame(now => this.frame(now));
    }

    destroy(): void {
        cancelAnimationFrame(this.frameId);
        this.listeners.abort();
        this.world?.destroy();
        this.audio.destroy();
    }

    private get active(): boolean {
        return this.state === GameState.Playing || this.state === GameState.WaveBreak;
    }

    private get nocked(): boolean {
        return this.nockTimer <= 0;
    }

    private setState(state: GameState): void {
        this.state = state;
        this.ui.root.dataset.state = state;
        this.ui.start.hidden = state !== GameState.Ready;
        this.ui.pause.hidden = state !== GameState.Paused;
        this.ui.gameOver.hidden = state !== GameState.GameOver;
    }

    private bindEvents(): void {
        const signal = this.listeners.signal;
        element('startButton').addEventListener('click', () => this.startRun(), { signal });
        element('resumeButton').addEventListener('click', () => this.resume(), { signal });
        element('restartButton').addEventListener('click', () => this.startRun(), { signal });
        element('againButton').addEventListener('click', () => this.startRun(), { signal });

        document.addEventListener('pointerlockchange', () => {
            const locked = document.pointerLockElement === this.world?.canvas;
            if (!locked && this.active) this.pause();
            else if (locked && this.state === GameState.Paused) this.continueRun();
        }, { signal });
        document.addEventListener('pointerlockerror', () => {
            this.ui.pauseNote.textContent = 'Click Resume again to lock the mouse.';
        }, { signal });
        document.addEventListener('visibilitychange', () => { if (document.hidden && this.active) this.pause(); }, { signal });

        document.addEventListener('mousemove', event => {
            if (this.active && document.pointerLockElement) this.world?.look(event.movementX, event.movementY, PLAYER.lookSensitivity);
        }, { signal });
        document.addEventListener('mousedown', event => {
            if (!this.active || !document.pointerLockElement) return;
            if (event.button === 0) this.triggerHeld = true;
            if (event.button === 2) this.cancelDraw();
        }, { signal });
        document.addEventListener('mouseup', event => {
            if (event.button === 0) this.releaseTrigger();
        }, { signal });
        document.addEventListener('contextmenu', event => { if (this.active) event.preventDefault(); }, { signal });

        document.addEventListener('keydown', event => {
            if (event.code === 'KeyP' && this.active) {
                document.exitPointerLock();
                this.pause();
                return;
            }
            if (MOVE_KEYS[event.code]) {
                this.keys.add(event.code);
                if (this.active) event.preventDefault();
            }
        }, { signal });
        document.addEventListener('keyup', event => this.keys.delete(event.code), { signal });
        window.addEventListener('blur', () => this.keys.clear(), { signal });

        // Touch: drag anywhere to look, hold the draw button to pull and release to loose.
        this.stage.addEventListener('pointerdown', event => {
            if (event.pointerType !== 'touch' || !this.active || event.target === this.ui.touchDraw) return;
            this.touchLook = { id: event.pointerId, x: event.clientX, y: event.clientY };
        }, { signal });
        this.stage.addEventListener('pointermove', event => {
            if (!this.touchLook || event.pointerId !== this.touchLook.id) return;
            this.world?.look(event.clientX - this.touchLook.x, event.clientY - this.touchLook.y, PLAYER.touchLookSensitivity);
            this.touchLook.x = event.clientX;
            this.touchLook.y = event.clientY;
        }, { signal });
        this.stage.addEventListener('click', () => {
            if (this.active && !document.pointerLockElement) this.requestLock();
        }, { signal });
        const endTouch = (event: PointerEvent) => { if (this.touchLook?.id === event.pointerId) this.touchLook = null; };
        this.stage.addEventListener('pointerup', endTouch, { signal });
        this.stage.addEventListener('pointercancel', endTouch, { signal });
        this.ui.touchDraw.addEventListener('pointerdown', event => {
            event.preventDefault();
            if (this.active) this.triggerHeld = true;
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
        if (!canvas || matchMedia('(pointer: coarse)').matches) return;
        try {
            const request = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
            request?.catch?.(() => { this.ui.pauseNote.textContent = 'Click Resume again to lock the mouse.'; });
        } catch {
            this.ui.pauseNote.textContent = 'Click Resume again to lock the mouse.';
        }
    }

    private startRun(): void {
        if (!this.world) return;
        this.audio.unlock();
        this.world.reset();
        this.gate = GATE.health;
        this.cancelDraw();
        this.nockTimer = 0;
        this.accumulator = 0;
        this.startWave(1);
        this.requestLock();
    }

    private startWave(wave: number): void {
        this.wave = wave;
        this.spec = waveSpec(wave, GOBLIN);
        this.toSpawn = this.spec.count;
        this.spawnTimer = 0.6;
        if (wave > this.best) {
            this.best = wave;
            try { localStorage.setItem(BEST_WAVE_KEY, String(wave)); } catch { /* storage may be unavailable */ }
        }
        this.setState(GameState.Playing);
        this.showBanner(`Wave ${wave}`, 2.2);
        this.audio.waveStart();
    }

    private pause(): void {
        if (!this.active) return;
        this.resumeState = this.state === GameState.WaveBreak ? GameState.WaveBreak : GameState.Playing;
        this.cancelDraw();
        this.keys.clear();
        this.touchLook = null;
        this.ui.pauseNote.textContent = '';
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
    }

    private gameOver(): void {
        this.cancelDraw();
        this.setState(GameState.GameOver);
        this.ui.finalWave.textContent = String(this.wave);
        this.ui.finalBest.textContent = String(this.best);
        this.showBanner('', 0);
        this.audio.gameOver();
        if (document.pointerLockElement) document.exitPointerLock();
    }

    private releaseTrigger(): void {
        this.triggerHeld = false;
        if (!this.drawing || !this.world) return;
        const draw = drawFraction(this.drawHeld);
        this.world.fire(arrowSpeed(draw), arrowDamage(draw));
        this.audio.shot(draw);
        this.drawing = false;
        this.drawHeld = 0;
        this.nockTimer = BOW.nockDelay;
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
        if (!this.world) return;

        if (this.active) {
            this.nockTimer = Math.max(0, this.nockTimer - dt);
            if (this.triggerHeld && !this.drawing && this.nocked) {
                this.drawing = true;
                this.drawHeld = 0;
            }
            if (this.drawing) this.drawHeld += dt;

            this.accumulator += dt;
            let steps = 0;
            while (this.accumulator >= SIM.step && steps < SIM.maxStepsPerFrame) {
                this.tick(SIM.step);
                this.accumulator -= SIM.step;
                steps++;
                if (!this.active) break;
            }
            if (steps === SIM.maxStepsPerFrame) this.accumulator = 0;
        }

        this.bannerTimer = Math.max(0, this.bannerTimer - dt);
        if (this.bannerTimer === 0 && this.state !== GameState.WaveBreak) this.showBanner('', 0);
        const draw = this.drawing ? drawFraction(this.drawHeld) : 0;
        this.ui.root.style.setProperty('--draw', draw.toFixed(3));
        this.world.render(dt, draw, this.nocked);
    }

    private tick(dt: number): void {
        const world = this.world;
        if (!world) return;
        const input = { forward: 0, right: 0 };
        for (const code of this.keys) {
            input.forward += MOVE_KEYS[code]?.forward ?? 0;
            input.right += MOVE_KEYS[code]?.right ?? 0;
        }
        world.move(input, walkSpeed(this.drawing), dt);

        if (this.state === GameState.Playing && this.toSpawn > 0) {
            this.spawnTimer -= dt;
            if (this.spawnTimer <= 0) {
                world.spawnGoblin(this.spec);
                this.toSpawn--;
                this.spawnTimer = this.spec.spawnGap;
            }
        }

        this.applyReport(world.step(dt), dt);
        if (!this.active) return;

        if (this.state === GameState.Playing && this.toSpawn === 0 && world.aliveCount === 0) {
            this.breakTimer = WAVES.breakSeconds;
            this.setState(GameState.WaveBreak);
        }
        if (this.state === GameState.WaveBreak) {
            this.breakTimer -= dt;
            if (this.breakTimer <= 0) this.startWave(this.wave + 1);
            else this.showBanner(`Wave ${this.wave + 1} in ${Math.ceil(this.breakTimer)}`, 0);
        }
        this.updateHud();
    }

    private applyReport(report: StepReport, dt: number): void {
        const probe = (window as unknown as { __probe?: { hits: number; kills: number; sticks: number } }).__probe ??= { hits: 0, kills: 0, sticks: 0 };
        probe.hits += report.hits; probe.kills += report.kills; probe.sticks += report.sticks;
        if (report.hits > report.kills) this.audio.hit();
        if (report.kills > 0) this.audio.death();
        if (report.sticks > 0) this.audio.stick();
        if (report.strikeRates.length === 0) return;
        this.gate = gateAfterStrikes(this.gate, report.strikeRates, dt);
        this.world?.setGateHealth(this.gate / GATE.health);
        this.audio.gateHit();
        if (this.gate <= 0) {
            this.updateHud();
            this.gameOver();
        }
    }

    private updateHud(): void {
        if (this.shown.wave !== this.wave) {
            this.shown.wave = this.wave;
            this.ui.wave.textContent = String(this.wave);
        }
        const gate = Math.ceil((this.gate / GATE.health) * 100);
        if (this.shown.gate !== gate) {
            this.shown.gate = gate;
            this.ui.gatePercent.textContent = `${gate}%`;
            this.ui.gateFill.style.setProperty('--gate', String(gate / 100));
            this.ui.root.classList.toggle('is-gate-low', gate <= 30);
        }
    }

    private showBanner(text: string, seconds: number): void {
        if (seconds > 0) this.bannerTimer = seconds;
        if (this.shown.banner === text) return;
        this.shown.banner = text;
        this.ui.banner.textContent = text;
        this.ui.banner.hidden = text === '';
    }
}

void new DefenderGame().init();
