import { Application, Container, Graphics } from 'pixi.js';
import { Snake } from './snake';
import { Food } from './food';

// Game constants - base dimensions that will be flipped based on screen orientation
const BASE_DIMENSIONS = {
    landscape: { width: 600, height: 400 },
    portrait: { width: 400, height: 600 }
};
const GRID_SIZE = 40; // 40 on large screen space, 5

// Function to determine game dimensions based on screen orientation
const getGameDimensions = () => {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight - 120; // Account for top bar and margins
    
    // Determine if screen is landscape or portrait
    const isLandscape = windowWidth > windowHeight;
    const baseDimensions = isLandscape ? BASE_DIMENSIONS.landscape : BASE_DIMENSIONS.portrait;
    
    // Calculate grid dimensions based on orientation
    const gridWidth = baseDimensions.width / GRID_SIZE;
    const gridHeight = baseDimensions.height / GRID_SIZE;
    
    // Calculate scale to fit within available space while maintaining aspect ratio
    const scaleX = windowWidth / baseDimensions.width;
    const scaleY = windowHeight / baseDimensions.height;
    const scale = Math.min(scaleX, scaleY);
    
    return {
        gameWidth: baseDimensions.width,
        gameHeight: baseDimensions.height,
        gridWidth: Math.floor(gridWidth),
        gridHeight: Math.floor(gridHeight),
        scale,
        isLandscape
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
    private removeTopBarHandler?: () => void;
    private gameDimensions: ReturnType<typeof getGameDimensions>;

    constructor(app: Application) {
        this.app = app;
        this.gameContainer = new Container();
        this.app.stage.addChild(this.gameContainer);
        
        // Get initial dimensions
        this.gameDimensions = getGameDimensions();
        
        // Load high score from localStorage
        this.highScore = parseInt(localStorage.getItem('snakeHighScore') || '0');
    }

    // Public getter for game dimensions
    getGameDimensions() {
        return this.gameDimensions;
    }

    async init(): Promise<void> { 
        // Create game background
        this.createBackground();
        
        // Initialize snake with current grid dimensions
        this.snake = new Snake(GRID_SIZE, this.gameDimensions.gridWidth, this.gameDimensions.gridHeight);
        this.gameContainer.addChild(this.snake.container);
        
        // Initialize food
        this.food = new Food(GRID_SIZE);
        this.gameContainer.addChild(this.food.container);
        
        // Position food
        this.spawnFood();
        
        // Set up input handling
        this.setupInput();
        this.setupTouchControls();
        this.setupTopBarEvents();
        this.setupStartScreen();
        
        // Initialize UI
        this.updateUI();
    }

    private createBackground(): void {
        const background = new Graphics();
        background.beginFill(0x34495e);
        background.drawRect(0, 0, this.gameDimensions.gameWidth, this.gameDimensions.gameHeight);
        background.endFill();
        
        // Draw grid lines
        background.lineStyle(1, 0x2c3e50, 1);
        for (let x = 0; x <= this.gameDimensions.gridWidth; x++) {
            background.moveTo(x * GRID_SIZE, 0);
            background.lineTo(x * GRID_SIZE, this.gameDimensions.gameHeight);
        }
        for (let y = 0; y <= this.gameDimensions.gridHeight; y++) {
            background.moveTo(0, y * GRID_SIZE);
            background.lineTo(this.gameDimensions.gameWidth, y * GRID_SIZE);
        }
        
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
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            
            if (distance >= minSwipeDistance) {
                // Determine swipe direction
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

        // Add touch listeners to document for full screen control
        document.addEventListener('touchstart', handleTouchStart, { passive: false });
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleTouchEnd, { passive: false });
        
        this.removeTouchHandler = () => {
            document.removeEventListener('touchstart', handleTouchStart);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
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
        if (head.x < 0 || head.x >= this.gameDimensions.gridWidth || 
            head.y < 0 || head.y >= this.gameDimensions.gridHeight) {
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
            x = Math.floor(Math.random() * this.gameDimensions.gridWidth);
            y = Math.floor(Math.random() * this.gameDimensions.gridHeight);
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
        if (this.removeTopBarHandler) {
            this.removeTopBarHandler();
        }
        if (this.gameContainer && this.gameContainer.parent) {
            this.gameContainer.parent.removeChild(this.gameContainer);
        }
    }

    returnToMainMenu(): void {
        window.location.href = '/arcade/';
    }
}

// Global game instance
let game: SnakeGame | null = null;
let app: Application | null = null;

// Function to update canvas scaling on resize
function updateCanvasScaling() {
    if (!app) return;
    
    // Get current dimensions but use the existing orientation
    const currentDimensions = game?.getGameDimensions();
    if (!currentDimensions) return;
    
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight - 120;
    
    // Use the existing game dimensions but recalculate scale
    const scaleX = windowWidth / currentDimensions.gameWidth;
    const scaleY = windowHeight / currentDimensions.gameHeight;
    const scale = Math.min(scaleX, scaleY);
    
    const canvas = app.view as HTMLCanvasElement;
    
    // Update canvas CSS dimensions with new scale but same game dimensions
    canvas.style.width = `${currentDimensions.gameWidth * scale}px`;
    canvas.style.height = `${currentDimensions.gameHeight * scale}px`;
    
    // Check if orientation changed significantly (more than just a small resize)
    const newDimensions = getGameDimensions();
    const currentOrientation = currentDimensions.isLandscape;
    const newOrientation = newDimensions.isLandscape;
    
    // If orientation changed, log it but don't change the game
    if (currentOrientation !== newOrientation) {
        console.log('Orientation changed but keeping current game orientation:', { 
            current: currentOrientation ? 'landscape' : 'portrait',
            new: newOrientation ? 'landscape' : 'portrait',
            note: 'Game will use new orientation on restart'
        });
    }
}

// Initialize the game when the page loads
async function initGame() {
    // Get dimensions and scale
    const dimensions = getGameDimensions();
    
    // Create PIXI application with base dimensions
    app = new Application({
        width: dimensions.gameWidth,
        height: dimensions.gameHeight,
        backgroundColor: 0x2c3e50,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
    });

    // Add canvas to game container with proper scaling
    const gameContainer = document.getElementById('gameContainer');
    if (gameContainer) {
        const canvas = app.view as HTMLCanvasElement;
        
        // Apply scaling through CSS transform
        canvas.style.width = `${dimensions.gameWidth * dimensions.scale}px`;
        canvas.style.height = `${dimensions.gameHeight * dimensions.scale}px`;
        canvas.style.maxWidth = '100%';
        canvas.style.maxHeight = '100%';
        canvas.style.objectFit = 'contain';
        
        gameContainer.appendChild(canvas);
        
        console.log('Snake dimensions:', {
            baseWidth: dimensions.gameWidth,
            baseHeight: dimensions.gameHeight,
            scale: dimensions.scale,
            scaledWidth: dimensions.gameWidth * dimensions.scale,
            scaledHeight: dimensions.gameHeight * dimensions.scale,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            styleWidth: canvas.style.width,
            styleHeight: canvas.style.height
        });
    }

    // Create and initialize game
    game = new SnakeGame(app);
    await game.init();

    // Set up game loop
    app.ticker.add(gameLoop);
    
    // Add resize handler
    window.addEventListener('resize', updateCanvasScaling);
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
    if (game) {
        game.returnToMainMenu();
    }
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