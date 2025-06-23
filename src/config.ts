// Game configuration interface
export interface GameConfig {
    id: string;
    name: string;
    description: string;
    icon: string;
    available: boolean;
    entryPoint: string;
}

export interface GamesConfig {
    games: GameConfig[];
}

// Game configurations
// Set available: false to hide a game from the menu
export const gamesConfig: GamesConfig = {
    games: [
        {
            id: "snake",
            name: "Snake",
            description: "Classic snake game",
            icon: "🐍",
            available: true,
            entryPoint: "/games/snake/index.html"
        },
        {
            id: "breakout",
            name: "Breakout",
            description: "Classic brick-breaking arcade game",
            icon: "🎾",
            available: true,
            entryPoint: "/games/breakout/index.html"
        },
        {
            id: "memory",
            name: "Memory",
            description: "Classic memory game",
            icon: "👀",
            available: true,
            entryPoint: "/games/memory/index.html"
        },
        {
            id: "archer",
            name: "Archer",
            description: "Physics-based archery game",
            icon: "🏹",
            available: true,
            entryPoint: "/games/archer/index.html"
        }
        // Example of a disabled game:
        // {
        //     id: "tetris",
        //     name: "Tetris",
        //     description: "Classic tetris game",
        //     icon: "🧩",
        //     available: false,
        //     entryPoint: "/games/tetris/index.html"
        // }
    ]
}; 