import type { Container } from 'pixi.js';

export type Range = readonly [min: number, max: number];

/** Polygon in page percent (0-100), the same space stickers are placed in. */
export type Region = readonly (readonly [x: number, y: number])[];

export interface AmbientContext {
    /** Overlay element for DOM effects; carries the `--ambient-intensity` custom property. */
    readonly dom: HTMLElement;
    /** Only available to effects whose definition uses the `pixi` renderer. */
    readonly stage: Container;
    readonly width: number;
    readonly height: number;
    /** Global strength multiplier, 0-2. Pixi effects read it every frame. */
    readonly intensity: number;
}

export interface AmbientEffect {
    update?(seconds: number): void;
    destroy(): void;
}

export interface EffectDefinition<Spec> {
    readonly renderer: 'pixi' | 'css';
    create(spec: Spec, context: AmbientContext): AmbientEffect;
}
