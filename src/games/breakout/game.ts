import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Paddle } from './paddle';
import { Ball } from './ball';
import { Brick } from './brick';
import { PowerUp, PowerUpType } from './powerup';

// Game constants
export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;
export const PADDLE_WIDTH = 100;
export const PADDLE_HEIGHT = 20;
export const BALL_RADIUS = 8;
export const BRICK_HEIGHT = 30;
export const BRICK_ROWS = 5;
export const BRICK_COLS = 10;
export const BRICK_PADDING = 1;
export const INITIAL_BALL_VELOCITY = 8;
export const POWERUP_DROP_CHANCE = 0.1; // 10% chance

// Calculate brick width dynamically
export const BRICK_WIDTH = (GAME_WIDTH - (BRICK_COLS + 1) * BRICK_PADDING) / BRICK_COLS;

export class BreakoutGame {
    private app: Application;
    private gameContainer: Container;
    private paddle!: Paddle;
    private ball!: Ball;
    private bricks: Brick[] = [];
    private powerUps: PowerUp[] = [];
    private score: number = 0;
    private lives: number = 3;
    private level: number = 1;
    private isGameOver: boolean = false;
    private isPaused: boolean = false;
    private isGameStarted: boolean = false;
    private removeInputHandler?: () => void;
    private currentPaddleWidth: number = PADDLE_WIDTH;
    private safetyNetActive: boolean = false;
    private safetyNet!: Graphics;

    constructor(app: Application) {
        this.app = app;
        this.gameContainer = new Container();
        this.app.stage.addChild(this.gameContainer);
    }

    async init(): Promise<void> {
        // Create game background
        this.createBackground();
        
        // Initialize paddle
        this.paddle = new Paddle(PADDLE_WIDTH, PADDLE_HEIGHT);
        this.gameContainer.addChild(this.paddle.container);
        
        // Initialize ball
        this.ball = new Ball(BALL_RADIUS);
        this.gameContainer.addChild(this.ball.container);
        
        // Create bricks
        this.createBricks();
        
        // Set up input handling
        this.setupInput();
        
        // Initialize UI
        this.updateUI();
        
        // Position game objects at center
        this.paddle.setPosition(GAME_WIDTH / 2 - this.currentPaddleWidth / 2, GAME_HEIGHT - PADDLE_HEIGHT - 10);
        this.resetBall();
    }

    private createBackground(): void {
        const background = new Graphics();
        background.beginFill(0x34495e);
        background.drawRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        background.endFill();
        
        this.gameContainer.addChild(background);
        
        // Create safety net (initially hidden)
        this.safetyNet = new Graphics();
        this.safetyNet.beginFill(0x2ecc71, 0.7);
        this.safetyNet.drawRect(0, GAME_HEIGHT - 5, GAME_WIDTH, 5);
        this.safetyNet.endFill();
        this.safetyNet.visible = false;
        this.gameContainer.addChild(this.safetyNet);
    }

    private createBricks(): void {
        const healths = [5, 4, 3, 2, 1]; // Red to green (top to bottom)
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
                    event.preventDefault();
                    if (!this.isGameStarted) {
                        this.startGame();
                    } else {
                        this.togglePause();
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
            const canvas = this.app.view as HTMLCanvasElement;
            const rect = canvas.getBoundingClientRect();
            const mouseX = mouseEvent.clientX - rect.left;
            const paddleX = mouseX - PADDLE_WIDTH / 2;
            
            // Keep paddle within bounds
            const clampedX = Math.max(0, Math.min(GAME_WIDTH - PADDLE_WIDTH, paddleX));
            this.paddle.setPosition(clampedX, GAME_HEIGHT - PADDLE_HEIGHT - 10);
        };

        const handleMouseClick = (event: Event) => {
            if (this.isGameOver || this.isPaused) return;
            
            if (!this.isGameStarted) {
                this.startGame();
            }
        };

        document.addEventListener('keydown', handleKeydown);
        const canvas = this.app.view as HTMLCanvasElement;
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('click', handleMouseClick);
        
        // Store the handler so we can remove it later
        this.removeInputHandler = () => {
            document.removeEventListener('keydown', handleKeydown);
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('click', handleMouseClick);
        };
    }

    private startGame(): void {
        this.isGameStarted = true;
        this.ball.setVelocity(0, -INITIAL_BALL_VELOCITY);
    }

    private resetBall(): void {
        this.ball.setPosition(GAME_WIDTH / 2, GAME_HEIGHT - PADDLE_HEIGHT - 30);
        this.ball.setVelocity(0, 0);
        this.isGameStarted = false;
    }

    update(delta: number): void {
        if (this.isGameOver || this.isPaused) return;

        if (this.isGameStarted) {
            this.ball.update();
            this.checkCollisions();
        } else {
            // Ball follows paddle when not started
            this.ball.setPosition(
                this.paddle.x + this.currentPaddleWidth / 2,
                GAME_HEIGHT - PADDLE_HEIGHT - 30
            );
        }
        
        // Update power-ups
        this.updatePowerUps();
    }

    private checkCollisions(): void {
        const ballBounds = this.ball.getBounds();
        
        // Check wall collisions with improved bounds checking
        if (ballBounds.left <= 0) {
            this.ball.setPosition(this.ball.radius, this.ball.y);
            this.ball.reverseX();
        } else if (ballBounds.right >= GAME_WIDTH) {
            this.ball.setPosition(GAME_WIDTH - this.ball.radius, this.ball.y);
            this.ball.reverseX();
        }
        
        if (ballBounds.top <= 0) {
            this.ball.setPosition(this.ball.x, this.ball.radius);
            this.ball.reverseY();
        }
        
        // Check if ball is out of bounds (bottom)
        if (ballBounds.top >= GAME_HEIGHT) {
            if (this.safetyNetActive) {
                // Safety net catches the ball
                this.ball.setPosition(this.ball.x, GAME_HEIGHT - this.ball.radius - 5);
                this.ball.reverseY();
                this.safetyNetActive = false;
                this.safetyNet.visible = false;
            } else {
                // No safety net, lose a life
                this.loseLife();
            }
            return;
        }
        
        // Check paddle collision
        if (this.ball.checkCollisionWithPaddle(this.paddle)) {
            // Ensure ball is above paddle before reversing
            if (this.ball.y > this.paddle.y) {
                this.ball.setPosition(this.ball.x, this.paddle.y - this.ball.radius);
                this.ball.reverseY();
                
                // Calculate where the ball hit the paddle (0 = left edge, 1 = right edge)
                const hitPoint = (this.ball.x - this.paddle.x) / this.currentPaddleWidth;
                const centerPoint = 0.5;
                
                // Calculate velocity multiplier based on distance from center
                // Center (0.5) = 100% speed, edges (0 or 1) = 200% speed
                const distanceFromCenter = Math.abs(hitPoint - centerPoint);
                const velocityMultiplier = 1 + distanceFromCenter; // 1.0 to 2.0
                
                // Set new velocity with angle and speed adjustment
                const newSpeed = INITIAL_BALL_VELOCITY * velocityMultiplier;
                const angle = (hitPoint - centerPoint) * 0.8; // -0.4 to 0.4 radians
                
                this.ball.setVelocityAndAngle(newSpeed, angle);
            }
        }
        
        // Check brick collisions
        for (let i = this.bricks.length - 1; i >= 0; i--) {
            const brick = this.bricks[i];
            if (this.ball.checkCollisionWithBrick(brick)) {
                // Determine which side of the brick was hit
                const ballBounds = this.ball.getBounds();
                const brickBounds = brick.getBounds();
                
                // Calculate overlap on each axis
                const overlapX = Math.min(ballBounds.right - brickBounds.left, brickBounds.right - ballBounds.left);
                const overlapY = Math.min(ballBounds.bottom - brickBounds.top, brickBounds.bottom - ballBounds.top);
                
                // Bounce based on which overlap is smaller (indicating which side was hit)
                if (overlapX < overlapY) {
                    // Hit from left or right side

                    this.ball.reverseX();
                } else {
                    // Hit from top or bottom side

                    this.ball.reverseY();
                }
                
                // Hit the brick and check if it's destroyed
                const isDestroyed = brick.hit();
                if (isDestroyed) {
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

    private loseLife(): void {
        this.lives--;
        this.updateUI();
        
        // Reset paddle to original size
        this.currentPaddleWidth = PADDLE_WIDTH;
        this.paddle.resize(this.currentPaddleWidth);
        
        if (this.lives <= 0) {
            this.gameOver();
        } else {
            this.resetBall();
        }
    }

    private nextLevel(): void {
        this.level++;
        this.updateUI();
        this.createBricks();
        this.resetBall();
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

    private togglePause(): void {
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
        this.resetBall();
        this.paddle.setPosition(GAME_WIDTH / 2 - this.currentPaddleWidth / 2, GAME_HEIGHT - PADDLE_HEIGHT - 10);
        this.paddle.resize(this.currentPaddleWidth);
        
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
        if (this.gameContainer && this.gameContainer.parent) {
            this.gameContainer.parent.removeChild(this.gameContainer);
        }
    }

    private spawnPowerUp(x: number, y: number): void {
        // Randomly choose power-up type
        const powerUpTypes = [PowerUpType.PADDLE_INCREASE, PowerUpType.PADDLE_DECREASE, PowerUpType.EXTRA_LIFE];
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
            if (powerUp.isOutOfBounds(GAME_HEIGHT)) {
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
        }
    }
}

// Global game instance
let game: BreakoutGame | null = null;
let app: Application | null = null;

// Initialize the game when the page loads
async function initGame() {
    // Create PIXI application
    app = new Application({
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        backgroundColor: 0x2c3e50,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
    });

    // Add canvas to game container
    const gameContainer = document.getElementById('gameContainer');
    if (gameContainer) {
        gameContainer.appendChild(app.view as HTMLCanvasElement);
    }

    // Create and initialize game
    game = new BreakoutGame(app);
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
    }
}

window.restartGame = () => {
    if (game) {
        game.restart();
    }
};

window.returnToMainMenu = () => {
    window.location.href = '/';
};

window.resumeGame = () => {
    if (game) {
        game.resume();
    }
};

// Initialize when page loads
window.addEventListener('load', initGame); 