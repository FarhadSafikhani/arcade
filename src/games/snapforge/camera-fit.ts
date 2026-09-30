import { BRICK_HEIGHT } from './brick3d';
import type { SnapBrick, SnapLevel } from './level';

export interface Vec3 { x: number; y: number; z: number; }
export interface Box { min: Vec3; max: Vec3; }
export interface FrameSphere extends Vec3 { radius: number; }

/** Never frame a smaller footprint than this, so the first plate of a tiny model does not fill the view. */
export const MIN_FOOTPRINT = 8;
/** Camera rise over run; shared by the build view and the gallery so both read as the same angle. */
export const VIEW_RISE = 0.62;

interface Footprint { width: number; depth: number; }

function footprint(level: SnapLevel): Footprint {
    return {
        width: Math.max(...level.bricks.map(brick => brick.x + brick.w)),
        depth: Math.max(...level.bricks.map(brick => brick.y + brick.d))
    };
}

/** Same coordinate space as `brickPosition`: footprint centered on the origin, floor at y = 0. */
function brickBox(brick: SnapBrick, size: Footprint): Box {
    const x = brick.x - size.width / 2, z = brick.y - size.depth / 2;
    return {
        min: { x, y: brick.z * BRICK_HEIGHT, z },
        max: { x: x + brick.w, y: (brick.z + (brick.h ?? 1)) * BRICK_HEIGHT, z: z + brick.d }
    };
}

function union(box: Box, other: Box): Box {
    return {
        min: { x: Math.min(box.min.x, other.min.x), y: Math.min(box.min.y, other.min.y), z: Math.min(box.min.z, other.min.z) },
        max: { x: Math.max(box.max.x, other.max.x), y: Math.max(box.max.y, other.max.y), z: Math.max(box.max.z, other.max.z) }
    };
}

function floorBox(size: Footprint): Box {
    const half = Math.max(size.width, size.depth, MIN_FOOTPRINT) / 2;
    return { min: { x: -half, y: 0, z: -half }, max: { x: half, y: 0, z: half } };
}

/** The finished model, on at least the minimum footprint. */
export function modelBox(level: SnapLevel): Box {
    const size = footprint(level);
    return level.bricks.reduce((box, brick) => union(box, brickBox(brick, size)), floorBox(size));
}

/**
 * What the player is working on: the footprint, every placed brick, the target, and one layer of headroom.
 * Passing the previous box makes the result grow-only, so the view never zooms back in mid-build.
 */
export function workingBox(level: SnapLevel, order: SnapBrick[], placedCount: number, previous: Box | null = null): Box {
    const size = footprint(level);
    let box = previous ?? floorBox(size);
    for (const brick of order.slice(0, placedCount)) box = union(box, brickBox(brick, size));
    const target = order[placedCount];
    if (target) {
        const targetBox = brickBox(target, size);
        targetBox.max.y += BRICK_HEIGHT;
        box = union(box, targetBox);
    }
    return box;
}

export function boxSphere(box: Box): FrameSphere {
    const x = (box.min.x + box.max.x) / 2, y = (box.min.y + box.max.y) / 2, z = (box.min.z + box.max.z) / 2;
    return { x, y, z, radius: Math.hypot(box.max.x - x, box.max.y - y, box.max.z - z) };
}

/** Distance at which a sphere fits the limiting axis of a perspective camera from any direction. */
export function fitDistance(radius: number, verticalFovDegrees: number, aspect: number, margin = 1.1): number {
    const vertical = verticalFovDegrees * Math.PI / 360;
    const limiting = Math.min(vertical, Math.atan(Math.tan(vertical) * Math.max(0.1, aspect)));
    return radius / Math.sin(limiting) * margin;
}

/**
 * Tighter than a sphere for a model that turns about the vertical axis through the origin under a fixed camera:
 * finds the closest distance where every corner of the box stays in view at every turn angle.
 */
export function fitSpinningBox(box: Box, center: Vec3, direction: Vec3, verticalFovDegrees: number,
    aspect: number, margin = 1.1): number {
    const tanV = Math.tan(verticalFovDegrees * Math.PI / 360), tanH = tanV * Math.max(0.1, aspect);
    // Camera basis for a camera at center + direction * distance, looking back at center.
    const forward = { x: -direction.x, y: -direction.y, z: -direction.z };
    const rightLength = Math.hypot(forward.z, forward.x);
    const right = { x: -forward.z / rightLength, y: 0, z: forward.x / rightLength };
    const up = { x: right.y * forward.z - right.z * forward.y, y: right.z * forward.x - right.x * forward.z,
        z: right.x * forward.y - right.y * forward.x };
    const points: Vec3[] = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z])
        for (let step = 0; step < 32; step++) {
            const turn = step / 32 * Math.PI * 2, sin = Math.sin(turn), cos = Math.cos(turn);
            points.push({ x: x * cos + z * sin - center.x, y: y - center.y, z: -x * sin + z * cos - center.z });
        }
    const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
    // Each point needs distance >= its own share of the frustum; a point's depth grows one-for-one with distance.
    let distance = 0;
    for (const point of points) {
        const along = dot(point, forward), sideways = Math.abs(dot(point, right)), lift = Math.abs(dot(point, up));
        distance = Math.max(distance, sideways / tanH - along, lift / tanV - along);
    }
    return distance * margin;
}

/** Unit direction from the frame center to the camera for a given orbit angle. */
export function viewDirection(yaw: number): Vec3 {
    const length = Math.hypot(1, VIEW_RISE);
    return { x: Math.sin(yaw) / length, y: VIEW_RISE / length, z: Math.cos(yaw) / length };
}

/** Frame-rate independent exponential approach; a zero time constant snaps. */
export function easeFrame(current: FrameSphere, target: FrameSphere, seconds: number, timeConstant: number): FrameSphere {
    const blend = timeConstant <= 0 ? 1 : 1 - Math.exp(-Math.max(0, seconds) / timeConstant);
    const step = (from: number, to: number) => Math.abs(to - from) < 1e-3 ? to : from + (to - from) * blend;
    return { x: step(current.x, target.x), y: step(current.y, target.y), z: step(current.z, target.z),
        radius: step(current.radius, target.radius) };
}
