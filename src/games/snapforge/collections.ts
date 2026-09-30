import type { SnapLevel } from './level';

export const collections = [
    { id: 'starter', name: 'Starter Collection' },
    { id: 'farm', name: 'Farm Collection' },
    { id: 'fruit', name: 'Fruit Collection' },
    { id: 'land-animal', name: 'Safari Collection' },
    { id: 'bird', name: 'Bird Collection' },
    { id: 'car', name: 'Car Collection' },
    { id: 'landmarks', name: 'Landmarks Collection' },
    { id: 'ocean', name: 'Ocean Collection' },
    { id: 'dinosaur', name: 'Dinosaur Collection' }
] as const;

export type CollectionId = typeof collections[number]['id'];

export const availableCollections: ReadonlySet<CollectionId> = new Set(['starter', 'farm', 'fruit', 'land-animal', 'bird', 'car', 'landmarks', 'ocean']);

export function collectionLevels(levels: Iterable<SnapLevel>, collection: CollectionId): SnapLevel[] {
    return [...levels].filter(level => level.collection === collection)
        .sort((a, b) => a.order - b.order);
}

export function modelUnlocked(levels: SnapLevel[], index: number, completed: readonly string[]): boolean {
    return index === 0 || index > 0 && completed.includes(levels[index - 1].id);
}
