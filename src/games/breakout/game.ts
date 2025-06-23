import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Paddle } from './paddle';
import { Ball, BallType } from './ball';
import { Brick } from './brick';
import { PowerUp, PowerUpType } from './powerup';
import { ParticleSystem } from './particle';
import { isTouchDevice } from '../../shared/utils/device-detection';

// Game constants - fixed base dimensions
const BASE_GAME_WIDTH = 900;
const BASE_GAME_HEIGHT = 500;
const PADDLE_WIDTH = 100;
const PADDLE_HEIGHT = 20;
const BALL_RADIUS = 10;
const BRICK_HEIGHT = 30;
const BRICK_ROWS = 5;
const BRICK_COLS = 10;
const BRICK_PADDING = 1;
const BASE_BALL_VELOCITY = 7;
const POWERUP_DROP_CHANCE = .25;//0.1; // 10% chance

// Calculate brick width to fit perfectly
const BRICK_WIDTH = (BASE_GAME_WIDTH - (BRICK_COLS + 1) * BRICK_PADDING) / BRICK_COLS;

// Get device-adjusted ball velocity
const INITIAL_BALL_VELOCITY = isTouchDevice() ? BASE_BALL_VELOCITY * 0.7 : BASE_BALL_VELOCITY;

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

export class BreakoutGame {
    private app: Application;
    private gameContainer: Container;
    private paddle!: Paddle;
    private balls: Ball[] = [];
    private bricks: Brick[] = [];
    private powerUps: PowerUp[] = [];
    private particleSystem: ParticleSystem;
    private score: number = 0;
    private lives: number = 3;
    private level: number = 1;
    private isGameOver: boolean = false;
    private isPaused: boolean = false;
    private isGameStarted: boolean = false;
    private removeInputHandler?: () => void;
    private removeTopBarHandler?: () => void;
    private currentPaddleWidth: number = PADDLE_WIDTH;
    private safetyNetActive: boolean = false;
    private safetyNet!: Graphics;

    constructor(app: Application) {
        this.app = app;
        this.gameContainer = new Container();
        this.app.stage.addChild(this.gameContainer);
        this.particleSystem = new ParticleSystem(this.gameContainer);
    }

    async init(): Promise<void> {
        // Create game background
        this.createBackground();
        
        // Initialize paddle
        this.paddle = new Paddle(PADDLE_WIDTH, PADDLE_HEIGHT);
        this.gameContainer.addChild(this.paddle.container);
        this.paddle.setPosition(BASE_GAME_WIDTH / 2 - this.currentPaddleWidth / 2, BASE_GAME_HEIGHT - PADDLE_HEIGHT - 10);

        this.createBricks();
        this.setupInput();
        this.setupTopBarEvents();
        this.updateUI();
 
        this.resetObjects();
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

    private createBackground(): void {
        const background = new Graphics();
        background.beginFill(0x34495e);
        background.drawRect(0, 0, BASE_GAME_WIDTH, BASE_GAME_HEIGHT);
        background.endFill();
        
        this.gameContainer.addChild(background);
        
        // Create safety net (initially hidden)
        this.safetyNet = new Graphics();
        this.safetyNet.beginFill(0x2ecc71, 0.7);
        this.safetyNet.drawRect(0, BASE_GAME_HEIGHT - 5, BASE_GAME_WIDTH, 5);
        this.safetyNet.endFill();
        this.safetyNet.visible = false;
        this.gameContainer.addChild(this.safetyNet);
    }

    private createBricks(): void {
        const healths = [4, 3, 2, 1, 1]; // Red to green (top to bottom)
        const startY = 50;
        
        for (let row = 0; row < BRICK_ROWS; row++) {
            for (let col = 0; col < BRICK_COLS; col++) {
                const x = col * (BRICK_WIDTH + BRICK_PADDING) + BRICK_PADDING;
                const y = startY + row * (BRICK_HEIGHT + BRICK_PADDING);
                
                const brick = new Brick(BRICK_WIDTH, BRICK_HEIGHT, healths[row]);
                brick.setPosition(x, y);
                this.bricks.push(brick);
                this.gameContainer.addChild(brick.container);
            }
        }
    }

    private setupInput(): void {
        const handleKeydown = (event: KeyboardEvent) => {
            if (this.isGameOver) return;
            
            switch (event.key) {
                case ' ':
                case 'Enter':
                    event.preventDefault();
                    if (!this.isGameStarted) {
                        this.startGame();
                    }
                    break;
                case 'Escape':
                    event.preventDefault();
                    this.togglePause();
                    break;
            }
        };

        const handleMouseMove = (event: Event) => {
            if (this.isGameOver || this.isPaused) return;
            
            const mouseEvent = event as MouseEvent;
            const rect = (this.app.view as HTMLCanvasElement).getBoundingClientRect();
            const mouseX = mouseEvent.clientX - rect.left;
            
            // Map mouse position to game coordinates
            const gameX = (mouseX / rect.width) * BASE_GAME_WIDTH;
            const paddleX = gameX - this.currentPaddleWidth / 2;
            
            // Keep paddle within bounds
            const clampedX = Math.max(0, Math.min(BASE_GAME_WIDTH - this.currentPaddleWidth, paddleX));
            const paddleY = BASE_GAME_HEIGHT - PADDLE_HEIGHT - 10;
            this.paddle.setPosition(clampedX, paddleY);
        };

        const handleMouseClick = (event: Event) => {
            if (this.isGameOver || this.isPaused) return;
            
            if (!this.isGameStarted) {
                this.startGame();
            }
        };

        let isDragging = false;
        let hasStartedDragging = false; // Track if we've actually started dragging
        let startTouchX = 0; // Store initial touch position
        let startTouchY = 0;
        const DRAG_THRESHOLD = 10; // Minimum pixels to move before starting drag
        
        const handleTouchStart = (event: TouchEvent) => {
            if (this.isGameOver || this.isPaused) return;
            
            const touch = event.touches[0];
            const touchY = touch.clientY;
            
            // Check if touch is in the game area (below the top bar)
            // Top bar is typically around 60px, so we'll use 80px as a safe margin
            if (touchY < 80) {
                return; // Don't handle touches in the top bar area
            }
            
            isDragging = true;
            hasStartedDragging = false; // Reset drag state
            startTouchX = touch.clientX; // Store initial position
            startTouchY = touch.clientY;
            event.preventDefault();
            
            // Center paddle on initial touch position
            const touchX = touch.clientX;
            const canvas = this.app.view as HTMLCanvasElement;
            const rect = canvas.getBoundingClientRect();
            
            // Calculate touch position relative to the canvas
            const relativeX = touchX - rect.left;
            
            // Convert from scaled canvas coordinates to game coordinates
            const scale = rect.width / BASE_GAME_WIDTH;
            const gameX = relativeX / scale;
            
            // Position paddle so touch point maps to paddle center
            const paddleX = gameX - this.currentPaddleWidth / 2;
            const clampedX = Math.max(0, Math.min(BASE_GAME_WIDTH - this.currentPaddleWidth, paddleX));
            const paddleY = BASE_GAME_HEIGHT - PADDLE_HEIGHT - 10;
            this.paddle.setPosition(clampedX, paddleY);
            
            if (!this.isGameStarted) {
                this.startGame();
            }
        };

        const handleTouchMove = (event: TouchEvent) => {
            if (!isDragging || this.isGameOver || this.isPaused) return;
            
            const touch = event.touches[0];
            const touchY = touch.clientY;
            
            // Check if touch is in the game area
            if (touchY < 80) {
                return; // Don't handle touches in the top bar area
            }
            
            event.preventDefault();
            
            // Calculate distance moved from initial touch
            const deltaX = Math.abs(touch.clientX - startTouchX);
            const deltaY = Math.abs(touch.clientY - startTouchY);
            const totalDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            
            // Only start moving the paddle after we've moved beyond the threshold
            if (!hasStartedDragging && totalDistance > DRAG_THRESHOLD) {
                hasStartedDragging = true;
            }
            
            // Only move paddle if we've started dragging
            if (hasStartedDragging) {
                const touchX = touch.clientX;
                
                // Get the canvas element and its position
                const canvas = this.app.view as HTMLCanvasElement;
                const rect = canvas.getBoundingClientRect();
                
                // Calculate touch position relative to the canvas
                const relativeX = touchX - rect.left;
                
                // Convert from scaled canvas coordinates to game coordinates
                const scale = rect.width / BASE_GAME_WIDTH;
                const gameX = relativeX / scale;
                
                // Position paddle so touch point maps to paddle center
                const paddleX = gameX - this.currentPaddleWidth / 2;
                
                // Clamp paddle to game bounds
                const clampedX = Math.max(0, Math.min(BASE_GAME_WIDTH - this.currentPaddleWidth, paddleX));
                const paddleY = BASE_GAME_HEIGHT - PADDLE_HEIGHT - 10;
                this.paddle.setPosition(clampedX, paddleY);
            }
        };

        const handleTouchEnd = (event: TouchEvent) => {
            isDragging = false;
            hasStartedDragging = false;
        };

        document.addEventListener('keydown', handleKeydown);
        const canvas = this.app.view as HTMLCanvasElement;
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('click', handleMouseClick);
        
        // Add touch listeners to document for full screen control
        document.addEventListener('touchstart', handleTouchStart, { passive: false });
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleTouchEnd, { passive: false });
        
        // Store the handler so we can remove it later
        this.removeInputHandler = () => {
            document.removeEventListener('keydown', handleKeydown);
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('click', handleMouseClick);
            document.removeEventListener('touchstart', handleTouchStart);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
        };
    }

    private startGame(): void {
        this.isGameStarted = true;
        this.balls.forEach(ball => ball.setVelocity(0, -INITIAL_BALL_VELOCITY));
    }

    private resetObjects(): void {
        // Destroy all balls (both white and blue)
        this.balls.forEach(ball => {
            this.gameContainer.removeChild(ball.container);
        });
        this.balls = [];
        
        // Spawn a fresh white ball on the paddle
        const newBall = new Ball(BALL_RADIUS, BallType.NORMAL);
        this.balls.push(newBall);
        this.gameContainer.addChild(newBall.container);
        this.isGameStarted = false;

        this.currentPaddleWidth = PADDLE_WIDTH;
        this.paddle.resize(this.currentPaddleWidth);
        this.paddle.setPosition(BASE_GAME_WIDTH / 2 - this.currentPaddleWidth / 2, BASE_GAME_HEIGHT - PADDLE_HEIGHT - 10);
    }

    update(delta: number): void {
        if (this.isGameOver || this.isPaused) return;

        if (this.isGameStarted) {
            this.balls.forEach(ball => ball.update());
            this.checkCollisions();
        } else {
            // Ball follows paddle when not started
            this.balls.forEach(ball => ball.setPosition(
                this.paddle.x + this.currentPaddleWidth / 2,
                BASE_GAME_HEIGHT - PADDLE_HEIGHT - 30
            ));
        }
        
        // Update power-ups
        this.updatePowerUps();
        
        // Update particles
        this.particleSystem.update();
    }

    private checkCollisions(): void {
        // Check each ball for collisions
        for (let ballIndex = this.balls.length - 1; ballIndex >= 0; ballIndex--) {
            const ball = this.balls[ballIndex];
            const ballBounds = ball.getBounds();
            
            // Check wall collisions with improved bounds checking
            if (ballBounds.left <= 0) {
                ball.setPosition(ball.radius, ball.y);
                ball.reverseX();
            } else if (ballBounds.right >= BASE_GAME_WIDTH) {
                ball.setPosition(BASE_GAME_WIDTH - ball.radius, ball.y);
                ball.reverseX();
            }
            
            if (ballBounds.top <= 0) {
                ball.setPosition(ball.x, ball.radius);
                ball.reverseY();
            }
            
            // Check if ball is out of bounds (bottom)
            if (ballBounds.top >= BASE_GAME_HEIGHT) {
                if (ball.type === BallType.BLUE) {
                    // Blue balls don't reduce health, just remove them
                    this.gameContainer.removeChild(ball.container);
                    this.balls.splice(ballIndex, 1);
                } else if (this.safetyNetActive) {
                    // Safety net catches the ball
                    ball.setPosition(ball.x, BASE_GAME_HEIGHT - ball.radius - 5);
                    ball.reverseY();
                    this.safetyNetActive = false;
                    this.safetyNet.visible = false;
                } else {
                    // No safety net, lose a life and remove the ball
                    this.gameContainer.removeChild(ball.container);
                    this.balls.splice(ballIndex, 1);
                    this.loseLife();
                }
                continue;
            }
            
            // Check paddle collision
            if (ball.checkCollisionWithPaddle(this.paddle)) {
                // Ensure ball is above paddle before reversing
                if (ball.y > this.paddle.y) {
                    ball.setPosition(ball.x, this.paddle.y - ball.radius);
                    ball.reverseY();
                    
                    // Calculate where the ball hit the paddle (0 = left edge, 1 = right edge)
                    const hitPoint = (ball.x - this.paddle.x) / this.currentPaddleWidth;
                    const centerPoint = 0.5;
                    
                    // Calculate velocity multiplier based on distance from center
                    // Center (0.5) = 100% speed, edges (0 or 1) = 200% speed
                    const distanceFromCenter = Math.abs(hitPoint - centerPoint);
                    const velocityMultiplier = 1 + distanceFromCenter; // 1.0 to 2.0
                    
                    // Set new velocity with angle and speed adjustment
                    const newSpeed = INITIAL_BALL_VELOCITY * velocityMultiplier;
                    const angle = (hitPoint - centerPoint) * 0.8; // -0.4 to 0.4 radians
                    
                    ball.setVelocityAndAngle(newSpeed, angle);
                }
            }
            
            // Check brick collisions
            for (let i = this.bricks.length - 1; i >= 0; i--) {
                const brick = this.bricks[i];
                if (ball.checkCollisionWithBrick(brick)) {
                    // Determine which side of the brick was hit
                    const ballBounds = ball.getBounds();
                    const brickBounds = brick.getBounds();
                    
                    // Calculate overlap on each axis
                    const overlapX = Math.min(ballBounds.right - brickBounds.left, brickBounds.right - ballBounds.left);
                    const overlapY = Math.min(ballBounds.bottom - brickBounds.top, brickBounds.bottom - ballBounds.top);
                    
                    // Bounce based on which overlap is smaller (indicating which side was hit)
                    if (overlapX < overlapY) {
                        // Hit from left or right side
                        ball.reverseX();
                    } else {
                        // Hit from top or bottom side
                        ball.reverseY();
                    }
                    
                    // Hit the brick and check if it's destroyed
                    const isDestroyed = brick.hit();
                    if (isDestroyed) {
                        // Create particle explosion at brick position
                        const brickColor = brick.getColor();
                        this.particleSystem.createExplosion(
                            brick.x + BRICK_WIDTH / 2, 
                            brick.y + BRICK_HEIGHT / 2, 
                            brickColor, 
                            12
                        );
                        
                        // Remove the brick if health reaches 0
                        this.bricks.splice(i, 1);
                        this.gameContainer.removeChild(brick.container);
                        
                        // Chance to spawn power-up
                        if (Math.random() < POWERUP_DROP_CHANCE) {
                            this.spawnPowerUp(brick.x + BRICK_WIDTH / 2, brick.y + BRICK_HEIGHT);
                        }
                    }
                    
                    this.score += 10;
                    this.updateUI();
                    
                    // Check if all bricks are destroyed
                    if (this.bricks.length === 0) {
                        this.nextLevel();
                    }
                    
                    // Only destroy one brick per collision
                    break;
                }
            }
        }
    }

    private loseLife(): void {
        this.lives--;
        this.updateUI();
        
        // Reset paddle to original size


        this.resetObjects();
        
        if (this.lives <= 0) {
            this.gameOver();
            return;
        } 
        

        
        
    }

    private nextLevel(): void {
        this.level++;
        this.updateUI();
        this.createBricks();
        this.resetObjects();
    }

    private gameOver(): void {
        this.isGameOver = true;
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
        const livesElement = document.getElementById('lives');
        const levelElement = document.getElementById('level');
        
        if (scoreElement) scoreElement.textContent = this.score.toString();
        if (livesElement) livesElement.textContent = this.lives.toString();
        if (levelElement) levelElement.textContent = this.level.toString();
    }

    restart(): void {
        this.score = 0;
        this.lives = 3;
        this.level = 1;
        this.isGameOver = false;
        this.isPaused = false;
        this.isGameStarted = false;
        this.currentPaddleWidth = PADDLE_WIDTH;
        this.safetyNetActive = false;
        this.safetyNet.visible = false;
        
        // Clear particles
        this.particleSystem.clear();
        
        // Clear existing balls
        this.balls.forEach(ball => {
            this.gameContainer.removeChild(ball.container);
        });
        this.balls = [];
        
        // Clear existing bricks
        this.bricks.forEach(brick => {
            this.gameContainer.removeChild(brick.container);
        });
        this.bricks = [];
        
        // Clear existing power-ups
        this.powerUps.forEach(powerUp => {
            this.gameContainer.removeChild(powerUp.container);
        });
        this.powerUps = [];
        
        // Create new bricks
        this.createBricks();
        
        // Reset ball and paddle
        this.resetObjects();
        
        this.updateUI();
        
        // Hide modals
        const gameOverElement = document.getElementById('gameOver');
        if (gameOverElement) {
            gameOverElement.style.display = 'none';
        }
        this.hidePauseMenu();
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
        this.particleSystem.clear();
        
        // Clear all balls
        this.balls.forEach(ball => {
            if (ball.container.parent) {
                ball.container.parent.removeChild(ball.container);
            }
        });
        this.balls = [];
        
        if (this.gameContainer && this.gameContainer.parent) {
            this.gameContainer.parent.removeChild(this.gameContainer);
        }
    }

    private spawnPowerUp(x: number, y: number): void {
        // Randomly choose power-up type
        const powerUpTypes = [PowerUpType.PADDLE_INCREASE, PowerUpType.PADDLE_DECREASE, PowerUpType.EXTRA_LIFE, PowerUpType.BLUE_BALL];
        const randomType = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
        
        const powerUp = new PowerUp(randomType, x, y);
        this.powerUps.push(powerUp);
        this.gameContainer.addChild(powerUp.container);
    }

    private updatePowerUps(): void {
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            const powerUp = this.powerUps[i];
            powerUp.update();
            
            // Check if power-up is out of bounds
            if (powerUp.isOutOfBounds(BASE_GAME_HEIGHT)) {
                this.powerUps.splice(i, 1);
                this.gameContainer.removeChild(powerUp.container);
                continue;
            }
            
            // Check collision with paddle
            if (this.checkPowerUpCollision(powerUp)) {
                this.applyPowerUp(powerUp.type);
                this.powerUps.splice(i, 1);
                this.gameContainer.removeChild(powerUp.container);
            }
        }
    }

    private checkPowerUpCollision(powerUp: PowerUp): boolean {
        const powerUpBounds = powerUp.getBounds();
        const paddleBounds = this.paddle.getBounds();
        
        return powerUpBounds.left < paddleBounds.right &&
               powerUpBounds.right > paddleBounds.left &&
               powerUpBounds.top < paddleBounds.bottom &&
               powerUpBounds.bottom > paddleBounds.top;
    }

    private applyPowerUp(type: PowerUpType): void {
        switch (type) {
            case PowerUpType.PADDLE_INCREASE:
                this.currentPaddleWidth = Math.min(this.currentPaddleWidth * 1.3, PADDLE_WIDTH * 2);
                this.paddle.resize(this.currentPaddleWidth);
                break;
            case PowerUpType.PADDLE_DECREASE:
                this.currentPaddleWidth = Math.max(this.currentPaddleWidth * 0.8, PADDLE_WIDTH * 0.5);
                this.paddle.resize(this.currentPaddleWidth);
                break;
            case PowerUpType.EXTRA_LIFE:
                // Activate safety net if not already active
                if (!this.safetyNetActive) {
                    this.safetyNetActive = true;
                    this.safetyNet.visible = true;
                }
                break;
            case PowerUpType.BLUE_BALL:
                // Spawn a blue ball from the paddle
                const blueBall = new Ball(BALL_RADIUS, BallType.BLUE);
                blueBall.setPosition(
                    this.paddle.x + this.currentPaddleWidth / 2,
                    BASE_GAME_HEIGHT - PADDLE_HEIGHT - 30
                );
                blueBall.setVelocity(0, -INITIAL_BALL_VELOCITY);
                this.balls.push(blueBall);
                this.gameContainer.addChild(blueBall.container);
                break;
        }
    }

    private movePaddle(dx: number): void {
        if (this.isGameOver || this.isPaused) return;
        
        const newX = Math.max(0, Math.min(BASE_GAME_WIDTH - this.currentPaddleWidth, this.paddle.x + dx));
        const paddleY = BASE_GAME_HEIGHT - PADDLE_HEIGHT - 10;
        this.paddle.setPosition(newX, paddleY);
    }

    returnToMainMenu(): void {
        window.location.href = '/arcade/';
    }
}

// Global game instance
let game: BreakoutGame | null = null;
let app: Application | null = null;

// Function to update canvas scaling on resize
function updateCanvasScaling() {
    if (!app) return;
    
    const dimensions = getGameDimensions();
    const canvas = app.view as HTMLCanvasElement;
    
    // Update canvas CSS dimensions
    canvas.style.width = `${BASE_GAME_WIDTH * dimensions.scale}px`;
    canvas.style.height = `${BASE_GAME_HEIGHT * dimensions.scale}px`;
}

// Initialize the game when the page loads
async function initGame() {
    // Get dimensions and scale
    const dimensions = getGameDimensions();
    
    // Create PIXI application with base dimensions
    app = new Application({
        width: BASE_GAME_WIDTH,
        height: BASE_GAME_HEIGHT,
        backgroundColor: 0x2c3e50,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
    });

    // Add canvas to game container with proper scaling
    const gameContainer = document.getElementById('gameContainer');
    if (gameContainer) {
        const canvas = app.view as HTMLCanvasElement;
        
        // Apply scaling through CSS transform
        canvas.style.width = `${BASE_GAME_WIDTH * dimensions.scale}px`;
        canvas.style.height = `${BASE_GAME_HEIGHT * dimensions.scale}px`;
        canvas.style.maxWidth = '100%';
        canvas.style.maxHeight = '100%';
        canvas.style.objectFit = 'contain';
        
        gameContainer.appendChild(canvas);
    }

    // Create and initialize game
    game = new BreakoutGame(app);
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