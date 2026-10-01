export interface StickerPiece {
    x: number;
    y: number;
    width: number;
    height: number;
    points?: number[];
}

export interface PreparedSticker {
    width: number;
    height: number;
    // One byte per pixel; shared by every slot, independent of screen size.
    silhouette: Uint8Array;
    cells: StickerPiece[][][];
}

export const yieldToBrowser = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

// Analyze all three cut options so replays can still choose fresh random cuts.
export async function prepareStickerPixels(
    data: Uint8ClampedArray, width: number, height: number, gridSize: number,
    visibleThreshold: number, yieldWork = yieldToBrowser,
): Promise<PreparedSticker> {
    if (!Number.isInteger(gridSize) || gridSize < 1 || gridSize > Math.min(width, height)
        || data.length !== width * height * 4) throw new Error('Invalid sticker dimensions');
    const silhouette = new Uint8Array(width * height);
    const cells: StickerPiece[][][] = [];
    let deadline = performance.now() + 8;
    for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
            const x = Math.round(col * width / gridSize);
            const y = Math.round(row * height / gridSize);
            const w = Math.round((col + 1) * width / gridSize) - x;
            const h = Math.round((row + 1) * height / gridSize) - y;
            const total = [0, 0, 0, 0, 0];
            const visible = [0, 0, 0, 0, 0];
            for (let py = 0; py < h; py++) {
                for (let px = 0; px < w; px++) {
                    const index = (y + py) * width + x + px;
                    const alpha = data[index * 4 + 3];
                    silhouette[index] = alpha > 200 ? 255 : 0;
                    // Pixel centers partition each cell exactly, including diagonal edges.
                    const rising = (px + 0.5) / w + (py + 0.5) / h <= 1 ? 1 : 2;
                    const falling = (py + 0.5) / h <= (px + 0.5) / w ? 3 : 4;
                    total[0]++; total[rising]++; total[falling]++;
                    if (alpha > 128) { visible[0]++; visible[rising]++; visible[falling]++; }
                }
                if (performance.now() >= deadline) {
                    await yieldWork();
                    deadline = performance.now() + 8;
                }
            }
            const pieces: StickerPiece[] = [
                { x, y, width: w, height: h },
                { x, y, width: w, height: h, points: [0, 0, w, 0, 0, h] },
                { x, y, width: w, height: h, points: [w, 0, w, h, 0, h] },
                { x, y, width: w, height: h, points: [0, 0, w, 0, w, h] },
                { x, y, width: w, height: h, points: [0, 0, w, h, 0, h] },
            ];
            const keep = (i: number) => total[i] > 0 && visible[i] / total[i] >= visibleThreshold;
            cells.push([[0], [1, 2], [3, 4]].map(indices => indices.filter(keep).map(i => pieces[i])));
        }
    }
    return { width, height, silhouette, cells };
}

// IndexedDB is an optional acceleration. Denied storage, quota errors, and blocked
// upgrades must never prevent a puzzle from opening.
let database: Promise<IDBDatabase | null> | undefined;
function openCache(): Promise<IDBDatabase | null> {
    return database ??= new Promise(resolve => {
        try {
            const request = indexedDB.open('stickers-preparation', 1);
            const timer = setTimeout(() => resolve(null), 500);
            request.onupgradeneeded = () => request.result.createObjectStore('plans');
            request.onsuccess = () => { clearTimeout(timer); resolve(request.result); };
            request.onerror = request.onblocked = () => { clearTimeout(timer); resolve(null); };
        } catch { resolve(null); }
    });
}

async function readSaved(key: string): Promise<PreparedSticker | undefined> {
    const db = await openCache();
    if (!db) return;
    return new Promise(resolve => {
        try {
            const request = db.transaction('plans').objectStore('plans').get(key);
            const timer = setTimeout(() => resolve(undefined), 500);
            request.onsuccess = () => { clearTimeout(timer); resolve(request.result); };
            request.onerror = () => { clearTimeout(timer); resolve(undefined); };
        } catch { resolve(undefined); }
    });
}

async function save(key: string, plan: PreparedSticker): Promise<void> {
    const db = await openCache();
    if (!db) return;
    try {
        const store = db.transaction('plans', 'readwrite').objectStore('plans');
        store.put(plan, key);
        const keys = store.getAllKeys();
        keys.onsuccess = () => {
            // Remove records from previous releases and bound the number of
            // saved image/difficulty combinations.
            const revision = key.split(':')[0];
            const current = keys.result.filter(k => String(k).startsWith(`${revision}:`));
            for (const old of keys.result.filter(k => !String(k).startsWith(`${revision}:`))) store.delete(old);
            for (const old of current.filter(k => k !== key).slice(0, Math.max(0, current.length - 54))) store.delete(old);
        };
    } catch { /* Storage is best effort. */ }
}

export class StickerPreparationCache {
    private readonly plans = new Map<string, Promise<PreparedSticker>>();

    constructor(
        private readonly read = readSaved,
        private readonly write = save,
    ) {}

    get(key: string, create: () => Promise<PreparedSticker>): Promise<PreparedSticker> {
        const existing = this.plans.get(key);
        if (existing) {
            this.plans.delete(key);
            this.plans.set(key, existing);
            return existing;
        }
        const pending = (async () => {
            const saved = await this.read(key).catch(() => undefined);
            if (saved) return saved;
            const plan = await create();
            void this.write(key, plan).catch(() => {});
            return plan;
        })();
        this.plans.set(key, pending);
        // Keep only four source plans in memory; disk holds the rest.
        if (this.plans.size > 4) this.plans.delete(this.plans.keys().next().value!);
        void pending.catch(() => { if (this.plans.get(key) === pending) this.plans.delete(key); });
        return pending;
    }
}

export const stickerPreparationCache = new StickerPreparationCache();
