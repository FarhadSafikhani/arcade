import { Application, Container, Graphics, FederatedPointerEvent, Assets } from 'pixi.js';
import { StickerMaker } from './stickermaker';
import { GameDimensions } from '../../shared/utils/shared-types';
import { StickerStorybook } from './storybook';
import { StorySticker, stickerPath } from './story-state';

export const STICKER_GAME_CONFIG = {
    gideSizeSmall: 3,
    gideSizeMedium: 5,
    gideSizeLarge: 7,
    snapThreshold: 132.25,
    visiblePercentage: 0.1
}


// Responsive scaling function
const headerHeight = (): number =>
    document.querySelector('.stickers-header')?.getBoundingClientRect().height || 56;

const getGameDimensions = (): GameDimensions => {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const topBarHeight = headerHeight();
    
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
    },
    {
        id: 'grumble_1',
        path: '/arcade/assets/stickers/grumble.png'
    },
    {
        id: 'jaina_1',
        path: '/arcade/assets/stickers/jaina.png'
    },
    {
        id: 'princess_emma_1',
        path: '/arcade/assets/stickers/princessemma.png'
    },
    {
        id: 'prince_ryan_1',
        path: '/arcade/assets/stickers/princeryan.png'
    },
    {
        id: 'bluewhale_1',
        path: '/arcade/assets/stickers/bluewhale.png'
    },
    {
        id: 'gecko_1',
        path: '/arcade/assets/stickers/gecko.png'
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
    private gameDimensions: GameDimensions;
    private userState: UserState;
    private levelRequest = 0;
    private background: Graphics | null = null;
    private storybook!: StickerStorybook;
    private storySticker: StorySticker | null = null;
    private storyCompleted = false;
    private storyReturnTimer: ReturnType<typeof setTimeout> | null = null;
    private inBook = true;
    private devPanel: HTMLDetailsElement | null = null;

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
        this.setupBackButton();
        if (import.meta.env.DEV) this.installDevPanel();

        // Show level menu immediately
        this.showLevelMenu();
        this.populateLevelMenuWithPlaceholders();

        // Setup return button event
        this.setupReturnButton();

        // Setup click outside handler for difficulty buttons
        this.setupClickOutsideHandler();
        this.storybook = new StickerStorybook((id, grid) => {
            this.storySticker = id;
            this.storyCompleted = false;
            void this.startLevel({ id: `scene_${id}`, path: stickerPath(id) }, grid);
        });
        const switcher = document.createElement('button');
        switcher.type = 'button';
        switcher.className = 'story-switch';
        switcher.id = 'storySwitch';
        switcher.textContent = 'Sticker gallery';
        switcher.addEventListener('click', () => {
            if (this.gameContainer.visible) this.returnToLevelMenu();
            this.inBook = !this.inBook;
            this.showLevelMenu();
        });
        const navigation = document.createElement('div');
        navigation.className = 'story-nav';
        const difficulty = document.createElement('select');
        difficulty.id = 'storyDifficulty';
        difficulty.setAttribute('aria-label', 'Puzzle difficulty');
        difficulty.innerHTML = '<option value="3">Easy</option><option value="5">Medium</option><option value="7">Hard</option>';
        difficulty.addEventListener('change', () => {
            if (!this.storySticker || !this.gameContainer.visible) return;
            this.storyCompleted = false;
            void this.startLevel({ id: `scene_${this.storySticker}`, path: stickerPath(this.storySticker) }, Number(difficulty.value));
        });
        navigation.append(difficulty, switcher);
        document.querySelector('.stickers-header')?.appendChild(navigation);
        this.showLevelMenu();

        // Load assets in background and update cards as they load
        this.loadAssetsProgressively();

    }


    public showLevelMenu(): void {
        if (this.devPanel) this.devPanel.hidden = true;
        // Hide game container and show level menu
        this.gameContainer.visible = false;
        const levelMenu = document.getElementById('levelMenu');
        if (levelMenu) {
            levelMenu.classList.toggle('hidden', this.inBook);
        }
        if (this.storybook) {
            if (this.inBook) this.storybook.show();
            else this.storybook.hide();
        }
        const switcher = document.getElementById('storySwitch');
        if (switcher) switcher.textContent = this.inBook ? 'Sticker gallery' : 'Storybook';
        const difficulty = document.getElementById('storyDifficulty');
        if (difficulty) difficulty.hidden = !this.inBook;
        this.updateBackButton();
    }

    public hideLevelMenu(): void {
        this.storybook?.hide();
        // Show game container and hide level menu
        this.gameContainer.visible = true;
        const levelMenu = document.getElementById('levelMenu');
        if (levelMenu) {
            levelMenu.classList.add('hidden');
        }
        this.updateBackButton();
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

    public populateLevelMenuWithPlaceholders(): void {
        const levelGrid = document.getElementById('levelGrid');
        if (!levelGrid) return;

        // Clear existing content
        levelGrid.innerHTML = '';

        // Create level cards with placeholders
        STICKER_GAME_LEVELS.forEach((level) => {
            const isCompleted = this.userState.levelsCompleted.includes(level.id);
            
            const levelCard = document.createElement('div');
            levelCard.className = `level-card ${isCompleted ? 'completed' : ''}`;
            levelCard.dataset.levelId = level.id;

            const art = document.createElement('div');
            art.className = 'level-art';
            
            const levelImage = document.createElement('img');
            levelImage.className = 'level-image';
            levelImage.alt = `Level ${level.id}`;
            
            // Check if asset is already loaded
            const isAssetLoaded = Assets.cache.has(level.path);
            
            if (isAssetLoaded) {
                // Asset is already loaded, show immediately
                levelImage.src = level.path;
                levelImage.style.opacity = '1';
                art.appendChild(levelImage);
            } else {
                // Asset not loaded yet, show placeholder
                levelImage.classList.add('loading');
                
                const placeholderDiv = document.createElement('div');
                placeholderDiv.className = 'level-placeholder';
                placeholderDiv.textContent = '⏳';
                
                art.appendChild(placeholderDiv);
                art.appendChild(levelImage);
            }

            levelCard.appendChild(art);
            this.createDifficultyButtons(levelCard, level);
            
            levelGrid.appendChild(levelCard);
        });
    }

    private async loadAssetsProgressively(): Promise<void> {
        // Load star asset first
        await Assets.load('/arcade/assets/stickers/star.png');
        
        // Load level assets one by one
        for (const level of STICKER_GAME_LEVELS) {
            try {
                await Assets.load(level.path);
                this.updateLevelCard(level);
            } catch (error) {
                console.error(`Failed to load asset for level ${level.id}:`, error);
                this.updateLevelCardWithError(level);
            }
        }
    }

    private updateLevelCard(level: StickerGameLevel): void {
        const levelCard = document.querySelector(`[data-level-id="${level.id}"]`) as HTMLElement;
        if (!levelCard) return;

        const levelImage = levelCard.querySelector('.level-image') as HTMLImageElement;
        const placeholder = levelCard.querySelector('.level-placeholder') as HTMLElement;

        if (levelImage && placeholder) {
            levelImage.src = level.path;
            levelImage.onload = () => {
                // Fade in the image
                levelImage.classList.remove('loading');
                levelImage.style.opacity = '1';
                
                // Fade out the placeholder
                placeholder.style.opacity = '0';
                placeholder.style.display = 'none';
            };
        }
    }

    private updateLevelCardWithError(level: StickerGameLevel): void {
        const levelCard = document.querySelector(`[data-level-id="${level.id}"]`) as HTMLElement;
        if (!levelCard) return;

        const placeholder = levelCard.querySelector('.level-placeholder') as HTMLElement;
        if (placeholder) {
            placeholder.textContent = '❌';
            placeholder.style.color = '#ff6b6b';
        }
    }

    private createDifficultyButtons(levelCard: HTMLElement, level: StickerGameLevel): void {
        // Create difficulty buttons container
        const difficultyButtons = document.createElement('div');
        difficultyButtons.className = 'difficulty-buttons';
        
        // Easy button (3x3)
        const easyBtn = document.createElement('button');
        easyBtn.className = 'difficulty-btn easy';
        easyBtn.textContent = '3×3';
        easyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.startLevel(level, STICKER_GAME_CONFIG.gideSizeSmall);
        });
        
        // Medium button (5x5)
        const mediumBtn = document.createElement('button');
        mediumBtn.className = 'difficulty-btn medium';
        mediumBtn.textContent = '5×5';
        mediumBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.startLevel(level, STICKER_GAME_CONFIG.gideSizeMedium);
        });
        
        // Hard button (7x7)
        const hardBtn = document.createElement('button');
        hardBtn.className = 'difficulty-btn hard';
        hardBtn.textContent = '7×7';
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
    }

    public populateLevelMenu(): void {
        // Legacy method - now just calls the new implementation
        this.populateLevelMenuWithPlaceholders();
    }

    public async startLevel(level: StickerGameLevel, gridSize: number): Promise<void> {
        this.cancelStoryReturn();
        if (this.devPanel) this.devPanel.hidden = true;
        const request = ++this.levelRequest;
        this.hideLevelMenu();
        this.hideReturnButton();
        this.stickerMaker.cleanup();
        this.createBackground();
        this.setPreparing(true);
        document.getElementById('levelError')?.setAttribute('hidden', '');
        try {
            // Let the scene and spinner paint before starting CPU/GPU work.
            await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            if (request !== this.levelRequest) return;
            const ready = await this.stickerMaker.createSticker(level, gridSize);
            if (!ready || request !== this.levelRequest) return;
            this.setPreparing(false);
            await this.stickerMaker.revealSticker();
            if (request === this.levelRequest && this.devPanel) this.devPanel.hidden = false;
        } catch (error) {
            if (request !== this.levelRequest) return;
            console.error('Unable to prepare sticker:', error);
            const wasStory = this.storySticker !== null;
            this.returnToLevelMenu();
            if (wasStory) this.storybook.reportError();
            document.getElementById('levelError')?.removeAttribute('hidden');
        }
    }

    private setPreparing(preparing: boolean): void {
        const loading = document.getElementById('stickerLoading');
        if (loading) loading.hidden = !preparing;
        document.getElementById('gameContainer')?.setAttribute('aria-busy', String(preparing));
    }

    private loadUserState(): UserState {
        const userStateString = localStorage.getItem('userState');
        return userStateString ? JSON.parse(userStateString) : { levelsCompleted: [] };
    }

    public setLevelCompleted(levelId: string): void {
        if (this.devPanel) this.devPanel.hidden = true;
        if (this.storySticker && levelId === `scene_${this.storySticker}`) {
            this.storyCompleted = true;
            this.storybook.record(this.storySticker);
            return;
        }
        if (!this.userState.levelsCompleted.includes(levelId)) {
            this.userState.levelsCompleted.push(levelId);
            this.saveUserState();
        }
    }

    public finishStorySticker(): boolean {
        if (!this.storySticker) return false;
        const request = this.levelRequest;
        this.cancelStoryReturn();
        this.storyReturnTimer = setTimeout(() => {
            this.storyReturnTimer = null;
            if (request === this.levelRequest) this.returnToLevelMenu();
        }, 500);
        return true;
    }

    private cancelStoryReturn(): void {
        if (this.storyReturnTimer !== null) clearTimeout(this.storyReturnTimer);
        this.storyReturnTimer = null;
    }

    public returnToLevelMenu(): void {
        this.cancelStoryReturn();
        this.levelRequest++;
        this.setPreparing(false);
        // Clean up current game state
        this.stickerMaker.cleanup();
        
        // Clear game container
        this.gameContainer.removeChildren();
        
        // Hide return button and show level menu
        this.hideReturnButton();
        this.showLevelMenu();
        this.populateLevelMenu();
        if (this.storySticker && this.storyCompleted) this.storybook.place(this.storySticker);
        this.storySticker = null;
        this.storyCompleted = false;
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
            returnButton.textContent = this.storySticker ? '↗' : 'Return to Menu';
            returnButton.setAttribute('aria-label', this.storySticker ? 'Place sticker in scene' : 'Return to menu');
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
        this.background?.destroy();
        const background = new Graphics();
        background.beginFill(0xffffff); // White background
        background.drawRect(0, 0, this.gameDimensions.gameWidth, this.gameDimensions.gameHeight);
        background.endFill();
        
        this.gameContainer.addChild(background);
        this.background = background;
    }

    private setupBackButton(): void {
        const button = document.getElementById('backButton');
        if (!(button instanceof HTMLButtonElement)) return;

        button.addEventListener('click', () => {
            if (this.gameContainer.visible) {
                this.returnToLevelMenu();
            } else {
                this.returnToMainMenu();
            }
        });
    }

    private updateBackButton(): void {
        const button = document.getElementById('backButton');
        const label = document.getElementById('backLabel');
        if (!(button instanceof HTMLButtonElement) || !label) return;

        const inPuzzle = this.gameContainer.visible;
        label.textContent = inPuzzle ? (this.inBook ? 'Book' : 'Menu') : 'Arcade';
        button.setAttribute('aria-label', inPuzzle ? 'Back to puzzle menu' : 'Back to arcade');
    }

    update(_delta: number): void {
        // Game update logic can be added here
    }

    destroy(): void {
        this.cancelStoryReturn();
        this.devPanel?.remove();
        this.storybook?.destroy();
        this.levelRequest++;
        this.setPreparing(false);
        // Clean up game state first
        this.stickerMaker.cleanup();
        
        // Clean up PIXI resources
        this.app.stage.removeChild(this.gameContainer);
        this.gameContainer.destroy({ children: true });
    }

    private installDevPanel(): void {
        const panel = document.createElement('details');
        panel.className = 'stickers-dev-panel';
        panel.hidden = true;
        const toggle = document.createElement('summary');
        toggle.textContent = '[DEV]';
        const actions = document.createElement('div');
        for (const [label, action] of [
            ['Snap a part in place', () => this.stickerMaker.snapNextPart()],
            ['Finish puzzle', () => {
                while (this.stickerMaker.snapNextPart()) { /* Place remaining parts. */ }
            }],
        ] as const) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.addEventListener('click', action);
            actions.appendChild(button);
        }
        panel.append(toggle, actions);
        document.body.appendChild(panel);
        this.devPanel = panel;
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
        isInit: boolean;
    }
}
