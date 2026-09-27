export interface SnapBrick {
    id: string;
    x: number;
    y: number;
    z: number;
    w: number;
    d: number;
    color: string;
}

export interface SnapLevel {
    id: string;
    title: string;
    description: string;
    order: number;
    version: number;
    palette: Record<string, string>;
    bricks: SnapBrick[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isNatural = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const cellKey = (x: number, y: number, z: number): string => `${x},${y},${z}`;

export function validateLevel(input: unknown): SnapLevel {
    if (!isRecord(input)) throw new Error('Level must be a JSON object');
    const { id, title, description, order, version, palette, bricks } = input;
    if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) throw new Error('id must be a lowercase slug');
    if (typeof title !== 'string' || !title.trim()) throw new Error(`${id}: title is required`);
    if (typeof description !== 'string') throw new Error(`${id}: description is required`);
    if (!isNatural(order) || !isNatural(version) || version < 1) throw new Error(`${id}: order and version must be non-negative integers (version ≥ 1)`);
    if (!isRecord(palette) || Object.keys(palette).length === 0) throw new Error(`${id}: palette is required`);
    for (const [name, color] of Object.entries(palette)) {
        if (!/^[a-z][a-z0-9-]*$/.test(name) || typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
            throw new Error(`${id}: palette ${name} must be a six-digit hex color`);
        }
    }
    if (!Array.isArray(bricks) || bricks.length === 0) throw new Error(`${id}: bricks must be a nonempty array`);

    const occupied = new Map<string, string>();
    const ids = new Set<string>();
    for (const candidate of bricks) {
        if (!isRecord(candidate)) throw new Error(`${id}: every brick must be an object`);
        const brick = candidate as Record<string, unknown>;
        if (typeof brick.id !== 'string' || !/^[a-z0-9-]+$/.test(brick.id) || ids.has(brick.id)) {
            throw new Error(`${id}: brick IDs must be unique lowercase slugs`);
        }
        ids.add(brick.id);
        for (const field of ['x', 'y', 'z', 'w', 'd'] as const) {
            if (!isNatural(brick[field]) || ((field === 'w' || field === 'd') && Number(brick[field]) < 1)) {
                throw new Error(`${id}/${brick.id}: ${field} must be a ${field === 'w' || field === 'd' ? 'positive' : 'non-negative'} integer`);
            }
        }
        if (typeof brick.color !== 'string' || !(brick.color in palette)) {
            throw new Error(`${id}/${brick.id}: color must name a palette entry`);
        }
        for (let x = Number(brick.x); x < Number(brick.x) + Number(brick.w); x++) {
            for (let y = Number(brick.y); y < Number(brick.y) + Number(brick.d); y++) {
                const key = cellKey(x, y, Number(brick.z));
                if (occupied.has(key)) throw new Error(`${id}/${brick.id}: overlaps ${occupied.get(key)} at ${key}`);
                occupied.set(key, brick.id);
            }
        }
    }

    for (const candidate of bricks) {
        const brick = candidate as SnapBrick;
        if (brick.z === 0) continue;
        let supported = false;
        for (let x = brick.x; x < brick.x + brick.w; x++) {
            for (let y = brick.y; y < brick.y + brick.d; y++) {
                if (occupied.has(cellKey(x, y, brick.z - 1))) supported = true;
            }
        }
        if (!supported) throw new Error(`${id}/${brick.id}: floating brick has no studs beneath it`);
    }

    const first = occupied.keys().next().value as string;
    const visited = new Set([first]);
    const queue = [first];
    while (queue.length) {
        const current = queue.pop()!;
        const [x, y, z] = current.split(',').map(Number);
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
            const next = cellKey(x + dx, y + dy, z + dz);
            if (occupied.has(next) && !visited.has(next)) {
                visited.add(next);
                queue.push(next);
            }
        }
    }
    if (visited.size !== occupied.size) throw new Error(`${id}: model has disconnected pieces`);
    return input as unknown as SnapLevel;
}

export function buildOrder(level: SnapLevel): SnapBrick[] {
    return [...level.bricks].sort((a, b) =>
        a.z - b.z || (a.x + a.y) - (b.x + b.y) || a.y - b.y || a.id.localeCompare(b.id));
}

export function pieceMatches(piece: SnapBrick, target: SnapBrick): boolean {
    return piece.color === target.color &&
        Math.min(piece.w, piece.d) === Math.min(target.w, target.d) &&
        Math.max(piece.w, piece.d) === Math.max(target.w, target.d);
}

export function validPlacedIds(level: SnapLevel, placedIds: unknown): placedIds is string[] {
    if (!Array.isArray(placedIds) || placedIds.length >= level.bricks.length) return false;
    const byId = new Map(level.bricks.map(brick => [brick.id, brick]));
    const order = buildOrder(level);
    const seen = new Set<string>();
    return placedIds.every((id, index) => {
        if (typeof id !== 'string' || seen.has(id)) return false;
        seen.add(id);
        const piece = byId.get(id);
        return Boolean(piece && pieceMatches(piece, order[index]));
    });
}
