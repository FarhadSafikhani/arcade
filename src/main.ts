import { Application } from 'pixi.js';
import { GameManager } from './game.manager';

// Make functions globally available
declare global {
    interface Window {
        restartGame: () => void;
        returnToMenu: () => void;
    }
}

let app: Application;
let gameManager: GameManager;

async function init() {
    // Create the PIXI Application with menu dimensions
    app = new Application({
        width: 1000,
        height: 800,
        backgroundColor: 0x2c3e50,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
    });

    // Add the canvas to the DOM
    const gameContainer = document.getElementById('gameContainer');
    if (gameContainer) {
        gameContainer.appendChild(app.view as HTMLCanvasElement);
    }

    // Initialize game manager
    gameManager = new GameManager(app);

    // Start the game loop
    app.ticker.add(gameLoop);

    // Handle window resize
    window.addEventListener('resize', onResize);
    onResize();
}

function gameLoop(delta: number) {
    if (gameManager) {
        gameManager.update(delta);
    }
}

function onResize() {
    if (app) {
        const gameContainer = document.getElementById('gameContainer');
        if (gameContainer) {
            const containerRect = gameContainer.getBoundingClientRect();
            const scale = Math.min(
                containerRect.width / 1000,
                containerRect.height / 800
            );
            
            app.renderer.resize(1000 * scale, 800 * scale);
            app.stage.scale.set(scale);
        }
    }
}

// Global restart function
window.restartGame = () => {
    if (gameManager) {
        gameManager.restartCurrentGame();
    }
};

// Global return to menu function
window.returnToMenu = () => {
    if (gameManager) {
        gameManager.returnToMenu();
    }
};

// Initialize the game when the page loads
window.addEventListener('load', init); 