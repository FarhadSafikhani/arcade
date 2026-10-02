export const BIRDS = ['duck', 'swan', 'heron', 'raccoon'] as const;
export type Bird = typeof BIRDS[number];
export type SceneId = 'pond' | 'twilight';
export type StorySticker = `${SceneId}:${Bird}`;
export const STORY_SAVE_KEY = 'stickers:painted-pond:v1';
export const STORY_PAGE_KEY = `${STORY_SAVE_KEY}:page`;
export const STORY_SCENES: { id: SceneId; background: string; birds: { id: Bird; x: number; y: number; width: number }[] }[] = [
    { id: 'pond', background: 'pond.png', birds: [
        { id: 'duck', x: 14, y: 65, width: 21 },
        { id: 'swan', x: 45, y: 46, width: 27 },
        { id: 'heron', x: 78, y: 33, width: 16 },
        { id: 'raccoon', x: 16, y: 12, width: 11.5 },
    ] },
    { id: 'twilight', background: 'twilight.png', birds: [
        { id: 'duck', x: 46, y: 68, width: 20 },
        { id: 'swan', x: 15, y: 46, width: 27 },
        { id: 'heron', x: 78, y: 32, width: 16 },
    ] },
];
const keys = STORY_SCENES.flatMap(scene => scene.birds.map(bird => `${scene.id}:${bird.id}` as StorySticker));
export const stickerPath = (id: StorySticker): string => `/arcade/assets/stickers/story/pond-${id.split(':')[1]}.png`;
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
    return !!scene && scene.birds.every(bird => progress.includes(`${scene.id}:${bird.id}`));
}
export function restoredPage(raw: string | null, progress: StorySticker[]): number {
    const page = Number(raw);
    return Number.isInteger(page) && page > 0 && page < STORY_SCENES.length
        && STORY_SCENES.slice(0, page).every((_, index) => sceneComplete(progress, index)) ? page : 0;
}
