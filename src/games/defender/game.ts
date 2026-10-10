import { applyCard, cardView, combatMods, dealCards, emptyBuild, emptyMods, RunBuild, spellCooldown, spellName, type CardId, type CombatMods, type ShotProfile, type SpellId } from './cards';
import { DefenderAudio } from './audio';
import { arrowDamage, arrowSpeed, drawFraction, gateAfterStrikes, grantXp, readBestWave, scaleEnemy, spawnList, walkSpeed, xpToAdvance, type WaveSpec, waveSpec } from './rules';
import { BEST_WAVE_KEY, BOW, ENEMIES, GATE, GOBLIN, PLAYER, SIM, SPELL, WAVES, type EnemyId } from './tuning';
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
        level: element<HTMLElement>('levelLabel'),
        xpFill: element<HTMLElement>('xpFill'),
        gatePercent: element<HTMLElement>('gatePercent'),
        gateFill: element<HTMLElement>('gateFill'),
        banner: element<HTMLElement>('banner'),
        spells: element<HTMLElement>('spellBar'),
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
        cards: element<HTMLElement>('cardScreen'),
        cardNote: element<HTMLElement>('cardNote'),
        cardChoices: element<HTMLElement>('cardChoices'),
    };
    private wave = 0;
    private spec: WaveSpec = waveSpec(1, GOBLIN);
    private queue: EnemyId[] = [];
    private toSpawn = 0;
    private spawnTimer = 0;
    private breakTimer = 0;
    private gate = GATE.health;
    private gateMax = GATE.health;
    private best = readBestWave(localStorage, BEST_WAVE_KEY);
    private triggerHeld = false;
    private drawing = false;
    private drawHeld = 0;
    private nockTimer = 0;
    private accumulator = 0;
    private lastFrame = 0;
    private frameId = 0;
    private touchLook: { id: number; x: number; y: number } | null = null;
    private shown = { wave: -1, gate: -1, banner: '', level: -1, xp: -1 };
    private bannerTimer = 0;
    private build: RunBuild = emptyBuild();
    private mods: CombatMods = emptyMods();
    private xp = 0;
    private level = 1;
    private pending = 0;
    private choosing = false;
    private suppressPause = false;
    private offer: CardId[] = [];
    private readonly seen = new Set<EnemyId>();
    private readonly cooldowns: Partial<Record<SpellId, number>> = {};
    private spellButtons: HTMLButtonElement[] = [];

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
            if (this.active && document.pointerLockElement) this.world?.look(event.movementX, event.movementY, PLAYER.lookSensitivity);
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
            if (event.code === 'KeyP' && this.active) {
                document.exitPointerLock();
                this.pause();
                return;
            }
            if (this.choosing && event.code in CARD_KEYS) {
                event.preventDefault();
                this.pickIndex(CARD_KEYS[event.code]);
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
            this.world?.look(event.clientX - this.touchLook.x, event.clientY - this.touchLook.y, PLAYER.touchLookSensitivity);
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

    private startRun(): void {
        if (!this.world) return;
        this.audio.unlock();
        this.world.reset();
        this.build = emptyBuild();
        this.mods = emptyMods();
        this.world.setMods(this.mods);
        this.xp = 0;
        this.level = 1;
        this.pending = 0;
        this.choosing = false;
        this.offer = [];
        this.seen.clear();
        for (const id of Object.keys(this.cooldowns) as SpellId[]) delete this.cooldowns[id];
        this.refreshSpells();
        this.ui.cards.hidden = true;
        this.gate = GATE.health;
        this.gateMax = GATE.health;
        this.shown.level = -1;
        this.shown.xp = -1;
        this.cancelDraw();
        this.nockTimer = 0;
        this.accumulator = 0;
        this.startWave(1);
        this.requestLock();
    }

    private startWave(wave: number): void {
        this.wave = wave;
        this.spec = waveSpec(wave, GOBLIN);
        this.queue = spawnList(wave);
        this.toSpawn = this.queue.length;
        this.spawnTimer = 0.6;
        if (wave > this.best) {
            this.best = wave;
            try { localStorage.setItem(BEST_WAVE_KEY, String(wave)); } catch { /* storage may be unavailable */ }
        }
        const fresh = this.queue.find(id => id !== 'goblin' && !this.seen.has(id));
        for (const id of this.queue) this.seen.add(id);
        this.setState(GameState.Playing);
        this.showBanner(fresh && THREAT[fresh] ? THREAT[fresh] : `Wave ${wave}`, 2.4);
        this.audio.waveStart();
    }

    private pause(): void {
        if (!this.active) return;
        this.resumeState = this.state === GameState.WaveBreak ? GameState.WaveBreak : GameState.Playing;
        this.cancelDraw();
        this.keys.clear();
        this.touchLook = null;
        this.ui.pauseNote.textContent = '';
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

    private gameOver(): void {
        this.cancelDraw();
        this.choosing = false;
        this.ui.cards.hidden = true;
        this.setState(GameState.GameOver);
        this.ui.finalWave.textContent = String(this.wave);
        this.ui.finalBest.textContent = String(this.best);
        this.showBanner('', 0);
        this.audio.gameOver();
        if (document.pointerLockElement) document.exitPointerLock();
    }

    private releaseTrigger(): void {
        this.triggerHeld = false;
        if (!this.drawing || !this.world || this.choosing) return;
        const draw = drawFraction(this.drawHeld, BOW.drawTime * this.mods.drawTime);
        const profile = this.looseProfile(draw);
        this.world.fire(profile, 0);
        const extras = (Math.random() < this.mods.twinChance ? 1 : 0) + (this.world.barrageLeft > 0 ? SPELL.barrage.extra : 0);
        for (let index = 0; index < extras; index++) {
            const sign = index % 2 === 0 ? 1 : -1;
            const step = Math.ceil((index + 1) / 2);
            this.world.fire(profile, sign * step * 0.08);
        }
        this.audio.shot(draw);
        this.drawing = false;
        this.drawHeld = 0;
        this.nockTimer = BOW.nockDelay * this.mods.nock;
    }

    private looseProfile(draw: number): ShotProfile {
        const mods = this.mods;
        return {
            damage: arrowDamage(draw) * mods.damage,
            speed: arrowSpeed(draw) * mods.arrowSpeed,
            pierce: Math.random() < mods.pierceChance ? 1 : 0,
            ignoreShield: Math.random() < mods.shieldBreak,
            explode: 0,
            burn: mods.burn,
            slow: mods.slow,
            chain: 0,
            knockback: mods.knockback,
            aura: 0,
            vs: mods.vs,
            critChance: mods.critChance,
            critMul: mods.critMul,
        };
    }

    private trySpell(slot: number): void {
        if (!this.world || !this.active || this.choosing || this.state !== GameState.Playing) return;
        const id = this.build.spells[slot];
        if (!id || (this.cooldowns[id] ?? 0) > 0) return;
        const result = this.world.cast(id);
        this.cooldowns[id] = spellCooldown(id, this.build);
        if (result.heal > 0) this.gate = Math.min(this.gateMax, this.gate + result.heal);
        this.audio.spell();
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
            if (this.triggerHeld && !this.drawing && this.nocked && !this.choosing) {
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
            this.paintSpells();
        }

        this.bannerTimer = Math.max(0, this.bannerTimer - dt);
        if (this.bannerTimer === 0 && this.state !== GameState.WaveBreak && !this.choosing) this.showBanner('', 0);
        const draw = this.drawing ? drawFraction(this.drawHeld, BOW.drawTime * this.mods.drawTime) : 0;
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
        const pace = walkSpeed(this.drawing) * (this.drawing ? this.mods.drawMove : 1);
        world.move(input, pace, dt);
        for (const id of this.build.spells) {
            const left = this.cooldowns[id] ?? 0;
            if (left > 0) this.cooldowns[id] = Math.max(0, left - dt);
        }

        if (this.state === GameState.Playing && this.toSpawn > 0) {
            this.spawnTimer -= dt;
            if (this.spawnTimer <= 0) {
                const id = this.queue.shift();
                if (id) world.spawnEnemy(scaleEnemy(ENEMIES[id], this.wave));
                this.toSpawn = this.queue.length;
                this.spawnTimer = this.spec.spawnGap;
            }
        }

        this.applyReport(world.step(dt), dt);
        if (!this.active) return;

        if (this.state === GameState.Playing && this.toSpawn === 0 && world.aliveCount === 0) {
            this.breakTimer = WAVES.breakSeconds;
            this.setState(GameState.WaveBreak);
            if (this.pending > 0) this.openCards();
        }
        if (this.state === GameState.WaveBreak && !this.choosing) {
            this.breakTimer -= dt;
            if (this.breakTimer <= 0) this.startWave(this.wave + 1);
            else this.showBanner(`Wave ${this.wave + 1} in ${Math.ceil(this.breakTimer)}`, 0);
        }
        this.updateHud();
    }

    private applyReport(report: StepReport, dt: number): void {
        const probe = (window as unknown as { __probe?: { hits: number; kills: number; sticks: number } }).__probe ??= { hits: 0, kills: 0, sticks: 0 };
        probe.hits += report.hits; probe.kills += report.kills; probe.sticks += report.sticks;
        if (report.blocks > 0) this.audio.blocked();
        if (report.hits > report.kills) this.audio.hit();
        if (report.kills > 0) this.audio.death();
        if (report.sticks > 0) this.audio.stick();
        if (report.xp > 0) this.gainXp(report.xp * this.mods.xpGain);
        const taken = this.mods.gateTaken;
        let struck = false;
        if (report.strikeRates.length > 0) {
            this.gate = gateAfterStrikes(this.gate, report.strikeRates.map(rate => rate * taken), dt);
            struck = true;
        }
        if (report.gateDamage > 0) {
            this.gate = Math.max(0, this.gate - report.gateDamage * taken);
            struck = true;
        }
        if (struck) {
            this.world?.setGateHealth(this.gate / this.gateMax);
            this.audio.gateHit();
            if (this.gate <= 0) {
                this.updateHud();
                this.gameOver();
            }
        }
    }

    private gainXp(amount: number): void {
        const granted = grantXp(this.xp, this.level, amount);
        this.xp = granted.xp;
        this.level = granted.level;
        if (granted.gainedLevels <= 0) return;
        this.pending += granted.gainedLevels;
        this.audio.level();
        if (!this.choosing && this.bannerTimer <= 0) this.showBanner('Level up', 1.2);
    }

    private openCards(): void {
        if (this.choosing) return;
        this.choosing = true;
        this.cancelDraw();
        if (document.pointerLockElement) {
            this.suppressPause = true;
            document.exitPointerLock();
        }
        this.showBanner('', 0);
        this.renderCards();
    }

    private renderCards(): void {
        this.offer = dealCards(Math.random, this.build);
        this.ui.cardChoices.replaceChildren();
        if (this.offer.length === 0) {
            this.pending = 0;
            this.gate = Math.min(this.gateMax, this.gate + 12);
            this.closeCards();
            return;
        }
        this.ui.cardNote.textContent = this.pending > 1
            ? `${this.pending} upgrades waiting. Keys 1 to 3.`
            : 'Keys 1 to 3.';
        this.offer.forEach((id, index) => {
            const view = cardView(id, this.build);
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
                this.pickIndex(index);
            });
            this.ui.cardChoices.append(button);
        });
        this.ui.cards.hidden = false;
    }

    private pickIndex(index: number): void {
        const id = this.offer[index];
        if (!this.choosing || !id) return;
        const before = this.gateMax;
        applyCard(this.build, id);
        this.mods = combatMods(this.build);
        this.world?.setMods(this.mods);
        this.gateMax = GATE.health + this.mods.gateBonus;
        this.gate = Math.min(this.gateMax, this.gate + Math.max(0, this.gateMax - before));
        this.world?.setGateHealth(this.gate / this.gateMax);
        this.pending = Math.max(0, this.pending - 1);
        this.refreshSpells();
        this.audio.level();
        if (this.pending > 0) this.renderCards();
        else this.closeCards();
    }

    private closeCards(): void {
        this.choosing = false;
        this.offer = [];
        this.ui.cards.hidden = true;
        this.requestLock();
    }

    private refreshSpells(): void {
        this.ui.spells.replaceChildren();
        this.spellButtons = [];
        this.build.spells.forEach((id, index) => {
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
            name.textContent = spellName(id);
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
        this.ui.spells.hidden = this.build.spells.length === 0;
    }

    private paintSpells(): void {
        this.build.spells.forEach((id, index) => {
            const button = this.spellButtons[index];
            if (!button) return;
            const max = spellCooldown(id, this.build);
            const left = this.cooldowns[id] ?? 0;
            button.style.setProperty('--cool', max > 0 ? String(clamp01(left / max)) : '0');
            const time = button.querySelector('.spell-time');
            if (time) time.textContent = left > 0.05 ? left.toFixed(1) : '';
        });
    }

    private updateHud(): void {
        if (this.shown.wave !== this.wave) {
            this.shown.wave = this.wave;
            this.ui.wave.textContent = String(this.wave);
        }
        const need = xpToAdvance(this.level);
        const xpMark = this.level * 1000 + Math.floor(this.xp);
        if (this.shown.level !== this.level || this.shown.xp !== xpMark) {
            this.shown.level = this.level;
            this.shown.xp = xpMark;
            this.ui.level.textContent = `Lv ${this.level}`;
            this.ui.xpFill.style.setProperty('--xp', need > 0 ? String(this.xp / need) : '0');
        }
        const gate = Math.ceil((this.gate / this.gateMax) * 100);
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

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

void new DefenderGame().init();
