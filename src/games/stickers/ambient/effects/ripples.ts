import { Container, Graphics } from 'pixi.js';
import { depthScale, randomBetween, randomPointIn } from '../sampling';
import type { EffectDefinition, Range, Region } from '../types';

export interface RipplesSpec {
    type: 'ripples';
    region: Region;
    /** Seconds between new ripples. */
    every: Range;
    /** Seconds one ripple takes to spread out and fade. */
    life: Range;
    /** Outer ring radius in percent of page width, before distant ripples shrink. */
    radius: Range;
    rings?: number;
    color?: number;
    alpha?: number;
}

interface Ripple {
    readonly graphics: Graphics;
    readonly x: number;
    readonly y: number;
    readonly life: number;
    readonly radius: number;
    age: number;
}

// Painted water is seen at a low angle, so rings read as flat ellipses.
const SQUASH = 0.3;
const RING_GAP = 0.16;

export const ripples: EffectDefinition<RipplesSpec> = {
    renderer: 'pixi',
    create(spec, context) {
        const rings = spec.rings ?? 3;
        const color = spec.color ?? 0xeafcff;
        const alpha = spec.alpha ?? 0.2;
        const layer = context.stage.addChild(new Container());
        const live: Ripple[] = [];
        const idle: Graphics[] = [];
        let wait = randomBetween([0, spec.every[0]]);

        const spawn = (): void => {
            const [x, y] = randomPointIn(spec.region);
            const graphics = idle.pop() ?? layer.addChild(new Graphics());
            graphics.visible = true;
            live.push({ graphics, x, y, age: 0, life: randomBetween(spec.life), radius: randomBetween(spec.radius) * depthScale(y) });
        };

        const draw = (ripple: Ripple, progress: number): void => {
            const cx = ripple.x / 100 * context.width;
            const cy = ripple.y / 100 * context.height;
            const maxRadius = ripple.radius / 100 * context.width;
            const fade = (1 - progress) ** 1.6 * alpha * context.intensity;
            const width = Math.max(0.75, 1.5 * depthScale(ripple.y));
            ripple.graphics.clear();
            for (let ring = 0; ring < rings; ring++) {
                const spread = progress - ring * RING_GAP;
                if (spread <= 0) break;
                const radius = maxRadius * (1 - (1 - spread) ** 2);
                ripple.graphics.ellipse(cx, cy, radius, radius * SQUASH)
                    .stroke({ width, color, alpha: fade * Math.min(1, spread * 6) * (1 - ring / rings) });
            }
        };

        return {
            update(seconds) {
                wait -= seconds;
                if (wait <= 0) {
                    spawn();
                    wait = randomBetween(spec.every);
                }
                for (let i = live.length - 1; i >= 0; i--) {
                    const ripple = live[i];
                    ripple.age += seconds;
                    const progress = ripple.age / ripple.life;
                    if (progress < 1) {
                        draw(ripple, progress);
                        continue;
                    }
                    ripple.graphics.clear();
                    ripple.graphics.visible = false;
                    idle.push(ripple.graphics);
                    live.splice(i, 1);
                }
            },
            destroy() {
                layer.destroy({ children: true });
            },
        };
    },
};
