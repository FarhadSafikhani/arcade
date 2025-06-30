import { Application, Container, Graphics, Sprite, FederatedPointerEvent } from 'pixi.js';
import { Chunk, StickerMaker } from './stickermaker';
import { GameDimensions } from '../../shared/utils/shared-types';

export const STICKER_GAME_CONFIG = {
    gideSize: 6,
    snapThreshold: 15
}


// Responsive scaling function
const getGameDimensions = (): GameDimensions => {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const topBarHeight = 60; // Height of the top bar
    
    return {
        gameWidth: windowWidth,
        gameHeight: windowHeight - topBarHeight, // Subtract top bar height
        topBarHeight: topBarHeight,
        scale: 1
    };
};

export class StickersGame {
    private app: Application;
    private gameContainer: Container;
    private stickerMaker: StickerMaker;
    private removeTopBarHandler?: () => void;
    private gameDimensions: GameDimensions;

    constructor(app: Application) {
        this.app = app;
        this.gameContainer = new Container();
        this.gameDimensions = getGameDimensions();
        this.stickerMaker = new StickerMaker(this.app, this.gameContainer, this.gameDimensions.gameWidth, this.gameDimensions.gameHeight);
        this.app.stage.addChild(this.gameContainer);

        // Set up global pointer events
        this.setupGlobalPointerEvents();
    }

    async init(): Promise<void> {
        // Create game background
        this.createBackground();
        

        await this.stickerMaker.createSticker('/arcade/assets/stickers/lion.png');
        
        // Set up top bar events
        this.setupTopBarEvents();
    }

    private createBackground(): void {
        const background = new Graphics();
        background.beginFill(0xffffff); // White background
        background.drawRect(0, 0, this.gameDimensions.gameWidth, this.gameDimensions.gameHeight);
        background.endFill();
        
        this.gameContainer.addChild(background);
    }

    private setupTopBarEvents(): void {
        const handleTopBarEvent = (event: Event) => {
            if (event.type === 'pause') {
                this.togglePause();
            } else if (event.type === 'menu') {
                this.returnToMainMenu();
            }
        };

        document.addEventListener('pause', handleTopBarEvent);
        document.addEventListener('menu', handleTopBarEvent);
        
        this.removeTopBarHandler = () => {
            document.removeEventListener('pause', handleTopBarEvent);
            document.removeEventListener('menu', handleTopBarEvent);
        };
    }

    update(delta: number): void {
        // Game update logic can be added here
    }

    togglePause(): void {
        // Pause logic can be added here
    }

    destroy(): void {
        if (this.removeTopBarHandler) {
            this.removeTopBarHandler();
        }
        
        // Clean up PIXI resources
        this.app.stage.removeChild(this.gameContainer);
        this.gameContainer.destroy({ children: true });
    }

    returnToMainMenu(): void {
        window.location.href = '/arcade/';
    }

    private setupGlobalPointerEvents(): void {
        this.app.stage.eventMode = 'static';
            
        this.app.stage.on('pointermove', (event: FederatedPointerEvent) => {
            this.stickerMaker.onMove(event);
        });
        
        this.app.stage.on('pointerup', () => {
            this.stickerMaker.onUp();
        });

        // Disable context menu
        (this.app.view as HTMLCanvasElement).oncontextmenu = (e: MouseEvent) => e.preventDefault();
    }

}

// Canvas scaling function
function updateCanvasScaling() {
    const canvas = document.querySelector('canvas');
    if (canvas) {
        const gameDimensions = getGameDimensions();
        canvas.style.width = `${gameDimensions.gameWidth}px`;
        canvas.style.height = `${gameDimensions.gameHeight}px`;
    }
}

// Initialize the game
async function initGame() {
    
    // Check if game is already initialized
    const existingCanvas = document.querySelector('#gameContainer canvas');
    if (existingCanvas) {
        console.warn('Game already initialized, skipping...');
        return;
    }
    
    const gameDimensions = getGameDimensions();
    
    // Create PIXI application
    const app = new Application({
        width: gameDimensions.gameWidth,
        height: gameDimensions.gameHeight,
        backgroundColor: 0xffffff,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
    });

    // Add canvas to DOM
    const gameContainer = document.getElementById('gameContainer');
    if (gameContainer) {
        gameContainer.appendChild(app.view as HTMLCanvasElement);
    }

    // Update canvas scaling
    updateCanvasScaling();

    // Create and initialize game
    const game = new StickersGame(app);
    await game.init();

    // Set up game loop
    app.ticker.add((delta) => {
        game.update(delta);
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        updateCanvasScaling();
    });

    // Set up global functions
    window.restartGame = () => {
        // Restart logic can be added here
    };
    
    window.returnToMainMenu = () => {
        game.returnToMainMenu();
    };
    
    window.resumeGame = () => {
        // Resume logic can be added here
    };
    
    window.togglePause = () => {
        game.togglePause();
    };
}

// Game loop
function gameLoop(delta: number) {
    // Main game loop logic
}

// Initialize when page loads
window.addEventListener('load', initGame);

// Global type declarations
declare global {
    interface Window {
        restartGame: () => void;
        returnToMainMenu: () => void;
        resumeGame: () => void;
        togglePause: () => void;
    }
}