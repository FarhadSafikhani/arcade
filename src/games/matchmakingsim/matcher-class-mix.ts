import { Lobby } from "./lobby";
import { Matcher } from "./matcher";

export class MatcherClassMix {
    /**
     * Simple matching algorithm when class mixing is allowed
     * No class compatibility checks needed
     */
    static runMatchAlgorithm(queuedLobbies: Lobby[]): { team1: Lobby[], team2: Lobby[], aiPlayers?: number } | null {
        if (queuedLobbies.length === 0) return null;

        // First try: Normal matching (all lobbies, no AI)
        const normalMatch = this.findSixPlayerMatch(queuedLobbies);
        
        if (normalMatch) {
            return normalMatch;
        } else {
            // Second try: AI-eligible lobbies matching with each other (no AI yet)
            const aiEligibleLobbies = queuedLobbies.filter(lobby => lobby.aiEligible);
            if (aiEligibleLobbies.length > 0) {
                const aiEligibleMatch = this.findSixPlayerMatch(aiEligibleLobbies);
                if (aiEligibleMatch) {
                    return aiEligibleMatch;
                } else {
                    // Third try: AI-assisted matching for lobbies that have waited 30+ seconds
                    const now = Date.now();
                    const aiReadyLobbies = aiEligibleLobbies.filter(lobby => {
                        const queueTime = now - lobby.timeJoined;
                        return queueTime >= Matcher.AI_ELIGIBLE_TIME_THRESHOLD;
                    });
                    
                    if (aiReadyLobbies.length > 0) {
                        const aiAssistedMatch = this.findAIAssistedMatch(aiEligibleLobbies);
                        if (aiAssistedMatch) {
                            return aiAssistedMatch;
                        }
                    }
                }
            }
        }
        
        return null;
    }

    private static findSixPlayerMatch(lobbies: Lobby[]): { team1: Lobby[], team2: Lobby[] } | null {
        const sixPlayerCombination = this.findCombination(lobbies, 6, 0, []);
        if (sixPlayerCombination) {
            // Try to split this combination into two teams of 3 players each
            const teams = this.splitIntoTeams(sixPlayerCombination);
            if (teams) {
                return teams;
            }
        }
        
        return null;
    }

    private static findCombination(lobbies: Lobby[], targetPlayers: number, startIndex: number, currentCombination: Lobby[]): Lobby[] | null {
        const currentPlayerCount = currentCombination.reduce((sum, lobby) => sum + lobby.playerCount, 0);
        
        if (currentPlayerCount === targetPlayers) {
            return currentCombination;
        }
        
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

    private static splitIntoTeams(lobbies: Lobby[]): { team1: Lobby[], team2: Lobby[] } | null {
        // Simple splitting - no class compatibility checks needed
        const result = this.findTeamCombination(lobbies, 3, 0, []);
        if (result) {
            const team2 = lobbies.filter(lobby => !result.includes(lobby));
            const team2PlayerCount = team2.reduce((sum, lobby) => sum + lobby.playerCount, 0);
            
            if (team2PlayerCount === 3) {
                return { team1: result, team2: team2 };
            }
        }
        
        return null;
    }

    private static findTeamCombination(lobbies: Lobby[], targetPlayers: number, startIndex: number, currentCombination: Lobby[]): Lobby[] | null {
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

    private static findAIAssistedMatch(aiEligibleLobbies: Lobby[]): { team1: Lobby[], team2: Lobby[], aiPlayers: number } | null {
        // Simple AI-assisted matching without class restrictions
        for (let i = aiEligibleLobbies.length; i >= 1; i--) {
            const combinations = this.getCombinations(aiEligibleLobbies, i);
            
            for (const combination of combinations) {
                const humanPlayerCount = combination.reduce((sum, lobby) => sum + lobby.playerCount, 0);
                const neededAIPlayers = 6 - humanPlayerCount;
                
                if (neededAIPlayers >= 0 && neededAIPlayers <= 6) {
                    const teams = this.splitIntoTeamsWithAI(combination, neededAIPlayers);
                    if (teams) {
                        return { ...teams, aiPlayers: neededAIPlayers };
                    }
                }
            }
        }
        
        return null;
    }

    private static splitIntoTeamsWithAI(lobbies: Lobby[], aiPlayers: number): { team1: Lobby[], team2: Lobby[] } | null {
        if (aiPlayers === 0) {
            return this.splitIntoTeams(lobbies);
        }
        
        // Simple AI distribution without class checks
        for (let i = 0; i <= lobbies.length; i++) {
            const team1Combinations = this.getCombinations(lobbies, i);
            
            for (const team1Lobbies of team1Combinations) {
                const team2Lobbies = lobbies.filter(lobby => !team1Lobbies.includes(lobby));
                
                const team1HumanCount = team1Lobbies.reduce((sum, lobby) => sum + lobby.playerCount, 0);
                const team2HumanCount = team2Lobbies.reduce((sum, lobby) => sum + lobby.playerCount, 0);
                
                const team1AINeeded = 3 - team1HumanCount;
                const team2AINeeded = 3 - team2HumanCount;
                
                if (team1AINeeded >= 0 && team2AINeeded >= 0 && 
                    team1AINeeded + team2AINeeded === aiPlayers &&
                    team1HumanCount <= 3 && team2HumanCount <= 3) {
                    
                    return { team1: team1Lobbies, team2: team2Lobbies };
                }
            }
        }
        
        return null;
    }

    private static getCombinations<T>(array: T[], size: number): T[][] {
        if (size === 0) return [[]];
        if (array.length === 0) return [];
        
        const [first, ...rest] = array;
        const withFirst = this.getCombinations(rest, size - 1).map(combo => [first, ...combo]);
        const withoutFirst = this.getCombinations(rest, size);
        
        return [...withFirst, ...withoutFirst];
    }
} 