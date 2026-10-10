/** Prints how the shared team levels across a run: `npx tsx scripts/xp-curve.ts`. */
import { grantXp, pointsAt, waveXp, xpToAdvance } from '../src/games/defender/rules';

let xp = 0;
let level = 1;
for (let wave = 1; wave <= 20; wave++) {
    const before = level;
    const got = grantXp(xp, level, waveXp(wave));
    xp = got.xp;
    level = got.level;
    console.log(`wave ${String(wave).padStart(2)} pays ${String(waveXp(wave)).padStart(3)}  level ${before} -> ${level}  `
        + `(${(level - before + xp / xpToAdvance(level)).toFixed(2)} levels banked)  points ${pointsAt(level)}`);
}
