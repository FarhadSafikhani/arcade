import { randomBetween, randomPointIn } from '../sampling';
import type { EffectDefinition, Range, Region } from '../types';

export interface MotesSpec {
    type: 'motes';
    region: Region;
    count: number;
    /** Diameter in CSS pixels. */
    size: Range;
    /** Pixels travelled over one life as [x range, y range]; negative y rises. */
    drift: readonly [x: Range, y: Range];
    /** Seconds per drift. */
    life: Range;
    color?: string;
    alpha?: number;
}

export const motes: EffectDefinition<MotesSpec> = {
    renderer: 'css',
    create(spec, context) {
        const color = spec.color ?? '#fff6d2';
        const alpha = spec.alpha ?? 0.5;
        const group = document.createElement('div');
        group.className = 'ambient-glow';
        for (let i = 0; i < spec.count; i++) {
            const [x, y] = randomPointIn(spec.region);
            const life = randomBetween(spec.life);
            const mote = document.createElement('span');
            mote.className = 'ambient-mote';
            mote.style.cssText = [
                `left:${x}%`,
                `top:${y}%`,
                `--size:${randomBetween(spec.size)}px`,
                `--dx:${randomBetween(spec.drift[0])}px`,
                `--dy:${randomBetween(spec.drift[1])}px`,
                `--color:${color}`,
                `--peak:${alpha}`,
                `--life:${life}s`,
                `--delay:${-randomBetween([0, life])}s`,
            ].join(';');
            group.appendChild(mote);
        }
        context.dom.appendChild(group);
        return { destroy: () => group.remove() };
    },
};
