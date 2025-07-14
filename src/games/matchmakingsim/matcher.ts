import { Lobby } from "./lobby";
import { MatcherClassMix } from "./matcher-class-mix";
import { MatcherNoClassMix } from "./matcher-no-class-mix";



export class Matcher {

    public static AI_ELIGIBLE_TIME = 5000; //after this time, the lobby is eligible for AI players or allies
    public static AI_ELIGIBLE_TIME_THRESHOLD = 15000; // after this time, this lobby is going in, and taking any AI Eligible lobbies with it
    public static ALLOW_TEAM_CLASS_MIX = false;
    public static MAX_LOBBIES_PER_SEARCH = 150; // Limit search to oldest N lobbies for performance

    queuedLobbies: Lobby[];
    private onLobbyDelete: (lobbyId: number) => void;
    
    constructor(onLobbyDelete: (lobbyId: number) => void) {
        this.queuedLobbies = [];
        this.onLobbyDelete = onLobbyDelete;
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        document.addEventListener('lobbyReadyStatusChanged', (event: Event) => {
            const customEvent = event as CustomEvent;
            const { lobby, allReady } = customEvent.detail;
            
            if (allReady && !this.isLobbyQueued(lobby)) {
                this.addLobby(lobby);
            } else if (!allReady && this.isLobbyQueued(lobby)) {
                this.removeLobby(lobby);
            }
        });
    }

    isLobbyQueued(lobby: Lobby): boolean {
        return this.queuedLobbies.includes(lobby);
    }

    addLobby(lobby: Lobby) {
        this.queuedLobbies.push(lobby);
        lobby.setTimeJoined(Date.now());
    }

    removeLobby(lobby: Lobby) {
        lobby.setTimeJoined(0);
        this.queuedLobbies.splice(this.queuedLobbies.indexOf(lobby), 1);
    }

    tick() {
        this.runMatchAlgorithm();
        this.updateLobbyQueueDisplay();
    }





    updateLobbyQueueDisplay() {
        // add qued lobby elements for each lobby in the queue queuedLobbies
        const matchQueueList = document.getElementById('matchQueueList');
        if (matchQueueList) {
            matchQueueList.innerHTML = '';
            this.queuedLobbies.forEach(lobby => {
                const lobbyElement = document.createElement('div');
                const timeInQueue = Date.now() - lobby.timeJoined;
                const minutes = Math.floor(timeInQueue / 60000);
                const seconds = Math.floor((timeInQueue % 60000) / 1000);
                
                // Determine status and styling based on time in queue
                let statusText = '';
                if (timeInQueue >= Matcher.AI_ELIGIBLE_TIME_THRESHOLD) {
                    statusText = '[AI-READY]';
                    lobbyElement.className = 'queue-lobby queue-lobby-ai-ready';
                } else if (lobby.isAiEligible) {
                    statusText = '[AI-ELIGIBLE]';
                    lobbyElement.className = 'queue-lobby queue-lobby-ai-eligible';
                } else {
                    statusText = '[NO AI]';
                    lobbyElement.className = 'queue-lobby queue-lobby-normal';
                }
                
                // Create info line
                const infoDiv = document.createElement('div');
                infoDiv.className = 'queue-lobby-info';
                infoDiv.textContent = 'Lobby:' + lobby.id.toString() + ' - P:' + lobby.playerCount + ' - inQ:';
                infoDiv.textContent += minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
                
                // Create status line
                const statusDiv = document.createElement('div');
                statusDiv.className = 'queue-lobby-status';
                statusDiv.textContent = statusText;
                
                lobbyElement.appendChild(infoDiv);
                lobbyElement.appendChild(statusDiv);
                matchQueueList.appendChild(lobbyElement);
            });
        }
    }

    runMatchAlgorithm() {
        if (this.queuedLobbies.length === 0) return;
        const startTime = performance.now();
        
        // Process multiple matches per tick for better performance
        const maxMatchesPerTick = 5; // Process up to 5 matches per tick
        let matchesProcessed = 0;
        
        while (matchesProcessed < maxMatchesPerTick && this.queuedLobbies.length > 0) {
            // Delegate to the appropriate algorithm based on class mixing setting
            let result: { team1: Lobby[], team2: Lobby[], aiPlayers?: number } | null = null;
            
            if (Matcher.ALLOW_TEAM_CLASS_MIX) {
                result = MatcherClassMix.runMatchAlgorithm(this.queuedLobbies);
            } else {
                result = MatcherNoClassMix.runMatchAlgorithm(this.queuedLobbies);
            }
            
            if (result) {
                this.createMatch(result.team1, result.team2, result.aiPlayers || 0);
                matchesProcessed++;
            } else {
                // No more matches possible, break out of loop
                break;
            }
        }
        
        const endTime = performance.now();
        const duration = (endTime - startTime).toFixed(2);
        console.log(`Algo Tick: ${duration}ms (${matchesProcessed} matches)`);
    }



    private createMatch(team1: Lobby[], team2: Lobby[], aiPlayers: number = 0) {
        const allLobbies = [...team1, ...team2];
        
        // Display match results in HTML
        this.displayMatchResult(team1, team2, aiPlayers);
        
        // Remove matched lobbies from queue and delete from game
        allLobbies.forEach(lobby => {
            const index = this.queuedLobbies.indexOf(lobby);
            if (index > -1) {
                this.queuedLobbies.splice(index, 1);
                lobby.setTimeJoined(0); // Reset time
            }
            // Delete lobby from game (only real lobbies, not AI ones)
            if (lobby.id >= 0) {
                this.onLobbyDelete(lobby.id);
            }
        });
    }

    private displayMatchResult(team1: Lobby[], team2: Lobby[], aiPlayers: number = 0) {
        const matchResultsList = document.getElementById('matchResultsList');
        if (matchResultsList) {
            const matchDiv = document.createElement('div');
            matchDiv.className = 'match-result';

            // Teams container
            const teamsDiv = document.createElement('div');
            teamsDiv.className = 'match-teams';

            // Create both teams
            const team1Div = this.createTeamElement(team1, 'team-blue', aiPlayers);
            const team2Div = this.createTeamElement(team2, 'team-red', aiPlayers);

            teamsDiv.appendChild(team1Div);
            teamsDiv.appendChild(team2Div);
            matchDiv.appendChild(teamsDiv);
            
            // Add to top of results (newest first)
            matchResultsList.insertBefore(matchDiv, matchResultsList.firstChild);
        }
    }

    private createTeamElement(lobbies: Lobby[], teamClass: string, totalAIPlayers: number): HTMLElement {
        const teamDiv = document.createElement('div');
        teamDiv.className = `team-box ${teamClass}`;

        // Add human players from lobbies
        lobbies.forEach(lobby => {
            const lobbyDiv = this.createLobbyElement(lobby);
            teamDiv.appendChild(lobbyDiv);
        });

        // Add AI players if needed
        if (totalAIPlayers > 0) {
            const humanPlayers = lobbies.reduce((sum, lobby) => sum + lobby.playerCount, 0);
            const aiNeeded = 3 - humanPlayers;
            
            for (let i = 0; i < aiNeeded; i++) {
                const aiDiv = this.createAIPlayerElement();
                teamDiv.appendChild(aiDiv);
            }
        }

        return teamDiv;
    }

    private createLobbyElement(lobby: Lobby): HTMLElement {
        const lobbyDiv = document.createElement('div');
        lobbyDiv.className = 'match-lobby';
        
        const playerNames = lobby.playerSlots
            .filter(slot => slot !== null)
            .map(player => player!.name)
            .join(' | ');
        
        // Create player names element
        const playersSpan = document.createElement('span');
        playersSpan.textContent = playerNames;
        
        // Create small classId element
        const classIdSpan = document.createElement('span');
        classIdSpan.className = 'match-lobby-class';
        classIdSpan.textContent = `c${lobby.classId}`;
        
        lobbyDiv.appendChild(playersSpan);
        lobbyDiv.appendChild(classIdSpan);
        
        return lobbyDiv;
    }

    private createAIPlayerElement(): HTMLElement {
        const aiDiv = document.createElement('div');
        aiDiv.className = 'match-lobby ai-player';
        aiDiv.textContent = '🤖';
        return aiDiv;
    }
} 