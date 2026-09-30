export interface SnapBrick {
    id: string;
    x: number;
    y: number;
    z: number;
    w: number;
    d: number;
    h?: 1 | 2 | 3 | 4;
    kind?: 'brick' | 'wheel';
    attachment?: 'underside';
    color: string;
}

export interface SnapLevel {
    id: string;
    title: string;
    description: string;
    collection: string;
    order: number;
    version: number;
    targetParts: number;
    vetted: 0 | 1;
    buildSequence?: string[];
    palette: Record<string, string>;
    bricks: SnapBrick[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isNatural = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const cellKey = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/** Wheels attach at axles; underside bricks attach their top studs to the brick above. */
export function supportIds(brick: SnapBrick, occupied: Map<string, string>, byId: Map<string, SnapBrick>): Set<string> {
    const ids = new Set<string>();
    const add = (x: number, y: number, z: number) => {
        const id = occupied.get(cellKey(x, y, z));
        if (id && byId.get(id)?.kind !== 'wheel') ids.add(id);
    };
    if (brick.kind === 'wheel') {
        if (brick.w > brick.d) {
            add(brick.x + 1, brick.y - 1, brick.z + 1);
            add(brick.x + 1, brick.y + brick.d, brick.z + 1);
        } else {
            add(brick.x - 1, brick.y + 1, brick.z + 1);
            add(brick.x + brick.w, brick.y + 1, brick.z + 1);
        }
    } else for (let x = brick.x; x < brick.x + brick.w; x++)
        for (let y = brick.y; y < brick.y + brick.d; y++)
            add(x, y, brick.attachment === 'underside' ? brick.z + (brick.h ?? 1) : brick.z - 1);
    return ids;
}

export function validateLevel(input: unknown): SnapLevel {
    if (!isRecord(input)) throw new Error('Level must be a JSON object');
    const { id, title, description, collection, order, version, palette, bricks } = input;
    if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) throw new Error('id must be a lowercase slug');
    if (typeof title !== 'string' || !title.trim()) throw new Error(`${id}: title is required`);
    if (typeof description !== 'string') throw new Error(`${id}: description is required`);
    if (typeof collection !== 'string' || !['starter', 'farm', 'land-animal', 'fruit', 'bird', 'car', 'landmarks', 'ocean', 'dinosaur'].includes(collection))
        throw new Error(`${id}: collection must name a known collection`);
    if (!isNatural(order) || !isNatural(version) || version < 1) throw new Error(`${id}: order and version must be non-negative integers (version ≥ 1)`);
    if (!isNatural(input.targetParts) || input.targetParts < 1) throw new Error(`${id}: targetParts must be a positive integer`);
    if (input.vetted !== 0 && input.vetted !== 1) throw new Error(`${id}: vetted must be 0 or 1`);
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
        if (brick.kind !== undefined && brick.kind !== 'brick' && brick.kind !== 'wheel') {
            throw new Error(`${id}/${brick.id}: unknown part kind`);
        }
        if (brick.attachment !== undefined && (brick.attachment !== 'underside' || brick.kind === 'wheel'))
            throw new Error(`${id}/${brick.id}: invalid attachment`);
        if (brick.kind === 'wheel') {
            if (brick.h !== 3 || Math.min(Number(brick.w), Number(brick.d)) !== 1 ||
                Math.max(Number(brick.w), Number(brick.d)) !== 3)
                throw new Error(`${id}/${brick.id}: wheel must be 3×1 h3 (or rotated)`);
        } else if (brick.h !== undefined && brick.h !== 1 && brick.h !== 2 &&
            !(brick.h === 3 && Math.min(Number(brick.w), Number(brick.d)) === 1 &&
                Math.max(Number(brick.w), Number(brick.d)) === 2) &&
            !(brick.h === 4 && Number(brick.w) <= 2 && Number(brick.d) <= 2)) {
            throw new Error(`${id}/${brick.id}: h must be 1 or 2, or 3 for a 1�2 pillar`);
        }
        if (typeof brick.color !== 'string' || !(brick.color in palette)) {
            throw new Error(`${id}/${brick.id}: color must name a palette entry`);
        }
        for (let x = Number(brick.x); x < Number(brick.x) + Number(brick.w); x++) {
            for (let y = Number(brick.y); y < Number(brick.y) + Number(brick.d); y++) {
                for (let z = Number(brick.z); z < Number(brick.z) + Number(brick.h ?? 1); z++) {
                    const key = cellKey(x, y, z);
                    if (occupied.has(key)) throw new Error(`${id}/${brick.id}: overlaps ${occupied.get(key)} at ${key}`);
                    occupied.set(key, brick.id);
                }
            }
        }
    }

    const byId = new Map((bricks as SnapBrick[]).map(brick => [brick.id, brick]));
    for (const candidate of bricks) {
        const brick = candidate as SnapBrick;
        if (brick.z === 0 && brick.attachment !== 'underside') continue;
        const supported = supportIds(brick, occupied, byId).size > 0;
        if (!supported) throw new Error(`${id}/${brick.id}: floating brick has no ${brick.attachment === 'underside' ? 'attachment above' : 'studs beneath it'}`);
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
    if (bricks.some(b => b.attachment === 'underside') && input.buildSequence === undefined)
        throw new Error(`${id}: underside attachments require a supported buildSequence`);
    if (input.buildSequence !== undefined) {
        const sequence = input.buildSequence;
        if (!Array.isArray(sequence) || sequence.length !== bricks.length || new Set(sequence).size !== bricks.length ||
            !sequence.every(item => typeof item === 'string' && ids.has(item)))
            throw new Error(`${id}: buildSequence must contain every brick ID exactly once`);
        const placed = new Set<string>();
        const byId = new Map((bricks as SnapBrick[]).map(brick => [brick.id, brick]));
        for (const brickId of sequence) {
            const brick = byId.get(brickId)!;
            const supported = (brick.z === 0 && brick.attachment !== 'underside') || Array.from(supportIds(brick, occupied, byId)).some(id => placed.has(id));
            if (!supported) throw new Error(`${id}/${brickId}: buildSequence places brick before its support`);
            placed.add(brickId);
        }
    }
    return input as unknown as SnapLevel;
}

export function buildOrder(level: SnapLevel): SnapBrick[] {
    if (level.buildSequence) {
        const byId = new Map(level.bricks.map(brick => [brick.id, brick]));
        return level.buildSequence.map(id => byId.get(id)!);
    }
    return [...level.bricks].sort((a, b) =>
        a.z - b.z || (a.x + a.y) - (b.x + b.y) || a.y - b.y || a.id.localeCompare(b.id));
}

export function pieceMatches(piece: SnapBrick, target: SnapBrick): boolean {
    return (piece.kind ?? 'brick') === (target.kind ?? 'brick') &&
        piece.color === target.color && (piece.h ?? 1) === (target.h ?? 1) &&
        Math.min(piece.w, piece.d) === Math.min(target.w, target.d) &&
        Math.max(piece.w, piece.d) === Math.max(target.w, target.d);
}

/** Stock the next 24 placements, with up to six nearer-future pieces mixed in. */
export function pileAdditions(active: SnapBrick[], reserve: SnapBrick[], upcoming: SnapBrick[]): SnapBrick[] {
    const unmatched = [...active];
    const available = [...reserve];
    const additions: SnapBrick[] = [];
    const addMatch = (target: SnapBrick): boolean => {
        if (active.length + additions.length >= 30) return false;
        const index = available.findIndex(piece => pieceMatches(piece, target));
        if (index < 0) return false;
        additions.push(available.splice(index, 1)[0]);
        return true;
    };
    // Consume each visible match once: repeated upcoming steps need repeated pieces.
    // Physical IDs are interchangeable and may differ from the target IDs after resume.
    for (const target of upcoming.slice(0, 24)) {
        const index = unmatched.findIndex(piece => pieceMatches(piece, target));
        if (index >= 0) unmatched.splice(index, 1);
        else addMatch(target);
    }
    // Existing future pieces keep their place; never remove or reshuffle the live pile.
    const oversized = (piece: SnapBrick) => piece.w * piece.d >= 16;
    let futureCount = unmatched.length;
    let largeFutureCount = unmatched.filter(oversized).length;
    for (const target of upcoming.slice(24)) {
        if (futureCount >= 6 || active.length + additions.length >= 30) break;
        const index = unmatched.findIndex(piece => pieceMatches(piece, target));
        if (index >= 0) { unmatched.splice(index, 1); continue; }
        if (oversized(target) && largeFutureCount >= 2) continue;
        if (addMatch(target)) {
            futureCount++;
            if (oversized(target)) largeFutureCount++;
        }
    }
    return additions;
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
