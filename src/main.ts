import { Application } from 'pixi.js';
import { gamesConfig, GameConfig } from './config';

// Global functions for game control
declare global {
    interface Window {
        startGame: (gameId: string) => void;
        returnToMainMenu: () => void;
    }
}

async function init() {
    try {
        console.log('Initializing arcade collection...');
        console.log('Games config:', gamesConfig);
        
        // Generate menu buttons using imported config
        generateMenuButtons(gamesConfig.games);
        
        // Set up global functions
        window.startGame = startGame;
        window.returnToMainMenu = returnToMainMenu;
        
        console.log('Initialization complete');
    } catch (error) {
        console.error('Failed to initialize:', error);
    }
}

function generateMenuButtons(games: GameConfig[]) {
    console.log('Generating menu buttons for', games.length, 'games');
    const gameGrid = document.getElementById('gameGrid');
    console.log('Game grid element:', gameGrid);
    
    if (!gameGrid) {
        console.error('Game grid element not found!');
        return;
    }
    
    gameGrid.innerHTML = '';
    
    games.forEach(game => {
        console.log('Creating button for game:', game.name);
        const button = document.createElement('div');
        button.className = `game-button ${game.available ? '' : 'disabled'}`;
        button.style.borderColor = game.available ? game.color : 'rgba(255, 255, 255, 0.3)';
        
        button.innerHTML = `
            <span class="game-icon">${game.icon} ${game.name}</span>
            <div class="game-description">${game.description}</div>
        `;
        
        if (game.available) {
            button.addEventListener('click', () => startGame(game.id));
        }
        
        gameGrid.appendChild(button);
    });
    
    console.log('Menu buttons generated successfully');
}

function startGame(gameId: string) {
    // Navigate to the game page
    window.location.href = `/arcade/games/${gameId}/index.html`;
}

function returnToMainMenu() {
    // Navigate back to main menu
    window.location.href = '/arcade/';
}

// Initialize when page loads
window.addEventListener('load', init); 