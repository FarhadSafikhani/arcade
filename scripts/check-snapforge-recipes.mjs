import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const directory = new URL('../src/games/snapforge/recipes/', import.meta.url);
for (const file of readdirSync(directory).filter(name => name.endsWith('.json')).sort()) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./compile-snapforge.mjs', import.meta.url)),
        fileURLToPath(new URL(file, directory)), '--check'], { stdio: 'inherit' });
    if (result.error) console.error(result.error.message);
    if (result.status !== 0) process.exitCode = 1;
}
