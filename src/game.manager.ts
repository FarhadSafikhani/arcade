import { Application } from 'pixi.js';
import { Menu } from './menu';
import { SnakeGame, GAME_WIDTH, GAME_HEIGHT } from './games/snake/game';

export class GameManager {
    private app: Application;
    private currentGame: SnakeGame | null = null;
    private menu: Menu | null = null;
    private currentState: 'menu' | 'game' = 'menu';

    constructor(app: Application) {
        this.app = app;
        this.showMenu();
    }

    private showMenu(): void {
        this.currentState = 'menu';
        
        // Clear any existing game
        if (this.currentGame) {
            this.currentGame.destroy();
            this.currentGame = null;
        }

        // Show menu
        this.menu = new Menu((gameId: string) => {
            this.startGame(gameId);
        });
        
        this.app.stage.addChild(this.menu.getContainer());
        
        // Show UI elements for menu
        this.showMenuUI();
    }

    private showMenuUI(): void {
        // Hide game-specific UI
        const gameUI = document.getElementById('gameUI');
        const gameOver = document.getElementById('gameOver');
        
        if (gameUI) {
            gameUI.style.display = 'none';
            gameUI.innerHTML = ''; // Clear any game-specific UI
        }
        if (gameOver) gameOver.style.display = 'none';
    }

    private async startGame(gameId: string): Promise<void> {
        this.currentState = 'game';
        
        // Hide menu
        if (this.menu) {
            this.menu.destroy();
            this.menu = null;
        }

        // Show game-specific UI
        this.showGameUI();

        switch (gameId) {
            case 'snake':
                await this.startSnakeGame();
                break;
            default:
                console.log(`Game ${gameId} not implemented yet`);
                this.showMenu();
                break;
        }
    }

    private showGameUI(): void {
        // Show game-specific UI
        const gameUI = document.getElementById('gameUI');
        
        if (gameUI) {
            gameUI.style.display = 'block';
        }
    }

    private async startSnakeGame(): Promise<void> {
        // Resize app to match snake game dimensions
        this.app.renderer.resize(GAME_WIDTH, GAME_HEIGHT);
        
        this.currentGame = new SnakeGame(this.app, (score: number) => {
            this.onGameOver(score);
        });
        
        await this.currentGame.init();
    }

    private onGameOver(score: number): void {
        // Show game over screen
        const gameOverElement = document.getElementById('gameOver');
        const finalScoreElement = document.getElementById('finalScore');
        
        if (gameOverElement && finalScoreElement) {
            finalScoreElement.textContent = score.toString();
            gameOverElement.style.display = 'block';
        }
    }

    public restartCurrentGame(): void {
        if (this.currentGame) {
            this.currentGame.restart();
            const gameOverElement = document.getElementById('gameOver');
            if (gameOverElement) {
                gameOverElement.style.display = 'none';
            }
        }
    }

    public returnToMenu(): void {
        this.showMenu();
    }

    public update(delta: number): void {
        if (this.currentGame) {
            this.currentGame.update(delta);
        }
    }

    public destroy(): void {
        if (this.currentGame) {
            this.currentGame.destroy();
        }
        if (this.menu) {
            this.menu.destroy();
        }
    }
} 