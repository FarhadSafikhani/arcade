import { Container, Sprite, Texture } from 'pixi.js';
import { depthScale, randomBetween, randomPointIn } from '../sampling';
import type { EffectDefinition, Range, Region } from '../types';

export interface GlintsSpec {
    type: 'glints';
    region: Region;
    count: number;
    /** Width at full sparkle, in percent of page width, before distant glints shrink. */
    size: Range;
    /** Seconds one sparkle lasts. */
    twinkle: Range;
    /** Seconds a glint stays dark before reappearing somewhere else. */
    rest: Range;
    color?: number;
    alpha?: number;
}

interface Glint {
    readonly sprite: Sprite;
    x: number;
    y: number;
    size: number;
    twinkle: number;
    time: number;
}

const TEXTURE_SIZE = 64;

/** Soft core with a long horizontal streak, like sun caught on moving water. */
function glintTexture(): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = TEXTURE_SIZE;
    const paint = canvas.getContext('2d');
    if (!paint) throw new Error('Unable to draw glint texture');
    const mid = TEXTURE_SIZE / 2;
    const core = paint.createRadialGradient(mid, mid, 0, mid, mid, mid * 0.4);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    paint.fillStyle = core;
    paint.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    for (const [horizontal, reach] of [[true, mid], [false, mid * 0.45]] as const) {
        const streak = horizontal
            ? paint.createLinearGradient(mid - reach, 0, mid + reach, 0)
            : paint.createLinearGradient(0, mid - reach, 0, mid + reach);
        streak.addColorStop(0, 'rgba(255,255,255,0)');
        streak.addColorStop(0.5, 'rgba(255,255,255,0.9)');
        streak.addColorStop(1, 'rgba(255,255,255,0)');
        paint.fillStyle = streak;
        if (horizontal) paint.fillRect(mid - reach, mid - 1, reach * 2, 2);
        else paint.fillRect(mid - 1, mid - reach, 2, reach * 2);
    }
    return Texture.from(canvas);
}

export const glints: EffectDefinition<GlintsSpec> = {
    renderer: 'pixi',
    create(spec, context) {
        const color = spec.color ?? 0xfffbe8;
        const alpha = spec.alpha ?? 0.6;
        const texture = glintTexture();
        const layer = context.stage.addChild(new Container());

        const relocate = (glint: Glint): void => {
            [glint.x, glint.y] = randomPointIn(spec.region);
            glint.size = randomBetween(spec.size) * depthScale(glint.y);
            glint.twinkle = randomBetween(spec.twinkle);
            glint.time = -randomBetween(spec.rest);
        };

        const all = Array.from({ length: spec.count }, (): Glint => {
            const sprite = layer.addChild(new Sprite(texture));
            sprite.anchor.set(0.5);
            sprite.blendMode = 'add';
            sprite.tint = color;
            sprite.visible = false;
            const glint: Glint = { sprite, x: 0, y: 0, size: 0, twinkle: 1, time: 0 };
            relocate(glint);
            // Start mid-cycle so the scene opens already shimmering.
            glint.time = randomBetween([-spec.rest[1], glint.twinkle]);
            return glint;
        });

        return {
            update(seconds) {
                for (const glint of all) {
                    glint.time += seconds;
                    if (glint.time >= glint.twinkle) relocate(glint);
                    const shine = glint.time > 0 ? Math.sin(Math.PI * glint.time / glint.twinkle) ** 3 : 0;
                    glint.sprite.visible = shine > 0;
                    if (!glint.sprite.visible) continue;
                    glint.sprite.alpha = alpha * context.intensity * shine;
                    glint.sprite.position.set(glint.x / 100 * context.width, glint.y / 100 * context.height);
                    glint.sprite.scale.set(glint.size / 100 * context.width * (0.55 + 0.45 * shine) / TEXTURE_SIZE);
                }
            },
            destroy() {
                layer.destroy({ children: true });
                texture.destroy(true);
            },
        };
    },
};
