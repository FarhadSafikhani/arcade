/**
 * Co-op smoke test: two archers join one room through the same /ws routing the
 * game host uses, start a run, and shoot down the bridge until goblins fall.
 * Run against a live server: `npm run server`, then `npx tsx scripts/smoke-defender-coop.ts`.
 */
import { Client } from '@colyseus/sdk';
import { DefenderState } from '../src/games/defender/net/schema';

const endpoint = process.env.DEFENDER_ENDPOINT ?? 'http://localhost:2567/ws';

function routeThroughWs(url: URL): string {
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return url.href;
    const match = url.pathname.match(/^(.*\/ws)\/([^/]+\/[^/]+)$/);
    if (!match) return url.href;
    url.pathname = match[1];
    url.searchParams.set('room', match[2]);
    return url.href;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const client = () => new Client(endpoint, { urlBuilder: routeThroughWs });

const first = await client().joinOrCreate('defender', { name: 'Ada' }, DefenderState);
first.onMessage('fx', () => undefined);
const second = await client().joinById(first.roomId, { name: 'Bo' }, DefenderState);
let fx = 0;
second.onMessage('fx', (batch: unknown[]) => { fx += batch.length; });
await wait(300);
console.log('room', first.roomId, 'players', second.state.players.size, 'phase', second.state.phase);
if (second.state.players.size !== 2) throw new Error('both archers should be in the room');

first.send('start', {});
await wait(1500);
console.log('phase', second.state.phase, 'wave', second.state.wave, 'enemies', second.state.enemies.size);
if (second.state.phase !== 'playing') throw new Error('run should be playing');

// Look straight down the bridge, slightly down, and loose full draws until something dies.
let seq = 0;
let arrowsSeen = 0;
let killed = false;
const start = Date.now();
while (Date.now() - start < 25000 && !killed) {
    for (const room of [first, second]) {
        const me = room.state.players.get(room.sessionId)!;
        let target: { x: number; z: number } | null = null;
        room.state.enemies.forEach(enemy => { if (enemy.mode !== 'dying' && (!target || enemy.z > target.z)) target = enemy; });
        if (!target) continue;
        const t = target as { x: number; z: number };
        const eyeY = 6.6;
        const dx = t.x - me.x;
        const dz = t.z - me.z;
        const flat = Math.hypot(dx, dz);
        const yaw = Math.atan2(-dx, -dz);
        const pitch = Math.atan2(0.7 - eyeY, flat) + flat * 0.002;
        room.send('pose', { x: me.x, z: me.z, yaw, pitch, draw: 1 });
        room.send('loose', { draw: 1, yaw, pitch, x: me.x, z: me.z, seq: ++seq });
    }
    await wait(1000);
    arrowsSeen = Math.max(arrowsSeen, second.state.arrows.size);
    second.state.players.forEach(player => { if (player.xp > 0 || player.level > 1) killed = true; });
}
const mine = second.state.players.get(second.sessionId)!;
console.log('arrows seen', arrowsSeen, 'fx events', fx, 'bo level', mine.level, 'xp', mine.xp.toFixed(1), 'gate', second.state.gate.toFixed(1));
await first.leave();
await second.leave();
if (!killed) throw new Error('no foe fell to the archers');
console.log('co-op smoke passed');
process.exit(0);
