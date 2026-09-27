import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { compileRecipe } from './snapforge-compiler.mjs';

const args = process.argv.slice(2), check = args.includes('--check');
const paths = args.filter(arg => arg !== '--check');
try {
    if (paths.length < 1 || paths.length > 2 || paths.some(path => path.startsWith('--')))
        throw new Error('Usage: node scripts/compile-snapforge.mjs <recipe.json> [output.json] [--check]');
    const recipe = JSON.parse(readFileSync(resolve(paths[0]), 'utf8'));
    const output = paths[1] ? resolve(paths[1]) : resolve('src/games/snapforge/levels', `${recipe.id}.json`);
    if (!/^[a-z0-9-]+$/.test(recipe.id)) throw new Error('Recipe id must be a lowercase slug');
    if (resolve(paths[0]) === output) throw new Error('Output cannot overwrite the source recipe');
    const previous = existsSync(output) ? JSON.parse(readFileSync(output, 'utf8')) : undefined;
    const { level, report } = compileRecipe(recipe, previous);
    console.log(JSON.stringify(report, null, 2));
    if (!report.withinBudget) throw new Error('Outside N ±2: revise meaningful shape/detail; do not split bricks to pad the count');
    if (check) {
        if (!previous || !isDeepStrictEqual(previous, level)) throw new Error('Generated level is missing or stale; run without --check');
        console.log(`Current: ${output}`);
    } else {
        writeFileSync(output, JSON.stringify(level, null, 2) + '\n');
        console.log(`Generated: ${output}`);
    }
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
