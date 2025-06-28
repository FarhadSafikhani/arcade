import { Application, Container, Graphics, Sprite, Texture, Assets } from 'pixi.js';

// Game constants
const BASE_GAME_WIDTH = 800;
const BASE_GAME_HEIGHT = 600;

// Responsive scaling function
const getGameDimensions = () => {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight - 120; // Account for top bar and margins
    
    // Calculate scale to fit within available space while maintaining aspect ratio
    const scaleX = windowWidth / BASE_GAME_WIDTH;
    const scaleY = windowHeight / BASE_GAME_HEIGHT;
    const scale = Math.min(scaleX, scaleY);
    
    return {
        gameWidth: BASE_GAME_WIDTH,
        gameHeight: BASE_GAME_HEIGHT,
        scale
    };
};

export class StickersGame {
    private app: Application;
    private gameContainer: Container;
    private appleSprite!: Sprite;
    private removeTopBarHandler?: () => void;
    private gameDimensions: ReturnType<typeof getGameDimensions>;

    constructor(app: Application) {
        this.app = app;
        this.gameContainer = new Container();
        this.app.stage.addChild(this.gameContainer);
        
        // Get initial dimensions
        this.gameDimensions = getGameDimensions();
    }

    async init(): Promise<void> {
        // Load assets
        await this.loadAssets();
        
        // Create game background
        this.createBackground();
        
        // Create apple sprite
        await this.createApple();
        
        // Set up top bar events
        this.setupTopBarEvents();
    }

    // Load all assets
    private async loadAssets(): Promise<void> {
        await Assets.load('/arcade/assets/stickers/1-apple.png');
        // Add more assets here:
        // await Assets.load('/arcade/assets/stickers/banana.png');
    }

    private createBackground(): void {
        const background = new Graphics();
        background.beginFill(0xffffff); // White background
        background.drawRect(0, 0, this.gameDimensions.gameWidth, this.gameDimensions.gameHeight);
        background.endFill();
        
        this.gameContainer.addChild(background);
    }

    private async createApple(): Promise<void> {
        // Load the apple texture
        const appleTexture = await Assets.load('/arcade/assets/stickers/1-apple.png');
        
        // Create sprite from the texture
        this.appleSprite = new Sprite(appleTexture);
        
        // Center the sprite
        this.appleSprite.anchor.set(0.5, 0.5);
        this.appleSprite.position.set(
            this.gameDimensions.gameWidth / 2,
            this.gameDimensions.gameHeight / 2
        );
        
        this.gameContainer.addChild(this.appleSprite);
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
}

// Canvas scaling function
function updateCanvasScaling() {
    const canvas = document.querySelector('canvas');
    if (canvas) {
        const gameDimensions = getGameDimensions();
        canvas.style.width = `${gameDimensions.gameWidth * gameDimensions.scale}px`;
        canvas.style.height = `${gameDimensions.gameHeight * gameDimensions.scale}px`;
    }
}

// Initialize the game
async function initGame() {
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