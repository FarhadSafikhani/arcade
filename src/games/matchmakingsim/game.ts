import { Application, Container, Graphics, Text } from 'pixi.js';

// Game constants
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

export class MatchMakingSimGame {
    private app: Application;
    private gameContainer: Container;
    private queueSize: number = 0;
    private matchCount: number = 0;
    private isGameOver: boolean = false;
    private isPaused: boolean = false;
    private isWaitingToStart: boolean = true;
    private removeInputHandler?: () => void;
    private removeTopBarHandler?: () => void;

    constructor(app: Application) {
        this.app = app;
        this.gameContainer = new Container();
        this.app.stage.addChild(this.gameContainer);
    }

    async init(): Promise<void> {
        // Create game background
        this.createBackground();
        
        // Set up input handling
        this.setupInput();
        this.setupTopBarEvents();
        this.setupStartScreen();
        
        // Initialize UI
        this.updateUI();
    }

    private createBackground(): void {
        const background = new Graphics();
        background.beginFill(0x2c3e50);
        background.drawRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
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

    private setupInput(): void {
        const handleKeydown = (event: KeyboardEvent) => {
            if (this.isGameOver) return;
            
            switch (event.key) {
                case ' ':
                case 'Escape':
                    event.preventDefault();
                    this.togglePause();
                    break;
            }
        };

        document.addEventListener('keydown', handleKeydown);
        
        this.removeInputHandler = () => {
            document.removeEventListener('keydown', handleKeydown);
        };
    }

    private setupStartScreen(): void {
        const startText = new Text('Click to Start Matchmaking Simulation', {
            fontSize: 24,
            fill: 0xffffff,
            fontFamily: 'Arial'
        });
        startText.x = GAME_WIDTH / 2 - startText.width / 2;
        startText.y = GAME_HEIGHT / 2 - startText.height / 2;
        
        this.gameContainer.addChild(startText);

        const startGame = () => {
            this.isWaitingToStart = false;
            this.gameContainer.removeChild(startText);
            // Start simulation logic here
        };

        // Add click/touch listener for starting
        this.gameContainer.interactive = true;
        this.gameContainer.on('pointerdown', startGame);
    }

    update(delta: number): void {
        if (this.isGameOver || this.isPaused || this.isWaitingToStart) return;
        
        // Simulation update logic will go here
    }

    private gameOver(): void {
        this.isGameOver = true;
        this.showGameOver();
    }

    private showGameOver(): void {
        const gameOverDiv = document.getElementById('gameOver');
        const finalScoreSpan = document.getElementById('finalScore');
        
        if (gameOverDiv && finalScoreSpan) {
            finalScoreSpan.textContent = this.matchCount.toString();
            gameOverDiv.style.display = 'block';
        }
    }

    togglePause(): void {
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            this.showPauseMenu();
        } else {
            this.hidePauseMenu();
        }
    }

    private showPauseMenu(): void {
        const pauseMenu = document.getElementById('pauseMenu');
        if (pauseMenu) {
            pauseMenu.style.display = 'block';
        }
    }

    private hidePauseMenu(): void {
        const pauseMenu = document.getElementById('pauseMenu');
        if (pauseMenu) {
            pauseMenu.style.display = 'none';
        }
    }

    private updateUI(): void {
        const queueElement = document.getElementById('queueSize');
        const matchElement = document.getElementById('matchCount');
        
        if (queueElement) queueElement.textContent = this.queueSize.toString();
        if (matchElement) matchElement.textContent = this.matchCount.toString();
    }

    restart(): void {
        this.queueSize = 0;
        this.matchCount = 0;
        this.isGameOver = false;
        this.isPaused = false;
        this.isWaitingToStart = true;
        
        // Hide game over screen
        const gameOverDiv = document.getElementById('gameOver');
        if (gameOverDiv) {
            gameOverDiv.style.display = 'none';
        }
        
        // Clear and reinitialize
        this.gameContainer.removeChildren();
        this.init();
    }

    resume(): void {
        this.isPaused = false;
        this.hidePauseMenu();
    }

    destroy(): void {
        if (this.removeInputHandler) {
            this.removeInputHandler();
        }
        if (this.removeTopBarHandler) {
            this.removeTopBarHandler();
        }
        
        this.gameContainer.destroy();
    }

    returnToMainMenu(): void {
        this.destroy();
        window.location.href = '/arcade/';
    }
}

// Game initialization
let game: MatchMakingSimGame;

function updateCanvasScaling() {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    
    const container = document.getElementById('gameContainer');
    if (!container) return;
    
    const containerRect = container.getBoundingClientRect();
    const availableWidth = containerRect.width;
    const availableHeight = containerRect.height;
    
    const scaleX = availableWidth / GAME_WIDTH;
    const scaleY = availableHeight / GAME_HEIGHT;
    const scale = Math.min(scaleX, scaleY);
    
    canvas.style.width = `${GAME_WIDTH * scale}px`;
    canvas.style.height = `${GAME_HEIGHT * scale}px`;
    canvas.style.display = 'block';
    canvas.style.margin = '0 auto';
}

async function initGame() {
    try {
        const app = new Application({
            width: GAME_WIDTH,
            height: GAME_HEIGHT,
            backgroundColor: 0x2c3e50,
            antialias: true
        });

        const gameContainer = document.getElementById('gameContainer');
        if (!gameContainer) {
            throw new Error('Game container not found');
        }

        gameContainer.appendChild(app.view as HTMLCanvasElement);
        
        game = new MatchMakingSimGame(app);
        await game.init();
        
        app.ticker.add(gameLoop);
        
        updateCanvasScaling();
        window.addEventListener('resize', updateCanvasScaling);
        
    } catch (error) {
        console.error('Failed to initialize game:', error);
    }
}

function gameLoop(delta: number) {
    if (game) {
        game.update(delta);
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initGame);

// Global functions for HTML buttons
declare global {
    interface Window {
        restartGame: () => void;
        returnToMainMenu: () => void;
        resumeGame: () => void;
        togglePause: () => void;
    }
}

window.restartGame = () => game?.restart();
window.returnToMainMenu = () => game?.returnToMainMenu();
window.resumeGame = () => game?.resume();
window.togglePause = () => game?.togglePause(); 