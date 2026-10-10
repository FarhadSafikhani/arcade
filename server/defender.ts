import http from 'node:http';
import { defineRoom, defineServer } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { DefenderRoom } from './defender-room';
import { NET } from '../src/games/defender/tuning';

/**
 * Defender co-op backend. Follows the RareCandy game-host contract: listen on
 * HOST:PORT, answer /healthz, take WebSockets only at /ws and HTTP under /ws/.
 *
 * Colyseus wants matchmaking at /matchmake/... and sockets at /<process>/<room>.
 * The client puts both under /ws (see net/link.ts), and this file strips that
 * prefix back off before Colyseus sees the request.
 */

const port = Number(process.env.PORT ?? NET.port);
const host = process.env.HOST ?? '0.0.0.0';
const httpServer = http.createServer();
let ready = false;

const server = defineServer({
    transport: new WebSocketTransport({ server: httpServer }),
    rooms: { [NET.roomName]: defineRoom(DefenderRoom) },
    greet: false,
});

/** `/ws/matchmake/x` → `/matchmake/x`; `/ws?room=p/r&k=v` → `/p/r?k=v`. */
export function backendUrl(url: string, upgrade: boolean): string {
    const parsed = new URL(url, 'http://local');
    if (upgrade) {
        const room = parsed.searchParams.get('room');
        if (parsed.pathname !== '/ws' || !room) return url;
        parsed.searchParams.delete('room');
        return `/${room}${parsed.search}`;
    }
    if (parsed.pathname === '/ws' || parsed.pathname.startsWith('/ws/')) {
        return `${parsed.pathname.slice(3) || '/'}${parsed.search}`;
    }
    return url;
}

/** Runs ahead of every listener Colyseus attached, so it sees the rewritten URL. */
function intercept(event: 'request' | 'upgrade'): void {
    const listeners = httpServer.listeners(event) as ((...args: unknown[]) => void)[];
    httpServer.removeAllListeners(event);
    httpServer.on(event, (req: http.IncomingMessage, ...rest: unknown[]) => {
        if (event === 'request' && req.url === '/healthz') {
            const res = rest[0] as http.ServerResponse;
            res.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: ready }));
            return;
        }
        req.url = backendUrl(req.url ?? '/', event === 'upgrade');
        for (const listener of listeners) listener.call(httpServer, req, ...rest);
    });
}

await server.listen(port, host);
intercept('request');
intercept('upgrade');
ready = true;
console.log(`[defender] co-op server on ${host}:${port}`);
