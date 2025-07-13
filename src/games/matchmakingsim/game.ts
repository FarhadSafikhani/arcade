import { Lobby, Player } from './lobby.js';
import { Matcher } from './matcher.js';

export class MatchMakingSimGame {
    private isPaused: boolean = false;
    private removeTopBarHandler?: () => void;
    private lobbies: Map<number, Lobby> = new Map();
    private nextLobbyId: number = 0;
    private matcher: Matcher = new Matcher((lobbyId: number) => this.deleteLobby(lobbyId));

    constructor() {
        this.init();
    }

    private init(): void {
        this.setupTopBarEvents();
        this.setupUI();
        this.startHeartbeat();
    }

    private setupUI(): void {
        const createLobbyBtn = document.getElementById('createLobbyBtn');
        if (createLobbyBtn) {
            createLobbyBtn.addEventListener('click', () => this.addLobby());
        }
    }

    private addLobby(): void {
        const lobbyId = this.nextLobbyId++;
        const lobby = new Lobby(lobbyId, (id: number) => this.deleteLobby(id));
        this.lobbies.set(lobbyId, lobby);
    }

    public deleteLobby(lobbyId: number): void {
        const lobby = this.lobbies.get(lobbyId);
        if (lobby) {
            if (this.matcher.isLobbyQueued(lobby)) {
                this.matcher.removeLobby(lobby);
            }
            lobby.destroy();
            this.lobbies.delete(lobbyId);
        }
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

    togglePause(): void {
        this.isPaused = !this.isPaused;
        // Pause logic here
    }

    destroy(): void {
        if (this.removeTopBarHandler) {
            this.removeTopBarHandler();
        }
    }

    returnToMainMenu(): void {
        this.destroy();
        window.location.href = '/arcade/';
    }
    
    private startHeartbeat(): void {
        setInterval(() => {
            this.updateLobbies();
        }, 1000);
    }

    private updateLobbies(): void {
        this.lobbies.forEach((lobby) => {
            lobby.updateDisplay();
        });
        this.matcher.tick();
    }
}

// Initialize
let game: MatchMakingSimGame;

function initGame() {
    game = new MatchMakingSimGame();
}

// Global functions for HTML buttons
declare global {
    interface Window {
        returnToMainMenu: () => void;
        togglePause: () => void;
    }
}

window.returnToMainMenu = () => game?.returnToMainMenu();
window.togglePause = () => game?.togglePause();

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initGame);