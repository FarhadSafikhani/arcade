// Game configuration interface
export interface GameConfig {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    available: boolean;
    entryPoint: string;
}

export interface GamesConfig {
    games: GameConfig[];
}

// Game configurations
export const gamesConfig: GamesConfig = {
    games: [
        {
            id: "snake",
            name: "Snake",
            description: "Classic snake game",
            icon: "🐍",
            color: "#2ecc71",
            available: true,
            entryPoint: "/games/snake/index.html"
        },
        {
            id: "breakout",
            name: "Breakout",
            description: "Classic brick-breaking arcade game",
            icon: "🎾",
            color: "#f39c12",
            available: true,
            entryPoint: "/games/breakout/index.html"
        },
        {
            id: "memory",
            name: "Memory",
            description: "Classic memory game",
            icon: "👀",
            color: "#2ecc71",
            available: true,
            entryPoint: "/games/memory/index.html"
        }
    ]
}; 