// Game configuration interface
export interface GameConfig {
    id: string;
    name: string;
    description: string;
    icon: string;
    available: boolean;
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
            available: true
        },
        {
            id: "snake",
            name: "Snake",
            description: "Classic snake game",
            icon: "🐍",
            available: true
        },
        {
            id: "breakout",
            name: "Breakout",
            description: "Classic brick-breaking arcade game",
            icon: "🎾",
            available: true
        },
        {
            id: "memory",
            name: "Memory",
            description: "Classic memory game",
            icon: "👀",
            available: true
        },
        {
            id: "archer",
            name: "Archer",
            description: "Physics-based archery game",
            icon: "🏹",
            available: true
        },
        {
            id: "stickers",
            name: "Stickers",
            description: "Interactive sticker game",
            icon: "🍎",
            available: true
        },
        {
            id: "matchmakingsim",
            name: "MatchMaking Sim",
            description: "Multiplayer matchmaking simulation",
            icon: "🎮",
            available: true
        }

    ]
};
