import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Snake } from './snake';
import { Food } from './food';

// Responsive game constants
const getGameDimensions = () => {
    // 1. Get window dimensions and calculate max workable space
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const maxWorkableWidth = windowWidth - 40; // 20px padding on each side
    const maxWorkableHeight = windowHeight - 250; // More conservative - leave more space for UI
    
    // 2. Determine grid count based on screen size
    const isMobile = windowWidth < 768;
    const gridColumns = isMobile ? 10 : 15;
    let gridRows = isMobile ? 15 : 20;
    
    // 3. Calculate grid size to fit within available space
    const maxGridSizeFromWidth = maxWorkableWidth / gridColumns;
    const maxGridSizeFromHeight = maxWorkableHeight / gridRows;
    let gridSize = Math.floor(Math.min(maxGridSizeFromWidth, maxGridSizeFromHeight));
    
    // 4. Recalculate if the game would overflow and adjust row count
    const gameWidth = gridColumns * gridSize;
    const gameHeight = gridRows * gridSize;
    
    // If game height would overflow, reduce row count
    if (gameHeight > maxWorkableHeight) {
        gridRows = Math.floor(maxWorkableHeight / gridSize);
        // Recalculate grid size with new row count
        const newMaxGridSizeFromHeight = maxWorkableHeight / gridRows;
        gridSize = Math.floor(Math.min(maxGridSizeFromWidth, newMaxGridSizeFromHeight));
    }
    
    // 5. Calculate final game dimensions
    const finalGameWidth = gridColumns * gridSize;
    const finalGameHeight = gridRows * gridSize;
    
    return {
        gridSize,
        gridWidth: gridColumns,
        gridHeight: gridRows,
        gameWidth: finalGameWidth,
        gameHeight: finalGameHeight
    };
};

export class SnakeGame {
    private app: Application;
    private gameContainer: Container;
    private snake!: Snake;
    private food!: Food;
    private score: number = 0;
    private highScore: number = 0;
    private gameSpeed: number = 150; // milliseconds between moves
    private lastMoveTime: number = 0;
    private isGameOver: boolean = false;
    private isPaused: boolean = false;
    private isWaitingToStart: boolean = true;
    private removeInputHandler?: () => void;
    private removeTouchHandler?: () => void;

    // Game constants - will be set dynamically
    private GRID_SIZE: number;
    private GRID_WIDTH: number;
    private GRID_HEIGHT: number;
    private GAME_WIDTH: number;
    private GAME_HEIGHT: number;

    constructor(app: Application) {
        this.app = app;
        this.gameContainer = new Container();
        this.app.stage.addChild(this.gameContainer);
        
        // Set dimensions based on screen size
        const dimensions = getGameDimensions();
        this.GRID_SIZE = dimensions.gridSize;
        this.GRID_WIDTH = dimensions.gridWidth;
        this.GRID_HEIGHT = dimensions.gridHeight;
        this.GAME_WIDTH = dimensions.gameWidth;
        this.GAME_HEIGHT = dimensions.gameHeight;
        
        // Load high score from localStorage
        this.highScore = parseInt(localStorage.getItem('snakeHighScore') || '0');
    }

    async init(): Promise<void> { 
        // Create game background
        this.createBackground();
        
        // Initialize snake
        this.snake = new Snake(this.GRID_SIZE, this.GRID_WIDTH, this.GRID_HEIGHT);
        this.gameContainer.addChild(this.snake.container);
        
        // Initialize food
        this.food = new Food(this.GRID_SIZE);
        this.gameContainer.addChild(this.food.container);
        
        // Position food
        this.spawnFood();
        
        // Set up input handling
        this.setupInput();
        this.setupTouchControls();
        this.setupStartScreen();
        
        // Initialize UI
        this.updateUI();
    }

    private createBackground(): void {
        const background = new Graphics();
        background.beginFill(0x34495e);
        background.drawRect(0, 0, this.GAME_WIDTH, this.GAME_HEIGHT);
        background.endFill();
        
        // Draw grid lines
        background.lineStyle(1, 0x2c3e50, 1);
        for (let x = 0; x <= this.GRID_WIDTH; x++) {
            background.moveTo(x * this.GRID_SIZE, 0);
            background.lineTo(x * this.GRID_SIZE, this.GAME_HEIGHT);
        }
        for (let y = 0; y <= this.GRID_HEIGHT; y++) {
            background.moveTo(0, y * this.GRID_SIZE);
            background.lineTo(this.GAME_WIDTH, y * this.GRID_SIZE);
        }
        
        this.gameContainer.addChild(background);
    }

    private setupInput(): void {
        const handleKeydown = (event: KeyboardEvent) => {
            if (this.isGameOver) return;
            
            switch (event.key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    event.preventDefault();
                    this.snake.setDirection('up');
                    break;
                case 'ArrowDown':
                case 's':
                case 'S':
                    event.preventDefault();
                    this.snake.setDirection('down');
                    break;
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    event.preventDefault();
                    this.snake.setDirection('left');
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                    event.preventDefault();
                    this.snake.setDirection('right');
                    break;
                case ' ':
                case 'Escape':
                    event.preventDefault();
                    this.togglePause();
                    break;
            }
        };

        document.addEventListener('keydown', handleKeydown);
        
        // Store the handler so we can remove it later
        this.removeInputHandler = () => {
            document.removeEventListener('keydown', handleKeydown);
        };
    }

    private setupTouchControls(): void {
        let startX = 0;
        let startY = 0;
        let isSwiping = false;
        const minSwipeDistance = 30;

        const handleTouchStart = (event: TouchEvent) => {
            if (this.isGameOver) return;
            
            const touch = event.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            isSwiping = true;
        };

        const handleTouchMove = (event: TouchEvent) => {
            if (!isSwiping) return;
            event.preventDefault();
        };

        const handleTouchEnd = (event: TouchEvent) => {
            if (!isSwiping) return;
            
            const touch = event.changedTouches[0];
            const deltaX = touch.clientX - startX;
            const deltaY = touch.clientY - startY;
            
            if (Math.abs(deltaX) > minSwipeDistance || Math.abs(deltaY) > minSwipeDistance) {
                if (Math.abs(deltaX) > Math.abs(deltaY)) {
                    // Horizontal swipe
                    if (deltaX > 0) {
                        this.snake.setDirection('right');
                    } else {
                        this.snake.setDirection('left');
                    }
                } else {
                    // Vertical swipe
                    if (deltaY > 0) {
                        this.snake.setDirection('down');
                    } else {
                        this.snake.setDirection('up');
                    }
                }
            }
            
            isSwiping = false;
        };

        const canvas = this.app.view as HTMLCanvasElement;
        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
        
        this.removeTouchHandler = () => {
            canvas.removeEventListener('touchstart', handleTouchStart);
            canvas.removeEventListener('touchmove', handleTouchMove);
            canvas.removeEventListener('touchend', handleTouchEnd);
        };
    }

    private setupStartScreen(): void {
        // Create start screen overlay
        const startScreen = document.createElement('div');
        startScreen.id = 'startScreen';
        startScreen.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            color: white;
            text-align: center;
            z-index: 30;
            cursor: pointer;
        `;
        
        startScreen.innerHTML = `
            <h2 style="margin: 0 0 20px 0; font-size: 24px;">🐍 Snake</h2>
            <p style="margin: 0 0 30px 0; font-size: 16px; opacity: 0.8;">
                Click or tap to start<br>
                Use arrow keys or swipe to control
            </p>
            <div style="font-size: 14px; opacity: 0.6;">
                Desktop: Arrow keys or WASD<br>
                Mobile: Swipe to control
            </div>
        `;
        
        const gameContainer = document.getElementById('gameContainer');
        if (gameContainer) {
            gameContainer.appendChild(startScreen);
        }
        
        // Add click/tap handler to start game
        const startGame = () => {
            this.isWaitingToStart = false;
            this.lastMoveTime = Date.now();
            startScreen.style.display = 'none';
        };
        
        startScreen.addEventListener('click', startGame);
        startScreen.addEventListener('touchstart', startGame, { passive: true });
    }

    update(delta: number): void {
        if (this.isGameOver || this.isPaused || this.isWaitingToStart) return;

        const currentTime = Date.now();
        if (currentTime - this.lastMoveTime > this.gameSpeed) {
            this.moveSnake();
            this.lastMoveTime = currentTime;
        }
    }

    private moveSnake(): void {
        const head = this.snake.move();
        
        // Check for wall collision
        if (head.x < 0 || head.x >= this.GRID_WIDTH || 
            head.y < 0 || head.y >= this.GRID_HEIGHT) {
            this.gameOver();
            return;
        }
        
        // Check for self collision (excluding the head itself)
        if (this.snake.checkCollisionWithBody(head.x, head.y)) {
            this.gameOver();
            return;
        }
        
        // Check for food collision
        if (head.x === this.food.x && head.y === this.food.y) {
            this.snake.grow();
            this.spawnFood();
            this.score += 1;
            this.updateUI();
            
            // Increase speed every 50 points
            if (this.score % 50 === 0 && this.gameSpeed > 50) {
                this.gameSpeed -= 10;
            }
        }
    }

    private spawnFood(): void {
        let x: number, y: number;
        do {
            x = Math.floor(Math.random() * this.GRID_WIDTH);
            y = Math.floor(Math.random() * this.GRID_HEIGHT);
        } while (this.snake.checkCollision(x, y));
        
        this.food.setPosition(x, y);
    }

    private gameOver(): void {
        this.isGameOver = true;
        
        // Update high score
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('snakeHighScore', this.highScore.toString());
            this.updateUI();
        }
        
        // Show game over screen
        this.showGameOver();
    }

    private showGameOver(): void {
        const gameOverElement = document.getElementById('gameOver');
        const finalScoreElement = document.getElementById('finalScore');
        
        if (gameOverElement && finalScoreElement) {
            finalScoreElement.textContent = this.score.toString();
            gameOverElement.style.display = 'block';
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
        const pauseMenuElement = document.getElementById('pauseMenu');
        if (pauseMenuElement) {
            pauseMenuElement.style.display = 'block';
        }
    }

    private hidePauseMenu(): void {
        const pauseMenuElement = document.getElementById('pauseMenu');
        if (pauseMenuElement) {
            pauseMenuElement.style.display = 'none';
        }
    }

    private updateUI(): void {
        const scoreElement = document.getElementById('score');
        const highScoreElement = document.getElementById('highScore');
        
        if (scoreElement) scoreElement.textContent = this.score.toString();
        if (highScoreElement) highScoreElement.textContent = this.highScore.toString();
    }

    restart(): void { 
        this.score = 0;
        this.gameSpeed = 150;
        this.isGameOver = false;
        this.isPaused = false;
        this.isWaitingToStart = true;
        this.lastMoveTime = 0;
        
        this.snake.reset();
        this.spawnFood();
        this.updateUI();
        
        // Hide game over modal
        const gameOverElement = document.getElementById('gameOver');
        if (gameOverElement) {
            gameOverElement.style.display = 'none';
        }
        
        // Hide pause menu
        this.hidePauseMenu();
        
        // Show start screen
        const startScreen = document.getElementById('startScreen');
        if (startScreen) {
            startScreen.style.display = 'flex';
        }
    }

    resume(): void {
        this.isPaused = false;
        this.hidePauseMenu();
    }

    destroy(): void {
        if (this.removeInputHandler) {
            this.removeInputHandler();
        }
        if (this.removeTouchHandler) {
            this.removeTouchHandler();
        }
        if (this.gameContainer && this.gameContainer.parent) {
            this.gameContainer.parent.removeChild(this.gameContainer);
        }
    }
}

// Global game instance
let game: SnakeGame | null = null;
let app: Application | null = null;

// Initialize the game when the page loads
async function initGame() {
    // Get dynamic dimensions
    const dimensions = getGameDimensions();
    
    // Create PIXI application
    app = new Application({
        width: dimensions.gameWidth,
        height: dimensions.gameHeight,
        backgroundColor: 0x2c3e50,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
    });

    // Add canvas to game container
    const gameContainer = document.getElementById('gameContainer');
    if (gameContainer) {
        const canvas = app.view as HTMLCanvasElement;
        // Set CSS dimensions to match the app dimensions (not the canvas buffer size)
        canvas.style.width = `${dimensions.gameWidth}px`;
        canvas.style.height = `${dimensions.gameHeight}px`;
        canvas.style.maxWidth = '100%';
        canvas.style.maxHeight = '100%';
        gameContainer.appendChild(canvas);
    }

    // Create and initialize game
    game = new SnakeGame(app);
    await game.init();

    // Set up game loop
    app.ticker.add(gameLoop);
}

function gameLoop(delta: number) {
    if (game) {
        game.update(delta);
    }
}

// Global functions for game control
declare global {
    interface Window {
        restartGame: () => void;
        returnToMainMenu: () => void;
        resumeGame: () => void;
        togglePause: () => void;
    }
}

window.restartGame = () => {
    if (game) {
        game.restart();
    }
};

window.returnToMainMenu = () => {
    window.location.href = '/arcade/';
};

window.resumeGame = () => {
    if (game) {
        game.resume();
    }
};

window.togglePause = () => {
    if (game) {
        game.togglePause();
    }
};

// Initialize when page loads
window.addEventListener('load', initGame); 