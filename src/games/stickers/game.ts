import { Application, Container, Graphics, Sprite, Texture, Assets, Rectangle, RenderTexture } from 'pixi.js';
import { StickerMaker } from './stickermaker';


// Responsive scaling function
const getGameDimensions = () => {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const topBarHeight = 60; // Height of the top bar
    
    return {
        gameWidth: windowWidth,
        gameHeight: windowHeight - topBarHeight, // Subtract top bar height
        scale: 1
    };
};

export class StickersGame {
    private app: Application;
    private gameContainer: Container;
    private stickerMaker: StickerMaker;
    private stickerSprite: Sprite | null = null;
    private removeTopBarHandler?: () => void;
    private gameDimensions: ReturnType<typeof getGameDimensions>;
    private currentlyDraggedPart: Sprite | Graphics | null = null;
    private dragOffset = { x: 0, y: 0 };

    constructor(app: Application) {
        this.app = app;
        this.gameContainer = new Container();
        this.stickerMaker = new StickerMaker(this.app, this.gameContainer);
        this.app.stage.addChild(this.gameContainer);
        
        // Get initial dimensions
        this.gameDimensions = getGameDimensions();
        
        // Set up global pointer events
        this.setupGlobalPointerEvents();
        
        // Set up drag event listener for StickerMaker
        this.setupStickerMakerEvents();
    }

    async init(): Promise<void> {
        // Create game background
        this.createBackground();
        
        // Create StickerMaker and create sticker
        
        this.stickerSprite = await this.stickerMaker.createSticker('/arcade/assets/stickers/lion.png');
        
        // Set up top bar events
        this.setupTopBarEvents();
    }

    private setupStickerMakerEvents(): void {
        document.addEventListener('startDrag', (event: any) => {
            const { sprite, event: pointerEvent } = event.detail;
            this.handleStartDrag(sprite, pointerEvent);
        });
    }

    private handleStartDrag(sprite: Sprite | Graphics, event: any): void {
        if (this.currentlyDraggedPart) return;
        
        console.log('pointerdown');
        this.currentlyDraggedPart = sprite;
        const pos = event.data.getLocalPosition(sprite.parent);
        this.dragOffset.x = pos.x - sprite.position.x;
        this.dragOffset.y = pos.y - sprite.position.y;
        
        // Move sprite to top
        sprite.parent.addChild(sprite);
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
        
        this.app.stage.on('pointermove', (event: any) => {
            if (this.currentlyDraggedPart) {
                const pos = event.data.getLocalPosition(this.currentlyDraggedPart.parent);
                this.currentlyDraggedPart.position.x = pos.x - this.dragOffset.x;
                this.currentlyDraggedPart.position.y = pos.y - this.dragOffset.y;
                //dont allow parts to leave the screen
                if (this.currentlyDraggedPart.position.x < 0) {
                    this.currentlyDraggedPart.position.x = 0;
                }
                if (this.currentlyDraggedPart.position.x > this.gameDimensions.gameWidth - this.currentlyDraggedPart.width) {
                    this.currentlyDraggedPart.position.x = this.gameDimensions.gameWidth - this.currentlyDraggedPart.width;
                }
                if (this.currentlyDraggedPart.position.y < 0) {
                    this.currentlyDraggedPart.position.y = 0;
                }
                if (this.currentlyDraggedPart.position.y > this.gameDimensions.gameHeight - this.currentlyDraggedPart.height) {
                    this.currentlyDraggedPart.position.y = this.gameDimensions.gameHeight - this.currentlyDraggedPart.height;
                }
            }
        });
        
        this.app.stage.on('pointerup', () => {
            if (this.currentlyDraggedPart) {
                this.currentlyDraggedPart.alpha = 1;
                this.currentlyDraggedPart = null;
            }
        });


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