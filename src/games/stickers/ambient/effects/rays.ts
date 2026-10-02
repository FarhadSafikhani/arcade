import { randomBetween } from '../sampling';
import type { EffectDefinition, Range } from '../types';

export interface RayBeam {
    /** Degrees from straight down; positive leans left. */
    angle: number;
    /** Beam width in degrees. */
    spread: number;
    /** Peak opacity. */
    alpha: number;
}

export interface RaysSpec {
    type: 'rays';
    /** Light source in page percent; may sit outside the page. */
    origin: readonly [x: number, y: number];
    beams: readonly RayBeam[];
    /** Percent of the distance to the far corner at which the light has faded out. */
    reach?: number;
    /** Degrees each beam sways to either side. */
    sway?: number;
    /** Seconds per sway. */
    period?: Range;
    color?: string;
}

// Each beam layer extends this far (page percent) past every edge so swaying never shows a cut edge.
const OVERSCAN = 15;

export const rays: EffectDefinition<RaysSpec> = {
    renderer: 'css',
    create(spec, context) {
        const color = spec.color ?? '#fff1c1';
        const reach = spec.reach ?? 85;
        const sway = spec.sway ?? 1.5;
        const period = spec.period ?? [18, 30];
        const size = 100 + OVERSCAN * 2;
        const x = (spec.origin[0] + OVERSCAN) / size * 100;
        const y = (spec.origin[1] + OVERSCAN) / size * 100;
        const group = document.createElement('div');
        group.className = 'ambient-glow';
        for (const beam of spec.beams) {
            const half = beam.spread / 2;
            const ray = document.createElement('span');
            ray.className = 'ambient-ray';
            ray.style.cssText = [
                `inset:-${OVERSCAN}%`,
                `transform-origin:${x}% ${y}%`,
                `background:conic-gradient(from ${180 + beam.angle - half}deg at ${x}% ${y}%, transparent 0deg, ${color} ${half}deg, transparent ${beam.spread}deg)`,
                `--peak:${beam.alpha}`,
                `--sway:${sway}deg`,
                `--period:${randomBetween(period)}s`,
                `--delay:${-randomBetween([0, period[1]])}s`,
            ].join(';');
            const fade = `radial-gradient(circle at ${x}% ${y}%, #000 ${reach * 0.2}%, transparent ${reach}%)`;
            ray.style.setProperty('mask-image', fade);
            ray.style.setProperty('-webkit-mask-image', fade);
            group.appendChild(ray);
        }
        context.dom.appendChild(group);
        return { destroy: () => group.remove() };
    },
};
