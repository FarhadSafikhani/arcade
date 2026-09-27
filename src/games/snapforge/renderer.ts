import { Application, Container, Graphics, Point } from 'pixi.js';
import { buildOrder, SnapBrick, SnapLevel } from './level';

const U = 22;
const V = 11;
const H = 20;

function shade(hex: string, amount: number): number {
    const value = parseInt(hex.slice(1), 16);
    const parts = [value >> 16, (value >> 8) & 255, value & 255];
    return parts.reduce((result, part) => result * 256 + Math.max(0, Math.min(255,
        Math.round(amount >= 0 ? part + (255 - part) * amount : part * (1 + amount)))), 0);
}

function hex(value: number): string { return `#${value.toString(16).padStart(6, '0')}`; }
function escapeAttribute(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
function project(x: number, y: number, z: number): Point { return new Point((x - y) * U, (x + y) * V - z * H); }

function drawBrick(brick: SnapBrick, color: string): Graphics {
    const g = new Graphics();
    const w = brick.w, d = brick.d;
    const a = [0, -H], b = [w * U, w * V - H];
    const c = [(w - d) * U, (w + d) * V - H], e = [-d * U, d * V - H];
    g.lineStyle(1.2, shade(color, -0.53), 0.48);
    g.beginFill(shade(color, -0.28));
    g.drawPolygon([...e, ...c, c[0], c[1] + H, e[0], e[1] + H]);
    g.endFill();
    g.beginFill(shade(color, -0.15));
    g.drawPolygon([...b, ...c, c[0], c[1] + H, b[0], b[1] + H]);
    g.endFill();
    g.beginFill(shade(color, 0.13));
    g.drawPolygon([...a, ...b, ...c, ...e]);
    g.endFill();
    g.lineStyle(0);
    for (let x = 0; x < w; x++) {
        for (let y = 0; y < d; y++) {
            const px = (x - y) * U, py = (x + y + 1) * V - H;
            g.beginFill(shade(color, -0.13), 0.85);
            g.drawEllipse(px, py + 2, U * 0.34, V * 0.43);
            g.endFill();
            g.beginFill(shade(color, 0.27));
            g.drawEllipse(px, py, U * 0.31, V * 0.36);
            g.endFill();
        }
    }
    return g;
}

function makeSprite(brick: SnapBrick, color: string, silhouette = false): Container {
    const sprite = new Container();
    sprite.name = brick.id;
    const position = project(brick.x, brick.y, brick.z);
    sprite.position.copyFrom(position);
    const dark = drawBrick(brick, '#303648');
    const colored = drawBrick(brick, color);
    dark.alpha = silhouette ? 1 : 0;
    colored.alpha = silhouette ? 0 : 1;
    sprite.addChild(dark, colored);
    sprite.zIndex = brick.z * 1000 + (brick.x + brick.y) * 10 + brick.y;
    return sprite;
}

function bounds(level: SnapLevel) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const brick of level.bricks) {
        const corners = [
            project(brick.x, brick.y, brick.z + 1),
            project(brick.x + brick.w, brick.y, brick.z + 1),
            project(brick.x + brick.w, brick.y + brick.d, brick.z + 1),
            project(brick.x, brick.y + brick.d, brick.z + 1),
            project(brick.x + brick.w, brick.y + brick.d, brick.z)
        ];
        for (const point of corners) {
            minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
            minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
        }
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export class BrickRenderer {
    private app: Application;
    private modelLayer = new Container();
    private fxLayer = new Container();
    private level: SnapLevel;
    private host: HTMLElement;
    private stage: HTMLElement;
    private resizeObserver: ResizeObserver;

    constructor(host: HTMLElement, stage: HTMLElement, level: SnapLevel) {
        this.host = host;
        this.stage = stage;
        this.level = level;
        this.app = new Application({ resizeTo: host, backgroundAlpha: 0, antialias: true,
            resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true });
        host.appendChild(this.app.view as HTMLCanvasElement);
        this.modelLayer.sortableChildren = true;
        this.app.stage.addChild(this.modelLayer, this.fxLayer);
        this.resizeObserver = new ResizeObserver(() => this.layout());
        this.resizeObserver.observe(host);
        this.layout();
    }

    setLevel(level: SnapLevel) { this.level = level; this.clear(); this.layout(); }

    private layout() {
        const box = bounds(this.level);
        const width = Math.max(1, this.host.clientWidth);
        const stageHeight = Math.max(1, this.stage.clientHeight);
        const scale = Math.min(1.85, (width * 0.82) / Math.max(1, box.width),
            (stageHeight * 0.70) / Math.max(1, box.height));
        this.modelLayer.scale.set(scale);
        this.modelLayer.position.set(width / 2 - (box.minX + box.maxX) * scale / 2,
            stageHeight * 0.53 - (box.minY + box.maxY) * scale / 2);
    }

    clear() { this.modelLayer.removeChildren().forEach(child => child.destroy({ children: true }));
        this.fxLayer.removeChildren().forEach(child => child.destroy({ children: true })); }

    showSilhouette() {
        this.clear();
        this.layout();
        this.modelLayer.alpha = 0;
        for (const brick of buildOrder(this.level)) {
            this.modelLayer.addChild(makeSprite(brick, this.level.palette[brick.color], true));
        }
    }

    async emerge(cancelled: () => boolean): Promise<void> {
        const destination = this.modelLayer.y;
        await this.tween(460, 0, t => {
            this.modelLayer.alpha = t;
            this.modelLayer.y = destination + (1 - t) * 34;
        }, cancelled);
        if (!cancelled()) this.modelLayer.y = destination;
    }

    showBuild(placed: SnapBrick[], ghost?: SnapBrick) {
        this.clear();
        this.layout();
        this.modelLayer.alpha = 1;
        for (const brick of placed) this.modelLayer.addChild(makeSprite(brick, this.level.palette[brick.color]));
        if (ghost) {
            const hint = makeSprite(ghost, this.level.palette[ghost.color]);
            hint.alpha = 0.43;
            this.modelLayer.addChild(hint);
        }
    }

    async scatter(targets: Map<string, HTMLElement>, cancelled: () => boolean): Promise<void> {
        const sprites = [...this.modelLayer.children] as Container[];
        const hostRect = this.host.getBoundingClientRect();
        const moves = sprites.map((sprite, index) => {
            const element = targets.get(sprite.name || '');
            if (!element) return Promise.resolve();
            const rect = element.getBoundingClientRect();
            const endX = rect.left + rect.width / 2 - hostRect.left;
            const endY = rect.top + rect.height / 2 - hostRect.top;
            const start = sprite.getGlobalPosition();
            this.fxLayer.addChild(sprite);
            sprite.position.copyFrom(start);
            const startScale = this.modelLayer.scale.x;
            sprite.scale.set(startScale);
            return this.tween(700, index * 18, t => {
                sprite.position.set(start.x + (endX - start.x) * t, start.y + (endY - start.y) * t);
                sprite.scale.set(startScale + (0.68 - startScale) * t);
                sprite.children[0].alpha = 1 - t;
                sprite.children[1].alpha = t;
                sprite.alpha = 1 - Math.max(0, (t - 0.82) / 0.18);
            }, cancelled).then(() => { if (!sprite.destroyed) sprite.destroy({ children: true }); });
        });
        await Promise.all(moves);
    }

    async flyFrom(element: HTMLElement, target: SnapBrick, cancelled: () => boolean): Promise<void> {
        const rect = element.getBoundingClientRect(), hostRect = this.host.getBoundingClientRect();
        const startX = rect.left + rect.width / 2 - hostRect.left;
        const startY = rect.top + rect.height / 2 - hostRect.top;
        const end = this.modelLayer.toGlobal(project(target.x, target.y, target.z));
        const sprite = makeSprite(target, this.level.palette[target.color]);
        this.fxLayer.addChild(sprite);
        sprite.position.set(startX, startY);
        sprite.scale.set(0.68);
        await this.tween(430, 0, t => {
            sprite.position.set(startX + (end.x - startX) * t, startY + (end.y - startY) * t - Math.sin(t * Math.PI) * 58);
            sprite.scale.set(0.68 + (this.modelLayer.scale.x - 0.68) * t);
        }, cancelled);
        if (!sprite.destroyed) sprite.destroy({ children: true });
    }

    private tween(duration: number, delay: number, update: (t: number) => void, cancelled: () => boolean): Promise<void> {
        return new Promise(resolve => {
            if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
                if (!cancelled()) update(1);
                resolve();
                return;
            }
            const start = performance.now() + delay;
            const tick = (now: number) => {
                if (cancelled()) { resolve(); return; }
                const linear = Math.max(0, Math.min(1, (now - start) / duration));
                const eased = 1 - Math.pow(1 - linear, 3);
                update(eased);
                if (linear < 1) requestAnimationFrame(tick); else resolve();
            };
            requestAnimationFrame(tick);
        });
    }

    destroy() { this.resizeObserver.disconnect(); this.app.destroy(true, { children: true }); }
}

function svgBrick(brick: SnapBrick, color: string): string {
    const w = brick.w, d = brick.d, ox = (brick.x - brick.y) * U, oy = (brick.x + brick.y) * V - brick.z * H;
    const p = (x: number, y: number) => `${ox + x},${oy + y}`;
    const top = `${p(0, -H)} ${p(w * U, w * V - H)} ${p((w-d)*U, (w+d)*V-H)} ${p(-d*U, d*V-H)}`;
    const left = `${p(-d*U, d*V-H)} ${p((w-d)*U, (w+d)*V-H)} ${p((w-d)*U, (w+d)*V)} ${p(-d*U, d*V)}`;
    const right = `${p(w*U,w*V-H)} ${p((w-d)*U,(w+d)*V-H)} ${p((w-d)*U,(w+d)*V)} ${p(w*U,w*V)}`;
    let studs = '';
    for (let x = 0; x < w; x++) for (let y = 0; y < d; y++) {
        studs += `<ellipse cx="${ox + (x-y)*U}" cy="${oy + (x+y+1)*V-H}" rx="6.5" ry="4" fill="${hex(shade(color, .28))}"/>`;
    }
    return `<polygon points="${left}" fill="${hex(shade(color,-.28))}"/><polygon points="${right}" fill="${hex(shade(color,-.15))}"/><polygon points="${top}" fill="${hex(shade(color,.13))}"/>${studs}`;
}

export function modelSVG(level: SnapLevel): string {
    const box = bounds(level), margin = 18;
    const body = buildOrder(level).map(brick => svgBrick(brick, level.palette[brick.color])).join('');
    return `<svg viewBox="${box.minX-margin} ${box.minY-margin} ${box.width+margin*2} ${box.height+margin*2}" role="img" aria-label="${escapeAttribute(level.title)} brick model" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

export function pieceSVG(brick: SnapBrick, color: string): string {
    const box = { minX: -brick.d*U, minY: -H, width: (brick.w+brick.d)*U, height: (brick.w+brick.d)*V+H };
    return `<svg viewBox="${box.minX-8} ${box.minY-8} ${box.width+16} ${box.height+16}" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${svgBrick({...brick,x:0,y:0,z:0},color)}</svg>`;
}
