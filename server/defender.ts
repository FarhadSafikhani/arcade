import http from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { defineRoom, defineServer } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { DefenderRoom } from './defender-room';
import { NET } from '../src/games/defender/tuning';

/**
 * Defender co-op backend. Listens on HOST:PORT, answers /healthz, and takes
 * WebSockets only at /ws and HTTP under /ws/, which suits both its own Railway
 * service and the RareCandy game host's gateway.
 *
 * Colyseus wants matchmaking at /matchmake/... and sockets at /<process>/<room>.
 * The client puts both under /ws (see net/link.ts), and this file strips that
 * prefix back off before Colyseus sees the request.
 *
 * Given `--public DIR` (or DEFENDER_PUBLIC) naming a built page folder, it also serves the game itself,
 * so one service is the whole site.
 */

const port = Number(process.env.PORT ?? NET.port);
const host = process.env.HOST ?? '0.0.0.0';
const publicFlag = process.argv.indexOf('--public');
const publicSource = publicFlag >= 0 ? process.argv[publicFlag + 1] : process.env.DEFENDER_PUBLIC;
const publicDir = publicSource ? path.resolve(publicSource) : '';
const httpServer = http.createServer();
let ready = false;

const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.woff2': 'font/woff2',
};

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

/** Serves the built page. Hashed assets cache forever; the page itself never does. */
async function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end();
        return;
    }
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname);
    const file = path.resolve(publicDir, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
    if (file !== publicDir && !file.startsWith(publicDir + path.sep)) {
        res.writeHead(404).end();
        return;
    }
    const stat = await fs.stat(file).catch(() => null);
    if (!stat?.isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
        return;
    }
    const hashed = pathname.startsWith('/assets/') && !pathname.startsWith('/assets/brand/');
    res.writeHead(200, {
        'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'content-length': stat.size,
        'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
        'x-content-type-options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
}

function isBackend(url: string): boolean {
    const pathname = new URL(url, 'http://local').pathname;
    return pathname === '/ws' || pathname.startsWith('/ws/');
}

/** Runs ahead of every listener Colyseus attached, so it sees the rewritten URL. */
function intercept(event: 'request' | 'upgrade'): void {
    const listeners = httpServer.listeners(event) as ((...args: unknown[]) => void)[];
    httpServer.removeAllListeners(event);
    httpServer.on(event, (req: http.IncomingMessage, ...rest: unknown[]) => {
        if (event === 'request') {
            const res = rest[0] as http.ServerResponse;
            if (req.url === '/healthz') {
                res.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ ok: ready }));
                return;
            }
            if (publicDir && !isBackend(req.url ?? '/')) {
                serveStatic(req, res).catch(error => {
                    console.error('[defender] static file failed', error);
                    if (!res.headersSent) res.writeHead(500);
                    res.end();
                });
                return;
            }
        }
        req.url = backendUrl(req.url ?? '/', event === 'upgrade');
        for (const listener of listeners) listener.call(httpServer, req, ...rest);
    });
}

await server.listen(port, host);
intercept('request');
intercept('upgrade');
ready = true;
console.log(`[defender] co-op server on ${host}:${port}${publicDir ? `, serving ${publicDir}` : ''}`);
