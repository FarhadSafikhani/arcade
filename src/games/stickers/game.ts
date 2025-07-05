import { Application, Container, Graphics, FederatedPointerEvent, Assets } from 'pixi.js';
import { StickerMaker } from './stickermaker';
import { GameDimensions } from '../../shared/utils/shared-types';
import { TOP_BAR_HEIGHT } from '../../shared/utils/shared-consts';

export const STICKER_GAME_CONFIG = {
    gideSizeSmall: 3,
    gideSizeMedium: 5,
    gideSizeLarge: 7,
    snapThreshold: 100,
    visiblePercentage: 0.1
}


// Responsive scaling function
const getGameDimensions = (): GameDimensions => {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const topBarHeight = TOP_BAR_HEIGHT;
    
    return {
        gameWidth: windowWidth,
        gameHeight: windowHeight - topBarHeight, // Subtract top bar height
        topBarHeight: topBarHeight,
        scale: 1
    };
};

export interface StickerGameLevel {
    id: string;
    path: string;
}

export const STICKER_GAME_LEVELS: StickerGameLevel[] = [
    {
        id: 'lion_1',
        path: '/arcade/assets/stickers/lion.png',
    },
    {
        id: 'elephant_1',
        path: '/arcade/assets/stickers/elephant.png'
    },
    {
        id: 'chimp_1',
        path: '/arcade/assets/stickers/chimp.png'
    },
    {
        id: 'husky_1',
        path: '/arcade/assets/stickers/husky.png'
    },
    {
        id: 'panda_1',
        path: '/arcade/assets/stickers/panda.png'
    },
    {
        id: 'tiger_1',
        path: '/arcade/assets/stickers/tiger.png'
    },
    // {
    //     id: 'skibidi_1',
    //     path: '/arcade/assets/stickers/skibidi.png'
    // },
    // {
    //     id: 'emma_1',
    //     path: '/arcade/assets/stickers/emma.png'
    // },
    // {
    //     id: 'ryan_1',
    //     path: '/arcade/assets/stickers/ryan.png'
    // },
    {
        id: 'frog_1',
        path: '/arcade/assets/stickers/frog.png'
    },
    {
        id: 'rooster_1',
        path: '/arcade/assets/stickers/rooster.png'
    },
    {
        id: 'crocodile_1',
        path: '/arcade/assets/stickers/crocodile.png'
    },
    {
        id: 'police_1',
        path: '/arcade/assets/stickers/police.png'
    },
    {
        id: 'barbie_1',
        path: '/arcade/assets/stickers/barbie.png'
    }
]

export interface UserState {
    levelsCompleted: string[];
}
export const userState: UserState = {
    levelsCompleted: []
}

export class StickersGame {
    private app: Application;
    private gameContainer: Container;
    private stickerMaker: StickerMaker;
    private removeTopBarHandler?: () => void;
    private gameDimensions: GameDimensions;
    private userState: UserState;

    constructor(app: Application) {
        this.app = app;
        this.gameContainer = new Container();
        this.gameDimensions = getGameDimensions();
        this.stickerMaker = new StickerMaker(this.app, this, this.gameContainer, this.gameDimensions.gameWidth, this.gameDimensions.gameHeight);
        this.app.stage.addChild(this.gameContainer);
        this.userState = this.loadUserState();

        // Set up global pointer events
        this.setupGlobalPointerEvents();
    }

    async init(): Promise<void> {

        // Create game background
        this.createBackground();
        this.setupTopBarEvents();

        //preload the star for later use
        ///arcade/assets/stickers/star.png
        await Assets.load('/arcade/assets/stickers/star.png');
        
        // Preload all level assets
        for (const level of STICKER_GAME_LEVELS) {
            await Assets.load(level.path);
        }

        // Show level menu initially
        this.showLevelMenu();
        this.populateLevelMenu();

        // Setup return button event
        this.setupReturnButton();

        // Setup click outside handler for difficulty buttons
        this.setupClickOutsideHandler();

    }


    public showLevelMenu(): void {
        // Hide game container and show level menu
        this.gameContainer.visible = false;
        const levelMenu = document.getElementById('levelMenu');
        if (levelMenu) {
            levelMenu.classList.remove('hidden');
        }
    }

    public hideLevelMenu(): void {
        // Show game container and hide level menu
        this.gameContainer.visible = true;
        const levelMenu = document.getElementById('levelMenu');
        if (levelMenu) {
            levelMenu.classList.add('hidden');
        }
    }

    private hideOtherDifficultyButtons(currentCard: HTMLElement): void {
        // Hide difficulty buttons from all other cards
        const allCards = document.querySelectorAll('.level-card');
        allCards.forEach(card => {
            if (card !== currentCard) {
                card.classList.remove('show-buttons');
            }
        });
    }

    private toggleDifficultyButtons(clickedCard: HTMLElement): void {
        const isCurrentlyShowing = clickedCard.classList.contains('show-buttons');
        
        // Hide all difficulty buttons first
        const allCards = document.querySelectorAll('.level-card');
        allCards.forEach(card => {
            card.classList.remove('show-buttons');
        });

        // Show buttons for the clicked card only if it wasn't already showing
        if (!isCurrentlyShowing) {
            clickedCard.classList.add('show-buttons');
        }
    }

    private setupClickOutsideHandler(): void {
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            
            // Check if click is outside any level card
            if (!target.closest('.level-card')) {
                // Hide all difficulty buttons
                const allCards = document.querySelectorAll('.level-card');
                allCards.forEach(card => {
                    card.classList.remove('show-buttons');
                });
            }
        });
    }

    public populateLevelMenu(): void {
        const levelGrid = document.getElementById('levelGrid');
        if (!levelGrid) return;

        // Clear existing content
        levelGrid.innerHTML = '';

        // Create level cards
        STICKER_GAME_LEVELS.forEach((level) => {
            const isCompleted = this.userState.levelsCompleted.includes(level.id);
            
            const levelCard = document.createElement('div');
            levelCard.className = `level-card ${isCompleted ? 'completed' : ''}`;
            levelCard.dataset.levelId = level.id;
            
            const levelImage = document.createElement('img');
            levelImage.className = 'level-image';
            levelImage.src = level.path;
            levelImage.alt = `Level ${level.id}`;
            
            levelCard.appendChild(levelImage);
            
            // Create difficulty buttons container
            const difficultyButtons = document.createElement('div');
            difficultyButtons.className = 'difficulty-buttons';
            
            // Easy button (3x3)
            const easyBtn = document.createElement('button');
            easyBtn.className = 'difficulty-btn easy';
            easyBtn.textContent = '3x3';
            easyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.startLevel(level, STICKER_GAME_CONFIG.gideSizeSmall);
            });
            
            // Medium button (5x5)
            const mediumBtn = document.createElement('button');
            mediumBtn.className = 'difficulty-btn medium';
            mediumBtn.textContent = '5x5';
            mediumBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.startLevel(level, STICKER_GAME_CONFIG.gideSizeMedium);
            });
            
            // Hard button (7x7)
            const hardBtn = document.createElement('button');
            hardBtn.className = 'difficulty-btn hard';
            hardBtn.textContent = '7x7';
            hardBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.startLevel(level, STICKER_GAME_CONFIG.gideSizeLarge);
            });
            
            difficultyButtons.appendChild(easyBtn);
            difficultyButtons.appendChild(mediumBtn);
            difficultyButtons.appendChild(hardBtn);
            
            levelCard.appendChild(difficultyButtons);
            
            // Add hover handler to hide other cards' buttons
            levelCard.addEventListener('mouseenter', () => {
                this.hideOtherDifficultyButtons(levelCard);
            });
            
            // Add click handler for the whole card (show difficulty options)
            levelCard.addEventListener('click', (e) => {
                // Only handle if we didn't click on a button
                if (!(e.target as HTMLElement).classList.contains('difficulty-btn')) {
                    this.toggleDifficultyButtons(levelCard);
                    
                    // Scroll card into view with some padding
                    setTimeout(() => {
                        levelCard.scrollIntoView({ 
                            behavior: 'smooth', 
                            block: 'center'
                        });
                    }, 100);
                }
            });
            
            levelGrid.appendChild(levelCard);
        });
    }

    public async startLevel(level: StickerGameLevel, gridSize: number): Promise<void> {
        // Hide level menu and return button, show game
        this.hideLevelMenu();
        this.hideReturnButton();
        
        // Clean up any existing game state
        this.stickerMaker.cleanup();
        
        this.createBackground();
        
        // Start the level
        await this.stickerMaker.createSticker(level, gridSize);
    }

    private loadUserState(): UserState {
        const userStateString = localStorage.getItem('userState');
        return userStateString ? JSON.parse(userStateString) : { levelsCompleted: [] };
    }

    public setLevelCompleted(levelId: string): void {
        if (!this.userState.levelsCompleted.includes(levelId)) {
            this.userState.levelsCompleted.push(levelId);
            this.saveUserState();
        }
    }

    public returnToLevelMenu(): void {
        // Clean up current game state
        this.stickerMaker.cleanup();
        
        // Clear game container
        this.gameContainer.removeChildren();
        
        // Hide return button and show level menu
        this.hideReturnButton();
        this.showLevelMenu();
        this.populateLevelMenu();
    }

    private setupReturnButton(): void {
        const returnButton = document.getElementById('returnButton');
        if (returnButton) {
            returnButton.addEventListener('click', () => {
                this.returnToLevelMenu();
            });
        }
    }

    public showReturnButton(): void {
        const returnButton = document.getElementById('returnButton');
        if (returnButton) {
            returnButton.classList.remove('hidden');
        }
    }

    public hideReturnButton(): void {
        const returnButton = document.getElementById('returnButton');
        if (returnButton) {
            returnButton.classList.add('hidden');
        }
    }

    private saveUserState(): void {
        localStorage.setItem('userState', JSON.stringify(this.userState));
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
                if (this.gameContainer.visible) {
                    this.returnToLevelMenu();
                } else {
                    this.returnToMainMenu();
                }
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
        
        // Clean up game state first
        this.stickerMaker.cleanup();
        
        // Clean up PIXI resources
        this.app.stage.removeChild(this.gameContainer);
        this.gameContainer.destroy({ children: true });
    }

    returnToMainMenu(): void {
        window.location.href = '/arcade/';
    }

    onResize(): void {

        this.gameDimensions = getGameDimensions();
    
        // Resize the PIXI renderer itself, not just the CSS
        this.app.renderer.resize(this.gameDimensions.gameWidth, this.gameDimensions.gameHeight);
        
        // Update the stickerMaker dimensions
        this.stickerMaker.gameWidth = this.gameDimensions.gameWidth;
        this.stickerMaker.gameHeight = this.gameDimensions.gameHeight;

        // Clamp chunks to new screen bounds
        this.stickerMaker.clampChunksToScreen();
    }

    private setupGlobalPointerEvents(): void {
        this.app.stage.eventMode = 'static';
            
        this.app.stage.on('pointermove', (event: FederatedPointerEvent) => {
            this.stickerMaker.onMove(event);
        });
        
        this.app.stage.on('pointerup', () => {
            this.stickerMaker.onUp();
        });

        //need to capture mouse up outside of the game
        this.app.stage.on('pointerupoutside', () => {
            this.stickerMaker.onUp();
        });

        // Disable context menu
        (this.app.view as HTMLCanvasElement).oncontextmenu = (e: MouseEvent) => e.preventDefault();
    }

}


window.isInit = false;
// Initialize the game
async function initGame() {
    
    if (window.isInit) {
        console.warn('Game already initialized, skipping...');
        return;
    }

    window.isInit = true;

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

    // Create and initialize game
    const game = new StickersGame(app);
    await game.init();

    // Set up game loop
    app.ticker.add((delta) => {
        game.update(delta);
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        game.onResize();
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


// Hot Module Replacement (HMR) support for Vite
if (import.meta.hot) {
    import.meta.hot.accept(() => {
        console.log('hot reloading.');
        // Re-initialize the game when this module is hot-reloaded
        //initGame();
        window.location.reload();
    });
}



// Global type declarations
declare global {
    interface Window {
        restartGame: () => void;
        returnToMainMenu: () => void;
        resumeGame: () => void;
        togglePause: () => void;
        isInit: boolean;
    }
}