import type { EffectSpec } from './ambient/effects';
import type { Region } from './ambient/types';

type PondAnimal = 'duck' | 'swan' | 'heron' | 'raccoon';
type FarmAnimal = 'cow' | 'sheep' | 'dog' | 'hen' | 'rooster';
type SafariAnimal = 'lion' | 'hippo' | 'elephant' | 'zebra' | 'giraffe';
type Animal = PondAnimal | FarmAnimal | SafariAnimal;
export type SceneId = 'pond' | 'farm' | 'safari';
export type StorySticker = `pond:${PondAnimal}` | `farm:${FarmAnimal}` | `safari:${SafariAnimal}`;
export const STORY_SAVE_KEY = 'stickers:painted-pond:v1';
export const STORY_PAGE_KEY = `${STORY_SAVE_KEY}:page`;

export interface StoryScene {
    id: SceneId;
    background: string;
    description: string;
    animals: { id: Animal; x: number; y: number; width: number; anchor?: 'feet' }[];
    /** Ambient overlay played above the painting, below the stickers. */
    effects: readonly EffectSpec[];
}

// Traced over pond.png: open water between the lily pads and the right bank.
const POND_OPEN_WATER: Region = [[4, 46], [30, 40], [55, 36], [74, 37], [86, 48], [80, 62], [78, 70], [96, 84], [96, 96], [60, 96], [35, 86], [26, 74], [8, 64]];
const POND_SUN_COLUMN: Region = [[50, 44], [63, 44], [70, 97], [45, 97]];
const POND_WATERFALL_FOOT: Region = [[17, 34], [27, 34], [27, 39], [17, 39]];
const POND_SUNLIT_AIR: Region = [[40, 4], [78, 4], [74, 50], [44, 50]];

export const STORY_SCENES: StoryScene[] = [
    { id: 'pond', background: 'pond.png', description: 'Sunlit fantasy pond with water lilies and a mossy woodland bank', animals: [
        { id: 'duck', x: 14, y: 65, width: 21 },
        { id: 'swan', x: 45, y: 46, width: 27 },
        { id: 'heron', x: 78, y: 33, width: 16 },
        { id: 'raccoon', x: 16, y: 12, width: 11.5 },
    ], effects: [
        { type: 'rays', origin: [61, -4], color: '#fff1c1', beams: [
            { angle: 10, spread: 7, alpha: 0.12 },
            { angle: 22, spread: 11, alpha: 0.09 },
            { angle: 36, spread: 5, alpha: 0.08 },
        ] },
        { type: 'ripples', region: POND_OPEN_WATER, every: [2, 4.5], life: [3.5, 5.5], radius: [3, 6], alpha: 0.26 },
        { type: 'glints', region: POND_SUN_COLUMN, count: 14, size: [1.2, 2.4], twinkle: [0.8, 1.6], rest: [0.5, 3], alpha: 0.7 },
        { type: 'glints', region: POND_OPEN_WATER, count: 10, size: [0.8, 1.6], twinkle: [1, 2], rest: [2, 6], alpha: 0.45 },
        { type: 'glints', region: POND_WATERFALL_FOOT, count: 4, size: [0.8, 1.4], twinkle: [0.4, 0.9], rest: [0.3, 1.5], alpha: 0.6 },
        { type: 'motes', region: POND_SUNLIT_AIR, count: 14, size: [1.5, 3], drift: [[-14, 14], [-40, -16]], life: [7, 13], alpha: 0.55 },
    ] },
    { id: 'farm', background: 'farm.png', description: 'Sunny farm meadow with a red barn, wooden fences and chicks around the hen', animals: [
        { id: 'cow', x: 20, y: 60, width: 29, anchor: 'feet' },
        { id: 'sheep', x: 72, y: 57, width: 23, anchor: 'feet' },
        { id: 'dog', x: 32, y: 88, width: 17, anchor: 'feet' },
        { id: 'hen', x: 57, y: 87, width: 14, anchor: 'feet' },
        { id: 'rooster', x: 83, y: 86, width: 17, anchor: 'feet' },
    ], effects: [] },
    { id: 'safari', background: 'safari.png', description: 'Golden African savanna with acacia trees and a turquoise watering hole', animals: [
        { id: 'elephant', x: 30, y: 56, width: 29, anchor: 'feet' },
        { id: 'zebra', x: 62, y: 57, width: 20, anchor: 'feet' },
        { id: 'giraffe', x: 85, y: 64, width: 18, anchor: 'feet' },
        { id: 'hippo', x: 17, y: 86, width: 27, anchor: 'feet' },
        { id: 'lion', x: 49, y: 92, width: 23, anchor: 'feet' },
    ], effects: [] },
];
const keys = STORY_SCENES.flatMap(scene => scene.animals.map(animal => `${scene.id}:${animal.id}` as StorySticker));
export const stickerPath = (id: StorySticker): string => `/arcade/assets/stickers/story/${id.replace(':', '-')}.png`;
export function readStoryProgress(raw: string | null): StorySticker[] {
    try {
        const value: unknown = JSON.parse(raw || '[]');
        return Array.isArray(value) ? keys.filter(id => value.includes(id)) : [];
    } catch { return []; }
}
export function addStorySticker(progress: StorySticker[], id: StorySticker): StorySticker[] {
    return keys.filter(sticker => sticker === id || progress.includes(sticker));
}
export function resetSceneProgress(progress: StorySticker[], page: number): StorySticker[] {
    const scene = STORY_SCENES[page];
    return scene ? progress.filter(id => !id.startsWith(`${scene.id}:`)) : [...progress];
}
export function sceneComplete(progress: StorySticker[], page: number): boolean {
    const scene = STORY_SCENES[page];
    return !!scene && scene.animals.every(animal => progress.includes(`${scene.id}:${animal.id}` as StorySticker));
}
export function restoredPage(raw: string | null, progress: StorySticker[]): number {
    const page = Number(raw);
    return Number.isInteger(page) && page > 0 && page < STORY_SCENES.length
        && STORY_SCENES.slice(0, page).every((_, index) => sceneComplete(progress, index)) ? page : 0;
}
