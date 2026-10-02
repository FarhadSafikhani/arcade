import type { Range, Region } from './types';

export const randomBetween = ([min, max]: Range): number => min + Math.random() * (max - min);

/** Lower on the page reads as closer to the viewer, so things there are drawn larger. */
export const depthScale = (y: number): number => 0.35 + 0.65 * y / 100;

export function pointInRegion(region: Region, x: number, y: number): boolean {
    let inside = false;
    for (let i = 0, j = region.length - 1; i < region.length; j = i++) {
        const [xi, yi] = region[i];
        const [xj, yj] = region[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

export function randomPointIn(region: Region): [number, number] {
    const xs = region.map(([x]) => x);
    const ys = region.map(([, y]) => y);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    for (let attempt = 0; attempt < 64; attempt++) {
        const x = randomBetween([minX, maxX]);
        const y = randomBetween([minY, maxY]);
        if (pointInRegion(region, x, y)) return [x, y];
    }
    return [xs.reduce((a, b) => a + b, 0) / xs.length, ys.reduce((a, b) => a + b, 0) / ys.length];
}
