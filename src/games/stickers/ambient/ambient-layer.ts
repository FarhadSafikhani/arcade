import { Application, Container, Ticker } from 'pixi.js';
import { effectDefinition, EffectSpec } from './effects';
import type { AmbientContext, AmbientEffect } from './types';

/** Fixed at the former ambient slider's maximum. */
const AMBIENT_INTENSITY = 2;

/**
 * Plays a scene's ambient effects over its painting. One transparent Pixi canvas
 * (created only for scenes that need it) and one DOM overlay are reused across
 * page renders; both sit in the slot by DOM order and never take pointer input.
 */
export class AmbientLayer {
    private readonly dom = document.createElement('div');
    private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    private readonly context: AmbientContext;
    private pixi: Promise<Application | null> | null = null;
    private app: Application | null = null;
    private effects: AmbientEffect[] = [];
    private observer: ResizeObserver | null = null;
    private attachment = 0;
    private destroyed = false;
    private width = 0;
    private height = 0;

    private readonly tick = (ticker: Ticker): void => {
        const seconds = ticker.deltaMS / 1000;
        for (const effect of this.effects) effect.update?.(seconds);
    };

    constructor() {
        this.dom.className = 'ambient-css';
        this.dom.style.setProperty('--ambient-intensity', String(AMBIENT_INTENSITY));
        const layer = this;
        this.context = {
            dom: this.dom,
            get stage(): Container {
                if (!layer.app) throw new Error('Ambient Pixi layer is not initialised');
                return layer.app.stage;
            },
            get width() { return layer.width; },
            get height() { return layer.height; },
            intensity: AMBIENT_INTENSITY,
        };
    }

    async attach(slot: HTMLElement, specs: readonly EffectSpec[]): Promise<void> {
        this.detach();
        const attachment = this.attachment;
        if (this.reducedMotion.matches || specs.length === 0) return;
        const app = specs.some(spec => effectDefinition(spec).renderer === 'pixi') ? await this.ensurePixi() : null;
        if (attachment !== this.attachment) return;

        this.resize(slot.clientWidth, slot.clientHeight);
        this.observer = new ResizeObserver(([entry]) => this.resize(entry.contentRect.width, entry.contentRect.height));
        this.observer.observe(slot);
        for (const spec of specs) {
            const definition = effectDefinition(spec);
            if (definition.renderer === 'pixi' && !app) continue;
            try {
                this.effects.push(definition.create(spec, this.context));
            } catch (error) {
                console.warn(`Ambient effect "${spec.type}" failed to start`, error);
            }
        }
        if (app) {
            slot.appendChild(app.canvas);
            app.ticker.add(this.tick);
            app.start();
        }
        slot.appendChild(this.dom);
    }

    detach(): void {
        this.attachment++;
        this.observer?.disconnect();
        this.observer = null;
        if (this.app) {
            this.app.stop();
            this.app.ticker.remove(this.tick);
            this.app.canvas.remove();
        }
        for (const effect of this.effects) effect.destroy();
        this.effects = [];
        this.dom.remove();
    }

    destroy(): void {
        this.detach();
        this.destroyed = true;
        this.app?.destroy({ removeView: true }, { children: true });
        this.app = null;
        this.pixi = null;
    }

    private ensurePixi(): Promise<Application | null> {
        this.pixi ??= (async () => {
            const app = new Application();
            try {
                await app.init({
                    width: Math.max(1, this.width),
                    height: Math.max(1, this.height),
                    backgroundAlpha: 0,
                    antialias: true,
                    autoStart: false,
                    resolution: Math.min(window.devicePixelRatio || 1, 2),
                    preference: 'webgl',
                });
            } catch (error) {
                console.warn('Ambient Pixi layer unavailable; showing DOM effects only', error);
                return null;
            }
            if (this.destroyed) {
                app.destroy({ removeView: true }, { children: true });
                return null;
            }
            app.canvas.className = 'ambient-canvas';
            this.app = app;
            return app;
        })();
        return this.pixi;
    }

    private resize(width: number, height: number): void {
        this.width = width;
        this.height = height;
        this.app?.renderer.resize(Math.max(1, width), Math.max(1, height));
    }
}
