import { Lobby, Player } from "./lobby";

const AI_ELIGIBLE_TIME = 15000; //after this time, the lobby is eligible for AI players or allies
const AI_ELIGIBLE_TIME_THRESHOLD = 30000; // after this time, this lobby is going in, and taking any AI Eligible lobbies with it

export class Matcher {
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
        this.updateAiEligibility();
        this.runMatchAlgorithm();
        this.updateLobbyQueueDisplay();
    }

    private updateAiEligibility() {
        const now = Date.now();
        this.queuedLobbies.forEach(lobby => {
            if (!lobby.aiEligible && lobby.timeJoined > 0) {
                const queueTime = now - lobby.timeJoined;
                if (queueTime >= AI_ELIGIBLE_TIME) { // 5 seconds
                    lobby.aiEligible = true;
                    console.log(`Lobby #${lobby.id} is now AI eligible after ${queueTime/1000}s`);
                }
            }
        });
    }

    private findAIAssistedMatch(aiEligibleLobbies: Lobby[]): { team1: Lobby[], team2: Lobby[], aiPlayers: number } | null {
        // Try to find combinations of AI-eligible lobbies + AI players to make 6 players
        // Start with maximum lobbies and work down to prioritize human players
        for (let i = aiEligibleLobbies.length; i >= 1; i--) {
            // Try all combinations of i AI-eligible lobbies
            const combinations = this.getCombinations(aiEligibleLobbies, i);
            
            for (const combination of combinations) {
                const humanPlayerCount = combination.reduce((sum, lobby) => sum + lobby.playerCount, 0);
                const neededAIPlayers = 6 - humanPlayerCount;
                
                if (neededAIPlayers >= 0 && neededAIPlayers <= 6) {
                    // Try to split human lobbies into teams
                    const teams = this.splitIntoTeamsWithAI(combination, neededAIPlayers);
                    if (teams) {
                        console.log(`AI-assisted match: ${humanPlayerCount} human + ${neededAIPlayers} AI players`);
                        return { ...teams, aiPlayers: neededAIPlayers };
                    }
                }
            }
        }
        
        return null;
    }

    private splitIntoTeamsWithAI(lobbies: Lobby[], aiPlayers: number): { team1: Lobby[], team2: Lobby[] } | null {
        // If we have exactly 6 human players, use normal splitting
        if (aiPlayers === 0) {
            return this.splitIntoTeams(lobbies);
        }
        
        // Try to distribute human lobbies across teams, then fill with AI
        // We need to find a way to split lobbies so that each team gets exactly 3 players (human + AI)
        
        // Try all possible ways to split the lobbies into two teams
        for (let i = 0; i <= lobbies.length; i++) {
            // Try all combinations of i lobbies for team 1
            const team1Combinations = this.getCombinations(lobbies, i);
            
            for (const team1Lobbies of team1Combinations) {
                const team2Lobbies = lobbies.filter(lobby => !team1Lobbies.includes(lobby));
                
                const team1HumanCount = team1Lobbies.reduce((sum, lobby) => sum + lobby.playerCount, 0);
                const team2HumanCount = team2Lobbies.reduce((sum, lobby) => sum + lobby.playerCount, 0);
                
                // Each team needs exactly 3 players
                const team1AINeeded = 3 - team1HumanCount;
                const team2AINeeded = 3 - team2HumanCount;
                
                // Check if this split is valid
                if (team1AINeeded >= 0 && team2AINeeded >= 0 && 
                    team1AINeeded + team2AINeeded === aiPlayers &&
                    team1HumanCount <= 3 && team2HumanCount <= 3) {
                    
                    console.log(`Split: Team1 (${team1HumanCount} humans + ${team1AINeeded} AI), Team2 (${team2HumanCount} humans + ${team2AINeeded} AI)`);
                    return { team1: team1Lobbies, team2: team2Lobbies };
                }
            }
        }
        
        return null;
    }

    private getCombinations<T>(array: T[], size: number): T[][] {
        // Generate all combinations of 'size' elements from array
        if (size === 0) return [[]];
        if (array.length === 0) return [];
        
        const [first, ...rest] = array;
        const withFirst = this.getCombinations(rest, size - 1).map(combo => [first, ...combo]);
        const withoutFirst = this.getCombinations(rest, size);
        
        return [...withFirst, ...withoutFirst];
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
                if (timeInQueue >= AI_ELIGIBLE_TIME_THRESHOLD) {
                    statusText = '[AI-READY]';
                    lobbyElement.className = 'queue-lobby queue-lobby-ai-ready';
                } else if (lobby.aiEligible) {
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
        /*
        - the goal is to fill a full match
        - a full match has 6 players, 3 vs 3
        - the algorithm should put together different lobbies to make a full match
        - always serve the oldest lobby first
        - AI-eligible lobbies (5+ seconds) can match with other AI-eligible lobbies
        - Only after 30+ seconds can lobbies be matched with AI
        - Fresh human lobbies cannot be mixed with AI lobbies
        */
        
        if (this.queuedLobbies.length === 0) return;
        const startTime = performance.now();
        
        // First try: Normal matching (all lobbies, no AI)
        const normalMatch = this.findSixPlayerMatch(this.queuedLobbies);
        
        if (normalMatch) {
            console.log('🎯 Normal match found (human lobbies only)');
            this.createMatch(normalMatch.team1, normalMatch.team2);
        } else {
            // Second try: AI-eligible lobbies matching with each other (no AI yet)
            const aiEligibleLobbies = this.queuedLobbies.filter(lobby => lobby.aiEligible);
            if (aiEligibleLobbies.length > 0) {
                const aiEligibleMatch = this.findSixPlayerMatch(aiEligibleLobbies);
                if (aiEligibleMatch) {
                    console.log('🤖 AI-eligible match found (no AI, just eligible lobbies)');
                    this.createMatch(aiEligibleMatch.team1, aiEligibleMatch.team2);
                } else {
                    // Third try: AI-assisted matching for lobbies that have waited 15+ seconds
                    const now = Date.now();
                    const aiReadyLobbies = aiEligibleLobbies.filter(lobby => {
                        const queueTime = now - lobby.timeJoined;
                        return queueTime >= AI_ELIGIBLE_TIME_THRESHOLD;
                    });
                    
                    if (aiReadyLobbies.length > 0) {
                        // Include all AI-eligible lobbies (5+ seconds) when making AI-assisted match
                        const aiAssistedMatch = this.findAIAssistedMatch(aiEligibleLobbies);
                        if (aiAssistedMatch) {
                            console.log('🤖🎮 AI-assisted match found (AI-ready + AI-eligible lobbies + AI)');
                            this.createMatch(aiAssistedMatch.team1, aiAssistedMatch.team2, aiAssistedMatch.aiPlayers);
                        }
                    }
                }
            }
        }
        
        const endTime = performance.now();
        const duration = (endTime - startTime).toFixed(2);
        console.log(`Algo Tick: ${ duration}ms`);
    }

    private findSixPlayerMatch(lobbies: Lobby[]): { team1: Lobby[], team2: Lobby[] } | null {
        // Try to find combinations that sum to exactly 6 players
        // Then split into two teams of 3 players each
        
        for (let i = 0; i < lobbies.length; i++) {
            const sixPlayerCombination = this.findCombination(lobbies, 6, i, []);
            if (sixPlayerCombination) {
                // Try to split this combination into two teams of 3 players each
                const teams = this.splitIntoTeams(sixPlayerCombination);
                if (teams) {
                    return teams;
                }
            }
        }
        
        return null;
    }

    private findCombination(lobbies: Lobby[], targetPlayers: number, startIndex: number, currentCombination: Lobby[]): Lobby[] | null {
        // Base case: if we've reached exactly 6 players
        const currentPlayerCount = currentCombination.reduce((sum, lobby) => sum + lobby.playerCount, 0);
        
        if (currentPlayerCount === targetPlayers) {
            return currentCombination;
        }
        
        // If we've exceeded 6 players or reached the end of lobbies, backtrack
        if (currentPlayerCount > targetPlayers || startIndex >= lobbies.length) {
            return null;
        }
        
        // Try including the current lobby
        const withCurrent = this.findCombination(
            lobbies, 
            targetPlayers, 
            startIndex + 1, 
            [...currentCombination, lobbies[startIndex]]
        );
        
        if (withCurrent) {
            return withCurrent;
        }
        
        // Try skipping the current lobby
        return this.findCombination(lobbies, targetPlayers, startIndex + 1, currentCombination);
    }

    private splitIntoTeams(lobbies: Lobby[]): { team1: Lobby[], team2: Lobby[] } | null {
        // Try to split lobbies into two teams of exactly 3 players each
        // This is a subset sum problem where we need one subset with exactly 3 players
        
        const result = this.findTeamCombination(lobbies, 3, 0, []);
        if (result) {
            // Get the remaining lobbies for team 2
            const team2 = lobbies.filter(lobby => !result.includes(lobby));
            const team2PlayerCount = team2.reduce((sum, lobby) => sum + lobby.playerCount, 0);
            
            // Verify team 2 also has exactly 3 players
            if (team2PlayerCount === 3) {
                return { team1: result, team2: team2 };
            }
        }
        
        return null;
    }

    private findTeamCombination(lobbies: Lobby[], targetPlayers: number, startIndex: number, currentCombination: Lobby[]): Lobby[] | null {
        // Find a combination of lobbies that sum to exactly targetPlayers
        const currentPlayerCount = currentCombination.reduce((sum, lobby) => sum + lobby.playerCount, 0);
        
        if (currentPlayerCount === targetPlayers) {
            return currentCombination;
        }
        
        if (currentPlayerCount > targetPlayers || startIndex >= lobbies.length) {
            return null;
        }
        
        // Try including the current lobby
        const withCurrent = this.findTeamCombination(
            lobbies, 
            targetPlayers, 
            startIndex + 1, 
            [...currentCombination, lobbies[startIndex]]
        );
        
        if (withCurrent) {
            return withCurrent;
        }
        
        // Try skipping the current lobby
        return this.findTeamCombination(lobbies, targetPlayers, startIndex + 1, currentCombination);
    }

    private createMatch(team1: Lobby[], team2: Lobby[], aiPlayers: number = 0) {
        const allLobbies = [...team1, ...team2];
        const humanPlayers = allLobbies.reduce((sum, lobby) => sum + lobby.playerCount, 0);
        const totalPlayers = humanPlayers + aiPlayers;
        
        console.log(`🎮 3v3 Match Created! ${totalPlayers} players (${humanPlayers} human + ${aiPlayers} AI):`);
        console.log(`  Team 1 (${team1.reduce((sum, lobby) => sum + lobby.playerCount, 0)} players):`);
        team1.forEach(lobby => {
            console.log(`    - Lobby #${lobby.id} (${lobby.playerCount} players)`);
        });
        console.log(`  Team 2 (${team2.reduce((sum, lobby) => sum + lobby.playerCount, 0)} players):`);
        team2.forEach(lobby => {
            console.log(`    - Lobby #${lobby.id} (${lobby.playerCount} players)`);
        });
        
        if (aiPlayers > 0) {
            console.log(`  + ${aiPlayers} AI players distributed across teams`);
        }
        
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
            .join(', ');
        lobbyDiv.textContent = playerNames;
        
        return lobbyDiv;
    }

    private createAIPlayerElement(): HTMLElement {
        const aiDiv = document.createElement('div');
        aiDiv.className = 'match-lobby ai-player';
        aiDiv.textContent = `AI-Bot${Math.floor(Math.random() * 1000)}`;
        return aiDiv;
    }
} 