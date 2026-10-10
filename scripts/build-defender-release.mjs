/**
 * Builds Defender as a RareCandy game-host release (https://rarecandy.ca/game-host/):
 *
 *   release/
 *     game.json            manifest with the co-op backend
 *     public/              the game page, assets pinned to /defender/releases/<id>/
 *     server/index.mjs     the Colyseus server, bundled with every dependency
 *
 * Usage: node scripts/build-defender-release.mjs [--release ID] [--output DIR]
 * Then publish from the rarecandy-games repo:
 *   node tools/publish-game.mjs --slug defender --directory <DIR>
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { build as viteBuild } from 'vite';
import { build as esbuild } from 'esbuild';

const SLUG = 'defender';
const NAME = 'Defender';
const ARCADE = 'https://farhadsafikhani.github.io/arcade/';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
    if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1]]);
    return pairs;
}, []));
const releaseId = args.release ?? `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${randomBytes(3).toString('hex')}`;
if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(releaseId)) throw new Error(`Bad release id: ${releaseId}`);
const output = path.resolve(args.output ?? path.join(root, 'releases', SLUG, releaseId));
try {
    await fs.access(output);
    throw new Error(`${output} already exists; releases are immutable`);
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}
const base = `/${SLUG}/releases/${releaseId}/`;
const staging = path.join(output, '.vite');

// Browser: just the Defender page, talking to the backend through the host's /defender/ws route.
process.env.VITE_DEFENDER_SERVER = `/${SLUG}/ws`;
await viteBuild({
    root,
    base,
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    plugins: [{
        name: 'defender-host-links',
        transformIndexHtml: html => html
            // The page lives at /defender/, outside the arcade, so arcade links leave the host.
            .replaceAll('href="/arcade/"', `href="${ARCADE}"`)
            .replaceAll('src="/assets/brand/defender.svg"', `src="${base}assets/brand/defender.svg"`),
    }],
    build: {
        outDir: staging,
        emptyOutDir: true,
        sourcemap: false,
        rollupOptions: { input: { defender: path.join(root, 'games', SLUG, 'index.html') } },
    },
});
const publicDir = path.join(output, 'public');
await fs.mkdir(path.join(publicDir, 'assets', 'brand'), { recursive: true });
await fs.cp(path.join(staging, 'assets'), path.join(publicDir, 'assets'), { recursive: true });
await fs.rename(path.join(staging, 'games', SLUG, 'index.html'), path.join(publicDir, 'index.html'));
await fs.copyFile(path.join(root, 'public', 'assets', 'brand', `${SLUG}.svg`), path.join(publicDir, 'assets', 'brand', `${SLUG}.svg`));
await fs.rm(staging, { recursive: true, force: true });

// Server: one self-contained ES module for Node 22 on Linux. Nothing native, so it runs anywhere.
await esbuild({
    entryPoints: [path.join(root, 'server', 'defender.ts')],
    outfile: path.join(output, 'server', 'index.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'warning',
    // Optional native speedups some dependencies try first; they fall back to plain JavaScript.
    external: ['bufferutil', 'utf-8-validate', 'uWebSockets.js'],
    banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});

await fs.writeFile(path.join(output, 'game.json'), JSON.stringify({
    schemaVersion: 1,
    slug: SLUG,
    name: NAME,
    releaseId,
    frontend: { directory: 'public', spaFallback: false },
    backend: { runtime: 'node', entrypoint: 'server/index.mjs', healthPath: '/healthz', drainTimeoutSeconds: 300 },
}, null, 2) + '\n');
console.log(`Release ready: ${output}`);
