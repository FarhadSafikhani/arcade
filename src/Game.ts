import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Snake } from './Snake';
import { Food } from './Food';

export class Game {
    private app: Application;
    private gameContainer: Container;
    private snake: Snake;
    private food: Food;
    private score: number = 0;
    private highScore: number = 0;
    private gameSpeed: number = 150; // milliseconds between moves
    private lastMoveTime: number = 0;
    private isGameOver: boolean = false;
    private isPaused: boolean = false;

    // Game constants
    private readonly GRID_SIZE = 30;
    private readonly GRID_WIDTH = 30;
    private readonly GRID_HEIGHT = 25;
    private readonly GAME_WIDTH = this.GRID_WIDTH * this.GRID_SIZE;
    private readonly GAME_HEIGHT = this.GRID_HEIGHT * this.GRID_SIZE;

    constructor(app: Application) {
        this.app = app;
        this.gameContainer = new Container();
        this.app.stage.addChild(this.gameContainer);
        
        // Load high score from localStorage
        this.highScore = parseInt(localStorage.getItem('snakeHighScore') || '0');
        this.updateUI();
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
        
        // Game container is now exactly the right size, no centering needed
    }

    private createBackground(): void {
        const background = new Graphics();
        background.beginFill(0x34495e);
        background.drawRect(0, 0, this.GAME_WIDTH, this.GAME_HEIGHT);
        background.endFill();
        
        // Draw grid lines
        background.lineStyle(1, 0x2c3e50, 0.3);
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
        document.addEventListener('keydown', (event) => {
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
                    event.preventDefault();
                    this.togglePause();
                    break;
            }
        });
    }

    update(delta: number): void {
        if (this.isGameOver || this.isPaused) return;

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
            this.score += 10;
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
        const gameOverElement = document.getElementById('gameOver');
        const finalScoreElement = document.getElementById('finalScore');
        if (gameOverElement && finalScoreElement) {
            finalScoreElement.textContent = this.score.toString();
            gameOverElement.style.display = 'block';
        }
    }

    private togglePause(): void {
        this.isPaused = !this.isPaused;
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
        this.lastMoveTime = Date.now(); // Set to current time to start immediately
        
        this.snake.reset();
        this.spawnFood();
        this.updateUI();
        
        // Ensure game over modal is hidden
        const gameOverElement = document.getElementById('gameOver');
        if (gameOverElement) {
            gameOverElement.style.display = 'none';
        }
    }
} 