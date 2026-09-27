// Game configuration interface
export type GameSection = 'games' | 'legacy';

export interface GameConfig {
    id: string;
    name: string;
    description: string;
    icon: string;
    available: boolean;
    section: GameSection;
    accent?: string;
    /** File name under public/previews/. Featured tiles fall back to the accent panel when this is missing. */
    preview?: string;
}

export interface GamesConfig {
    games: GameConfig[];
}

// Game configurations
// Set available: false to show a disabled "Coming soon" card in the menu
export const gamesConfig: GamesConfig = {
    games: [
        {
            id: "snapforge",
            name: "Snapforge",
            description: "Build little worlds, one snap at a time",
            icon: "🧱",
            available: true,
            section: "games",
            accent: "#e39a4b",
            preview: "snapforge.png"
        },
        {
            id: "stickers",
            name: "Stickers",
            description: "Interactive sticker game",
            icon: "🍎",
            available: true,
            section: "games",
            accent: "#e07a86",
            preview: "stickers.png"
        },
        {
            id: "snake",
            name: "Snake",
            description: "Classic snake game",
            icon: "🐍",
            available: true,
            section: "legacy",
            accent: "#7dba6a"
        },
        {
            id: "breakout",
            name: "Breakout",
            description: "Classic brick-breaking arcade game",
            icon: "🎾",
            available: true,
            section: "legacy",
            accent: "#5aa8c4"
        },
        {
            id: "memory",
            name: "Memory",
            description: "Classic memory game",
            icon: "👀",
            available: true,
            section: "legacy",
            accent: "#c49ad4"
        },
        {
            id: "archer",
            name: "Archer",
            description: "Physics-based archery game",
            icon: "🏹",
            available: true,
            section: "legacy",
            accent: "#d4a15a"
        },
        {
            id: "matchmakingsim",
            name: "MatchMaking Sim",
            description: "Multiplayer matchmaking simulation",
            icon: "🎮",
            available: true,
            section: "legacy",
            accent: "#7a8fd4"
        }
    ]
};
