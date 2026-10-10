/**
 * A bot archer for trying co-op alone. It joins a room (or opens one), starts the run
 * when asked, and shoots the foe nearest the gate once a second until stopped.
 *
 *   npx tsx scripts/bot-defender.ts                 # open a room and print its code
 *   npx tsx scripts/bot-defender.ts --room ABC123   # join your room
 *   npx tsx scripts/bot-defender.ts --start         # also open the gate
 *   npx tsx scripts/bot-defender.ts --levels 9      # skip ahead; needs a server with DEFENDER_CHEATS=1
 *
 * DEFENDER_ENDPOINT picks the server (default http://localhost:2567/ws).
 */
import { Client } from '@colyseus/sdk';
import { DefenderState } from '../src/games/defender/net/schema';

const args = process.argv.slice(2);
const roomId = args.includes('--room') ? args[args.indexOf('--room') + 1] : '';
const endpoint = process.env.DEFENDER_ENDPOINT ?? 'http://localhost:2567/ws';

function routeThroughWs(url: URL): string {
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return url.href;
    const match = url.pathname.match(/^(.*\/ws)\/([^/]+\/[^/]+)$/);
    if (!match) return url.href;
    url.pathname = match[1];
    url.searchParams.set('room', match[2]);
    return url.href;
}

const client = new Client(endpoint, { urlBuilder: routeThroughWs });
const room = roomId
    ? await client.joinById(roomId, { name: 'Bot' }, DefenderState)
    : await client.joinOrCreate('defender', { name: 'Bot' }, DefenderState);
room.onMessage('fx', () => undefined);
console.log(`room ${room.roomId}`);
await new Promise(resolve => setTimeout(resolve, 500));
if (args.includes('--start')) room.send('start', {});
// --levels N raises the team N levels, on a server started with DEFENDER_CHEATS=1.
if (args.includes('--levels')) setTimeout(() => room.send('cheat', { levels: Number(args[args.indexOf('--levels') + 1]) }), 1500);

let seq = 0;
setInterval(() => {
    const me = room.state.players.get(room.sessionId);
    if (!me) return;
    let target: { x: number; z: number } | null = null;
    room.state.enemies.forEach(enemy => { if (enemy.mode !== 'dying' && (!target || enemy.z > target.z)) target = enemy; });
    if (!target) return;
    const t = target as { x: number; z: number };
    const dx = t.x - me.x;
    const dz = t.z - me.z;
    const flat = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(0.7 - 6.6, flat) + flat * 0.002;
    room.send('pose', { x: me.x, z: me.z, yaw, pitch, draw: 1 });
    room.send('loose', { draw: 1, yaw, pitch, x: me.x, z: me.z, seq: ++seq });
}, 1000);
setInterval(() => console.log(`wave ${room.state.wave} level ${room.state.level} gate ${Math.round(room.state.gate)}`), 10000);
