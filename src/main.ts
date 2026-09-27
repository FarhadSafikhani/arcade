import { gamesConfig, GameConfig } from './games.config';
import { VERSION } from './version';

// Global functions for game control
declare global {
    interface Window {
        startGame: (gameId: string) => void;
        returnToMainMenu: () => void;
    }
}

async function init() {
    try {
        // Update version display
        updateVersionDisplay();
        
        // Generate menu buttons using imported config
        generateMenuButtons(gamesConfig.games);
        
        // Set up global functions
        window.startGame = startGame;
        window.returnToMainMenu = returnToMainMenu;
    } catch (error) {
        console.error('Failed to initialize:', error);
    }
}

function updateVersionDisplay() {
    const versionElement = document.getElementById('version-number');
    if (versionElement) {
        versionElement.textContent = "v" + VERSION;
    }
}

function generateMenuButtons(games: GameConfig[]) {
    const gameGrid = document.getElementById('gameGrid');
    
    if (!gameGrid) {
        console.error('Game grid element not found!');
        return;
    }
    
    gameGrid.innerHTML = '';
    
    games.forEach(game => {
        const button = document.createElement('div');
        button.className = game.available ? 'game-button' : 'game-button disabled';
        button.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        if (!game.available) {
            button.setAttribute('aria-disabled', 'true');
        }
        
        button.innerHTML = `
            <span class="game-icon">${game.icon} ${game.name}</span>
            <div class="game-description">${game.available ? game.description : 'Coming soon'}</div>
        `;
        
        if (game.available) {
            button.addEventListener('click', () => startGame(game.id));
        }
        
        gameGrid.appendChild(button);
    });
}

function startGame(gameId: string) {
    // Navigate to the game page using convention: /games/{gameId}/index.html
    // Vite handles the base URL automatically
    window.location.href = `/arcade/games/${gameId}/index.html`;
}

function returnToMainMenu() {
    // Navigate back to main menu
    window.location.href = '/arcade/';
}

// Initialize when page loads
window.addEventListener('load', init);
