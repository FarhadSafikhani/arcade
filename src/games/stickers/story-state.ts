import type { EffectSpec } from './ambient/effects';
import type { Region } from './ambient/types';

type PondAnimal = 'duck' | 'swan' | 'heron' | 'raccoon';
type FarmAnimal = 'cow' | 'sheep' | 'dog' | 'hen' | 'rooster';
type SafariAnimal = 'lion' | 'hippo' | 'elephant' | 'zebra' | 'giraffe';
interface SceneSubjects {
    pond: PondAnimal;
    farm: FarmAnimal;
    safari: SafariAnimal;
    bakery: 'croissant' | 'cupcake' | 'baker-cat' | 'steaming-bread';
    castle: 'princess' | 'knight' | 'fluffy-dog' | 'cake';
    underwater: 'octopus' | 'treasure-chest' | 'seahorse' | 'ancient-statue';
    orchard: 'apple-basket' | 'hedgehog' | 'scarecrow' | 'falling-leaves';
    pirate: 'blackbeard' | 'ship' | 'treasure-chest' | 'first-mate';
    jurassic: 'brachiosaurus' | 'triceratops' | 't-rex' | 'pterodactyl';
}
export type SceneId = keyof SceneSubjects;
export type StorySticker = { [Scene in SceneId]: `${Scene}:${SceneSubjects[Scene]}` }[SceneId];
export const STORY_SAVE_KEY = 'stickers:painted-pond:v1';
export const STORY_PAGE_KEY = `${STORY_SAVE_KEY}:page`;

export interface StoryScene {
    id: SceneId;
    background: string;
    description: string;
    animals: { id: SceneSubjects[SceneId]; x: number; y: number; width: number; anchor?: 'feet' }[];
    /** Every page needs ambience above the painting, below the stickers. */
    effects: readonly [EffectSpec, ...EffectSpec[]];
}

// Traced over pond.png: open water between the lily pads and the right bank.
const POND_OPEN_WATER: Region = [[4, 46], [30, 40], [55, 36], [74, 37], [86, 48], [80, 62], [78, 70], [96, 84], [96, 96], [60, 96], [35, 86], [26, 74], [8, 64]];
const POND_SUN_COLUMN: Region = [[50, 44], [63, 44], [70, 97], [45, 97]];
const POND_WATERFALL_FOOT: Region = [[17, 34], [27, 34], [27, 39], [17, 39]];
const POND_SUNLIT_AIR: Region = [[40, 4], [78, 4], [74, 50], [44, 50]];

// Traced over farm.png: pollen above the meadow and glints on the distant lake.
const FARM_MEADOW_AIR: Region = [[8, 36], [28, 32], [76, 34], [87, 45], [83, 70], [57, 76], [21, 66]];
const FARM_LAKE: Region = [[55, 24], [69, 24], [76, 25], [74, 27], [61, 28], [58, 26]];

// Traced inside safari.png's watering hole, leaving room for rings before the shore.
const SAFARI_OPEN_WATER: Region = [[3, 55], [18, 55], [31, 57], [42, 60], [43, 62], [36, 64], [32, 67], [23, 69], [13, 70], [3, 67]];
const SAFARI_DUST_AIR: Region = [[23, 36], [74, 36], [85, 47], [78, 72], [57, 78], [43, 62], [30, 49]];

// Traced over the new paintings: window-lit air stays above the bakery counter
// and in the castle hall; underwater motes sit between the submerged columns.
const BAKERY_WINDOW_AIR: Region = [[8, 12], [27, 9], [48, 37], [44, 59], [19, 58], [9, 35]];
const CASTLE_WINDOW_AIR: Region = [[9, 8], [23, 8], [46, 39], [58, 68], [26, 66], [12, 42]];
const UNDERWATER_OPEN_WATER: Region = [[22, 12], [75, 8], [84, 35], [73, 60], [62, 48], [43, 44], [27, 61], [21, 39]];
const ORCHARD_POLLEN_AIR: Region = [[20, 27], [46, 32], [77, 32], [82, 52], [73, 71], [33, 68], [19, 48]];
const ORCHARD_DISTANT_LAKE: Region = [[38, 30], [49, 29], [62, 29], [61, 31], [43, 33], [39, 32]];
// Keep cove rings and glints above the curved surf, away from rocks and sand.
const PIRATE_OPEN_WATER: Region = [[36, 43], [73, 40], [98, 42], [96, 50], [88, 54], [81, 61], [67, 62], [52, 56], [37, 50]];
const PIRATE_SHORE_AIR: Region = [[9, 40], [26, 40], [37, 60], [60, 73], [46, 81], [19, 68]];
// Jurassic lake lies behind the clearing; the distant meteor is in the painting.
const JURASSIC_LAKE: Region = [[34, 49], [49, 47], [57, 49], [68, 48], [80, 49], [79, 53], [63, 55], [46, 54], [33, 52]];
const JURASSIC_CLEARING_AIR: Region = [[13, 39], [30, 37], [52, 43], [76, 38], [84, 58], [71, 75], [36, 72], [17, 57]];

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
    ], effects: [
        { type: 'rays', origin: [11, 2], color: '#fff3c7', reach: 90, beams: [
            { angle: -12, spread: 6, alpha: 0.1 },
            { angle: -29, spread: 9, alpha: 0.08 },
            { angle: -45, spread: 6, alpha: 0.06 },
        ] },
        { type: 'motes', region: FARM_MEADOW_AIR, count: 22, size: [1.5, 3], drift: [[10, 30], [-30, -12]], life: [8, 14], color: '#fff2ba', alpha: 0.4 },
        { type: 'glints', region: FARM_LAKE, count: 7, size: [0.6, 1.1], twinkle: [1, 2], rest: [1.5, 4], alpha: 0.45 },
    ] },
    { id: 'safari', background: 'safari.png', description: 'Golden African savanna with acacia trees and a turquoise watering hole', animals: [
        { id: 'elephant', x: 32, y: 54, width: 29, anchor: 'feet' },
        { id: 'zebra', x: 64, y: 57, width: 20, anchor: 'feet' },
        { id: 'giraffe', x: 85, y: 64, width: 18, anchor: 'feet' },
        { id: 'hippo', x: 29.35, y: 86, width: 29.7, anchor: 'feet' },
        { id: 'lion', x: 60, y: 92, width: 23, anchor: 'feet' },
    ], effects: [
        { type: 'rays', origin: [3, 2], color: '#ffe6a0', reach: 95, sway: 1, beams: [
            { angle: -17, spread: 7, alpha: 0.11 },
            { angle: -35, spread: 10, alpha: 0.08 },
            { angle: -52, spread: 6, alpha: 0.06 },
        ] },
        { type: 'motes', region: SAFARI_DUST_AIR, count: 18, size: [1.2, 2.5], drift: [[18, 42], [-14, -4]], life: [9, 16], color: '#ffdfa0', alpha: 0.35 },
        { type: 'ripples', region: SAFARI_OPEN_WATER, every: [3, 5.5], life: [3.5, 5], radius: [1.3, 2.6], color: 0xbfeff1, alpha: 0.22 },
        { type: 'glints', region: SAFARI_OPEN_WATER, count: 16, size: [0.8, 1.7], twinkle: [0.8, 1.6], rest: [1, 4], color: 0xfff1cc, alpha: 0.6 },
    ] },
    { id: 'bakery', background: 'bakery.png', description: 'Cozy sunlit bakery with a glowing brick oven and a wooden pastry counter', animals: [
        { id: 'croissant', x: 26, y: 84, width: 19, anchor: 'feet' },
        { id: 'cupcake', x: 52, y: 83, width: 13, anchor: 'feet' },
        { id: 'baker-cat', x: 27, y: 64, width: 15, anchor: 'feet' },
        { id: 'steaming-bread', x: 77, y: 85, width: 21, anchor: 'feet' },
    ], effects: [
        { type: 'rays', origin: [19, 8], color: '#fff2cb', reach: 75, beams: [
            { angle: -18, spread: 6, alpha: 0.08 },
            { angle: -37, spread: 8, alpha: 0.06 },
        ] },
        { type: 'motes', region: BAKERY_WINDOW_AIR, count: 12, size: [1, 2.2], drift: [[4, 18], [-18, -6]], life: [10, 17], color: '#ffe8bb', alpha: 0.25 },
    ] },
    { id: 'castle', background: 'castle.png', description: 'Rose-filled fairytale castle hall with golden window light and an ornate cake table', animals: [
        { id: 'princess', x: 38, y: 87, width: 22, anchor: 'feet' },
        { id: 'knight', x: 77, y: 76, width: 18, anchor: 'feet' },
        { id: 'fluffy-dog', x: 57, y: 91, width: 15, anchor: 'feet' },
        { id: 'cake', x: 12.8, y: 55.7, width: 16.5, anchor: 'feet' },
    ], effects: [
        { type: 'rays', origin: [11, 7], color: '#fff0ca', reach: 85, beams: [
            { angle: -19, spread: 7, alpha: 0.08 },
            { angle: -38, spread: 9, alpha: 0.06 },
        ] },
        { type: 'motes', region: CASTLE_WINDOW_AIR, count: 13, size: [1, 2], drift: [[5, 18], [-22, -8]], life: [11, 18], color: '#fff1d0', alpha: 0.25 },
    ] },
    { id: 'underwater', background: 'underwater.png', description: 'Ancient submerged temple with coral, a stone plinth and sunbeams through turquoise water', animals: [
        { id: 'octopus', x: 27, y: 87, width: 25, anchor: 'feet' },
        { id: 'treasure-chest', x: 65, y: 91, width: 21, anchor: 'feet' },
        { id: 'seahorse', x: 78, y: 29, width: 9 },
        { id: 'ancient-statue', x: 57, y: 52, width: 14, anchor: 'feet' },
    ], effects: [
        { type: 'rays', origin: [16, -3], color: '#bcf4e8', reach: 95, sway: 0.7, beams: [
            { angle: -5, spread: 6, alpha: 0.1 },
            { angle: -22, spread: 8, alpha: 0.08 },
            { angle: -38, spread: 5, alpha: 0.05 },
        ] },
        { type: 'motes', region: UNDERWATER_OPEN_WATER, count: 24, size: [1, 2.5], drift: [[-8, 8], [-32, -12]], life: [10, 18], color: '#c5f6ed', alpha: 0.25 },
    ] },
    { id: 'orchard', background: 'orchard.png', description: 'Golden autumn apple orchard with a grassy harvest path and a distant lake', animals: [
        { id: 'apple-basket', x: 28, y: 86, width: 21, anchor: 'feet' },
        { id: 'hedgehog', x: 54, y: 92, width: 13, anchor: 'feet' },
        { id: 'scarecrow', x: 76, y: 70, width: 18, anchor: 'feet' },
        { id: 'falling-leaves', x: 38, y: 29, width: 19 },
    ], effects: [
        { type: 'rays', origin: [17, 4], color: '#ffe6a5', reach: 90, beams: [
            { angle: -12, spread: 7, alpha: 0.09 },
            { angle: -30, spread: 9, alpha: 0.06 },
        ] },
        { type: 'motes', region: ORCHARD_POLLEN_AIR, count: 18, size: [1.2, 2.5], drift: [[16, 35], [-12, -3]], life: [10, 16], color: '#ffe0a3', alpha: 0.28 },
        { type: 'glints', region: ORCHARD_DISTANT_LAKE, count: 5, size: [0.5, 0.9], twinkle: [1.3, 2.5], rest: [2, 5], color: 0xffeed0, alpha: 0.3 },
    ] },
    { id: 'pirate', background: 'pirate.png', description: 'Tropical pirate cove with turquoise open water, lush cliffs and a golden sandy beach', animals: [
        { id: 'ship', x: 69, y: 56, width: 29, anchor: 'feet' },
        { id: 'blackbeard', x: 25, y: 82, width: 20, anchor: 'feet' },
        { id: 'first-mate', x: 50, y: 92, width: 17, anchor: 'feet' },
        { id: 'treasure-chest', x: 76, y: 89, width: 20, anchor: 'feet' },
    ], effects: [
        { type: 'rays', origin: [16, 8], color: '#fff0bd', reach: 90, beams: [
            { angle: -16, spread: 7, alpha: 0.08 },
            { angle: -35, spread: 9, alpha: 0.06 },
        ] },
        { type: 'ripples', region: PIRATE_OPEN_WATER, every: [4, 7], life: [4, 6], radius: [0.8, 1.8], color: 0xbceff0, alpha: 0.15 },
        { type: 'glints', region: PIRATE_OPEN_WATER, count: 18, size: [0.7, 1.5], twinkle: [1, 2], rest: [1.5, 5], color: 0xfff0ce, alpha: 0.4 },
        { type: 'motes', region: PIRATE_SHORE_AIR, count: 10, size: [1, 2], drift: [[14, 30], [-14, -4]], life: [11, 18], color: '#fff0c2', alpha: 0.2 },
    ] },
    { id: 'jurassic', background: 'jurassic.png', description: 'Lush prehistoric valley with a distant lake, volcano and a small meteor streaking across the sky', animals: [
        { id: 'brachiosaurus', x: 23, y: 80, width: 33, anchor: 'feet' },
        { id: 'triceratops', x: 49, y: 93, width: 30, anchor: 'feet' },
        { id: 't-rex', x: 78, y: 82, width: 28, anchor: 'feet' },
        { id: 'pterodactyl', x: 48, y: 13, width: 22 },
    ], effects: [
        { type: 'rays', origin: [16, 12], color: '#ffeab3', reach: 90, beams: [
            { angle: -13, spread: 7, alpha: 0.08 },
            { angle: -32, spread: 9, alpha: 0.06 },
        ] },
        { type: 'motes', region: JURASSIC_CLEARING_AIR, count: 16, size: [1, 2.2], drift: [[8, 24], [-22, -6]], life: [11, 18], color: '#f8e7b0', alpha: 0.25 },
        { type: 'ripples', region: JURASSIC_LAKE, every: [4, 7], life: [3, 5], radius: [0.5, 1], color: 0xc7e9d9, alpha: 0.15 },
        { type: 'glints', region: JURASSIC_LAKE, count: 9, size: [0.6, 1.2], twinkle: [1.2, 2.2], rest: [2, 5], color: 0xffebc0, alpha: 0.35 },
    ] },
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
