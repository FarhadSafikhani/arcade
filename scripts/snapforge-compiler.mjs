// Offline, deterministic authoring tools. No AI calls and no changes to the recipe's cells.
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import ts from 'typescript';

const source = readFileSync(new URL('../src/games/snapforge/level.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { validateLevel, supportIds } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const key = (x, y, z) => `${x},${y},${z}`;
const shapeKey = b => [b.x, b.y, b.z, b.w, b.d, b.h ?? 1, b.color, b.kind ?? 'brick'].join(':');
const size = b => b.w * b.d * (b.h ?? 1);
const common = new Set(['1:1', '1:2', '1:3', '1:4', '1:6', '1:8', '2:2', '2:3', '2:4', '2:6', '2:8', '4:4', '4:6', '4:8']);
export const standardSize = b => common.has(`${Math.min(b.w, b.d)}:${Math.max(b.w, b.d)}`);
export function brickCells(b) {
    const result = [];
    for (let z = b.z; z < b.z + (b.h ?? 1); z++)
        for (let y = b.y; y < b.y + b.d; y++)
            for (let x = b.x; x < b.x + b.w; x++) result.push(key(x, y, z));
    return result;
}
function mirror(b, symmetry) {
    const axis = symmetry.axis, dimension = axis === 'x' ? 'w' : 'd';
    return { ...b, [axis]: 2 * symmetry.plane - b[axis] - b[dimension] };
}

export function expandRecipe(recipe) {
    if (!Array.isArray(recipe.volumes) || !recipe.volumes.length) throw new Error('Recipe needs named volumes');
    const symmetry = recipe.symmetry;
    if (symmetry && (!['x', 'y'].includes(symmetry.axis) || !Number.isSafeInteger(symmetry.plane * 2)))
        throw new Error('Symmetry needs axis x or y and an integer or half-integer plane');
    const exceptions = new Set();
    for (const exception of symmetry?.exceptions ?? []) {
        if (!exception.reason?.trim() || !Array.isArray(exception.volumes) || !exception.volumes.length)
            throw new Error('Symmetry exceptions need volume names and a reason');
        exception.volumes.forEach(name => exceptions.add(name));
    }
    const cells = new Map(), names = new Set();
    for (const volume of recipe.volumes) {
        if (typeof volume.name !== 'string' || !volume.name.trim() || names.has(volume.name)) throw new Error('Volume names must be unique');
        names.add(volume.name);
        for (const field of ['x', 'y', 'z', 'w', 'd', 'h'])
            if (!Number.isSafeInteger(volume[field]) || volume[field] < (['w', 'd', 'h'].includes(field) ? 1 : 0))
                throw new Error(`${volume.name}: invalid ${field}`);
        if (!recipe.palette || !Object.hasOwn(recipe.palette, volume.color)) throw new Error(`${volume.name}: unknown color`);
        if (volume.kind !== undefined && volume.kind !== 'brick' && volume.kind !== 'wheel')
            throw new Error(`${volume.name}: unknown part kind`);
        if (volume.kind === 'wheel' && (volume.h !== 3 || Math.min(volume.w, volume.d) !== 1 || Math.max(volume.w, volume.d) !== 3))
            throw new Error(`${volume.name}: wheel must be 3×1 h3 (or rotated)`);
        for (const cell of brickCells(volume)) {
            if (cells.get(cell)?.part || (volume.kind === 'wheel' && cells.has(cell)))
                throw new Error(`${volume.name}: wheel assemblies cannot overlap or be overlaid`);
            if (cells.has(cell) && volume.overlay !== true) throw new Error(`${volume.name}: overlap requires overlay: true`);
            cells.set(cell, { color: volume.color, region: volume.protected ? volume.name : '', exception: exceptions.has(volume.name),
                ...(volume.kind === 'wheel' ? { part: volume } : {}) });
        }
    }
    for (const name of exceptions) if (!names.has(name)) throw new Error(`Unknown symmetry exception volume: ${name}`);
    if (symmetry) for (const [cell, value] of cells) {
        if (value.exception) continue;
        const [x, y, z] = cell.split(',').map(Number);
        const reflected = mirror({ x, y, z, w: 1, d: 1 }, symmetry);
        const other = cells.get(key(reflected.x, reflected.y, z));
        if (!other || other.exception || other.color !== value.color || other.part?.kind !== value.part?.kind)
            throw new Error(`Symmetry failure at ${cell}; fix the recipe or document an explicit exception`);
    }
    return cells;
}

function candidatesFor(cells, symmetry) {
    const points = [...cells.keys()].map(cell => cell.split(',').map(Number));
    const xmax = Math.max(...points.map(p => p[0])) + 1, ymax = Math.max(...points.map(p => p[1])) + 1;
    const singles = new Map();
    for (const [x, y, z] of points) {
        const origin = cells.get(key(x, y, z));
        if (origin.part) {
            const { x, y, z, w, d, h, color, kind } = origin.part;
            const brick = { x, y, z, w, d, h, color, kind };
            singles.set(shapeKey(brick), { brick, keys: brickCells(brick), exception: origin.exception });
            continue;
        }
        for (const h of [1, 2]) for (let w = 1; w <= xmax - x; w++) {
            // If this first row does not fit, wider candidates cannot fit either.
            const row = brickCells({ x, y, z, w, d: 1, h });
            const fits = keys => keys.every(k => {
                const c = cells.get(k);
                return c && !c.part && c.color === origin.color && c.region === origin.region && c.exception === origin.exception;
            });
            if (!fits(row)) break;
            for (let d = 1; d <= ymax - y; d++) {
                const brick = { x, y, z, w, d, h, color: origin.color };
                const keys = brickCells(brick);
                if (!fits(keys)) break;
                if (z && !keys.some(k => {
                    const [xx, yy, zz] = k.split(',').map(Number);
                    return zz === z && cells.has(key(xx, yy, z - 1));
                })) continue;
                singles.set(shapeKey(brick), { brick, keys, exception: origin.exception });
            }
        }
    }
    const groups = new Map();
    for (const candidate of singles.values()) {
        const members = [candidate];
        if (symmetry && !candidate.exception) {
            const other = singles.get(shapeKey(mirror(candidate.brick, symmetry)));
            if (!other || other.exception) continue;
            if (shapeKey(other.brick) !== shapeKey(candidate.brick)) {
                const occupied = new Set(candidate.keys);
                if (other.keys.some(k => occupied.has(k))) continue;
                members.push(other);
            }
        }
        members.sort((a, b) => shapeKey(a.brick).localeCompare(shapeKey(b.brick)));
        const id = members.map(m => shapeKey(m.brick)).join('|');
        groups.set(id, { id, bricks: members.map(m => m.brick), keys: members.flatMap(m => m.keys) });
    }
    return [...groups.values()];
}

function rank(group, mode) {
    const b = group.bricks[0], volume = size(b);
    // Three volume-first alternatives plus a common-size preference with a modest custom-size cost.
    return [mode === 3 ? volume / (standardSize(b) ? 1 : 1.2) : volume,
        mode === 1 ? b.w * b.d : mode === 2 ? b.w : b.h,
        standardSize(b) ? 1 : 0];
}
function sortedCandidates(candidates, mode) {
    return [...candidates].sort((a, b) => {
        const ar = rank(a, mode), br = rank(b, mode);
        for (let i = 0; i < ar.length; i++) if (ar[i] !== br[i]) return br[i] - ar[i];
        return a.id.localeCompare(b.id);
    });
}
function pack(candidates, cells) {
    const remaining = new Set(cells), result = [];
    for (const candidate of candidates) if (candidate.keys.every(k => remaining.has(k))) {
        result.push(candidate);
        candidate.keys.forEach(k => remaining.delete(k));
    }
    return remaining.size ? null : result;
}
function cost(groups) {
    const bricks = groups.flatMap(g => g.bricks);
    return [bricks.length, bricks.reduce((n, b) => n + 2 * (b.w * b.d + b.w * b.h + b.d * b.h), 0),
        bricks.filter(b => !standardSize(b)).length];
}
function better(a, b) {
    if (!b) return true;
    const ca = cost(a), cb = cost(b);
    for (let i = 0; i < ca.length; i++) if (ca[i] !== cb[i]) return ca[i] < cb[i];
    return false;
}
function repack(groups, alternatives) {
    // Repack small overlapping neighborhoods, including their mirrored partners.
    // Strictly decreasing cost and bounded passes keep authoring repeatable and finite.
    for (let pass = 0; pass < 3; pass++) {
        let improved = false;
        for (const candidate of alternatives[0]) {
            const wanted = new Set(candidate.keys);
            const local = groups.filter(g => g.keys.some(k => wanted.has(k)));
            if (local.length < 2 || local.flatMap(g => g.bricks).length > 8) continue;
            const region = new Set(local.flatMap(g => g.keys));
            let replacement = local;
            for (const ordered of alternatives) {
                const packed = pack(ordered.filter(c => c.keys.every(k => region.has(k))), region);
                if (packed && better(packed, replacement)) replacement = packed;
            }
            if (replacement !== local) {
                groups = [...groups.filter(g => !local.includes(g)), ...replacement];
                improved = true;
            }
        }
        if (!improved) break;
    }
    return groups;
}

function assembly(bricks) {
    const occupied = new Map(bricks.flatMap(b => brickCells(b).map(k => [k, b.id])));
    const byId = new Map(bricks.map(b => [b.id, b]));
    const below = b => supportIds(b, occupied, byId);
    // Only studs or an explicit wheel axle count as connections.
    const links = new Map(bricks.map(b => [b.id, new Set()]));
    for (const b of bricks) for (const id of below(b)) { links.get(b.id).add(id); links.get(id).add(b.id); }
    const seen = new Set(), queue = [bricks[0].id];
    while (queue.length) { const id = queue.pop(); if (seen.has(id)) continue; seen.add(id); queue.push(...links.get(id)); }
    if (seen.size !== bricks.length) throw new Error(`Support failure: model needs stud connections between all pieces, not just touching sides; separate pieces: ${bricks.filter(b => !seen.has(b.id)).map(b => `${b.id} (${b.x},${b.y},${b.z}; ${b.w}×${b.d}×${b.h})`).join(', ')}`);
    const placed = new Set(), sequence = [], remaining = [...bricks];
    while (remaining.length) {
        const eligible = remaining.filter(b => b.z === 0 || [...below(b)].some(id => placed.has(id)));
        eligible.sort((a, b) => a.z - b.z || b.w * b.d - a.w * a.d || a.id.localeCompare(b.id));
        const next = eligible[0];
        if (!next) throw new Error('Support failure: no supported construction sequence');
        sequence.push(next.id); placed.add(next.id); remaining.splice(remaining.indexOf(next), 1);
    }
    return sequence;
}

export function compileRecipe(recipe, previous) {
    const cells = expandRecipe(recipe);
    const candidates = candidatesFor(cells, recipe.symmetry);
    const alternatives = [0, 1, 2, 3].map(mode => sortedCandidates(candidates, mode));
    let best, bestSequence, failure = 'Support failure: no complete supported, symmetric packing';
    for (const ordered of alternatives) {
        const packed = pack(ordered, cells.keys());
        if (!packed) continue;
        const optimized = repack(packed, alternatives);
        for (const option of [optimized, packed]) {
            const bricks = numbered(option);
            try {
                const sequence = assembly(bricks);
                if (better(option, best)) { best = option; bestSequence = sequence; }
            } catch (error) { failure = error.message; }
        }
    }
    if (!best) throw new Error(failure);
    const bricks = numbered(best);
    const level = { id: recipe.id, title: recipe.title, description: recipe.description,
        collection: recipe.collection, order: recipe.order, version: recipe.version,
        targetParts: recipe.targetParts, vetted: 0, palette: recipe.palette, bricks, buildSequence: bestSequence };
    // Only preserve a manually set vetting status for an unchanged artifact. Never trust recipe.vetted.
    if (previous?.vetted === 1 && isDeepStrictEqual({ ...previous, vetted: 0 }, level)) level.vetted = 1;
    validateLevel(level);
    if (previous && previous.id !== level.id) throw new Error('Output already belongs to a different model');
    if (previous && (!isDeepStrictEqual(previous.bricks, bricks) ||
        !isDeepStrictEqual(previous.palette, level.palette) ||
        !isDeepStrictEqual(previous.buildSequence, level.buildSequence)) && level.version <= previous.version)
        throw new Error('Increment recipe version before changing an existing model geometry or build sequence');
    if (previous && level.version < previous.version) throw new Error('Recipe version cannot decrease');
    const merges = mergeOpportunities(bricks);
    return { level, report: { targetParts: level.targetParts, actualParts: bricks.length,
        withinBudget: Math.abs(bricks.length - level.targetParts) <= 2,
        customSizes: [...new Set(bricks.filter(b => !standardSize(b)).map(b => `${Math.min(b.w, b.d)}×${Math.max(b.w, b.d)} h${b.h}`))],
        supportFailures: [], symmetryFailures: [], mergeOpportunities: merges } };
}
function numbered(groups) {
    return groups.flatMap(g => g.bricks).sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x || shapeKey(a).localeCompare(shapeKey(b)))
        .map((b, index) => ({ id: `brick-${String(index + 1).padStart(3, '0')}`, ...b }));
}
function mergeOpportunities(bricks) {
    const result = [];
    for (let i = 0; i < bricks.length; i++) for (let j = i + 1; j < bricks.length; j++) {
        const a = bricks[i], b = bricks[j];
        if (a.kind === 'wheel' || b.kind === 'wheel' || a.color !== b.color) continue;
        const w = Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x);
        const d = Math.max(a.y + a.d, b.y + b.d) - Math.min(a.y, b.y);
        const h = Math.max(a.z + a.h, b.z + b.h) - Math.min(a.z, b.z);
        if (h <= 2 && w * d * h === size(a) + size(b)) result.push([a.id, b.id]);
    }
    return result;
}
