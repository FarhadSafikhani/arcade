import { Application, Assets, Sprite, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Game } from './Game';

// Make functions globally available
declare global {
    interface Window {
        restartGame: () => void;
        startGame: () => void;
    }
}

let app: Application;
let game: Game;
let gameStarted: boolean = false;

async function init() {
    // Calculate game dimensions based on grid settings
    const GRID_SIZE = 50;
    const GRID_WIDTH = 20;
    const GRID_HEIGHT = 20;
    const GAME_WIDTH = GRID_WIDTH * GRID_SIZE;  // 900
    const GAME_HEIGHT = GRID_HEIGHT * GRID_SIZE; // 750
    
    // Create the PIXI Application with dynamic sizing
    app = new Application({
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        backgroundColor: 0x2c3e50,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
    });

    // Add the canvas to the DOM
    const gameContainer = document.getElementById('gameContainer');
    if (gameContainer) {
        gameContainer.appendChild(app.view as HTMLCanvasElement);
    }

    // Handle window resize
    window.addEventListener('resize', onResize);
    onResize();
}

function gameLoop(delta: number) {
    if (game && gameStarted) {
        game.update(delta);
    }
}

function onResize() {
    if (app) {
        const gameContainer = document.getElementById('gameContainer');
        if (gameContainer) {
            const containerRect = gameContainer.getBoundingClientRect();
            const GAME_WIDTH = 30 * 30;  // GRID_WIDTH * GRID_SIZE = 900
            const GAME_HEIGHT = 25 * 30; // GRID_HEIGHT * GRID_SIZE = 750
            
            const scale = Math.min(
                containerRect.width / GAME_WIDTH,
                containerRect.height / GAME_HEIGHT
            );
            
            app.renderer.resize(GAME_WIDTH * scale, GAME_HEIGHT * scale);
            app.stage.scale.set(scale);
        }
    }
}

// Global start game function
window.startGame = async () => {
    if (!gameStarted) {
        // Hide start menu
        const startMenu = document.getElementById('startMenu');
        if (startMenu) {
            startMenu.style.display = 'none';
        }
        
        // Show UI
        const ui = document.getElementById('ui');
        if (ui) {
            ui.style.display = 'block';
        }
        
        // Initialize the game
        game = new Game(app);
        await game.init();
        
        // Start the game loop
        app.ticker.add(gameLoop);
        
        gameStarted = true;
    }
};

// Global restart function
window.restartGame = () => {
    if (game) {
        game.restart();
        // Ensure game over modal is hidden
        const gameOverElement = document.getElementById('gameOver');
        if (gameOverElement) {
            gameOverElement.style.display = 'none';
        }
    }
};

// Initialize the game when the page loads
window.addEventListener('load', init); 