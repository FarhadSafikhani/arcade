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
        // Generate menu buttons using imported config
        generateMenuButtons(gamesConfig.games);
        
        // Set up global functions
        window.startGame = startGame;
        window.returnToMainMenu = returnToMainMenu;
    } catch (error) {
        console.error('Failed to initialize:', error);
    }
}

function generateMenuButtons(games: GameConfig[]) {
    const gameGrid = document.getElementById('gameGrid');
    
    if (!gameGrid) {
        console.error('Game grid element not found!');
        return;
    }
    
    gameGrid.innerHTML = '';
    
    // Filter out unavailable games
    const availableGames = games.filter(game => game.available);
    
    availableGames.forEach(game => {
        const button = document.createElement('div');
        button.className = 'game-button';
        button.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        
        button.innerHTML = `
            <span class="game-icon">${game.icon} ${game.name}</span>
            <div class="game-description">${game.description}</div>
        `;
        
        button.addEventListener('click', () => startGame(game.id));
        
        gameGrid.appendChild(button);
    });
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