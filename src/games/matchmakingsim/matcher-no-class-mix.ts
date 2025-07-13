import { Lobby } from "./lobby";
import { Matcher } from "./matcher";

export class MatcherNoClassMix {
    /**
     * Strict matching algorithm when class mixing is NOT allowed
     * All teams must have lobbies of the same class
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
        const allSixPlayerCombinations = this.findAllSixPlayerCombinations(lobbies);
        
        for (const sixPlayerCombination of allSixPlayerCombinations) {
            // Try to split this combination into two teams of 3 players each
            const teams = this.splitIntoTeams(sixPlayerCombination);
            if (teams) {
                return teams;
            }
        }
        
        return null;
    }

    private static findAllSixPlayerCombinations(lobbies: Lobby[]): Lobby[][] {
        const results: Lobby[][] = [];
        this.findAllCombinations(lobbies, 6, 0, [], results);
        return results;
    }

    private static findAllCombinations(lobbies: Lobby[], targetPlayers: number, startIndex: number, currentCombination: Lobby[], results: Lobby[][]): void {
        const currentPlayerCount = currentCombination.reduce((sum, lobby) => sum + lobby.playerCount, 0);
        
        if (currentPlayerCount === targetPlayers) {
            results.push([...currentCombination]);
            return;
        }
        
        if (currentPlayerCount > targetPlayers || startIndex >= lobbies.length) {
            return;
        }
        
        // Try including the current lobby
        this.findAllCombinations(
            lobbies, 
            targetPlayers, 
            startIndex + 1, 
            [...currentCombination, lobbies[startIndex]],
            results
        );
        
        // Try skipping the current lobby
        this.findAllCombinations(lobbies, targetPlayers, startIndex + 1, currentCombination, results);
    }

    private static splitIntoTeams(lobbies: Lobby[]): { team1: Lobby[], team2: Lobby[] } | null {
        // Use comprehensive search for class-compatible teams
        return this.findClassCompatibleTeams(lobbies);
    }

    private static findClassCompatibleTeams(lobbies: Lobby[]): { team1: Lobby[], team2: Lobby[] } | null {
        
        for (let i = 0; i <= lobbies.length; i++) {
            const team1Combinations = this.getCombinations(lobbies, i);
            
            for (const team1Lobbies of team1Combinations) {
                const team1PlayerCount = team1Lobbies.reduce((sum, lobby) => sum + lobby.playerCount, 0);
                
                if (team1PlayerCount === 3) {
                    const team2Lobbies = lobbies.filter(lobby => !team1Lobbies.includes(lobby));
                    const team2PlayerCount = team2Lobbies.reduce((sum, lobby) => sum + lobby.playerCount, 0);
                    
                    if (team2PlayerCount === 3) {
                        const team1Compatible = this.isTeamClassCompatible(team1Lobbies);
                        const team2Compatible = this.isTeamClassCompatible(team2Lobbies);
                        
                        // Check if both teams are class-compatible
                        if (team1Compatible && team2Compatible) {
                            return { team1: team1Lobbies, team2: team2Lobbies };
                        }
                    }
                }
            }
        }
        
        return null;
    }

    private static isTeamClassCompatible(lobbies: Lobby[]): boolean {
        if (lobbies.length <= 1) return true;
        
        const firstClassId = lobbies[0].classId;
        return lobbies.every(lobby => lobby.classId === firstClassId);
    }

    private static findAIAssistedMatch(aiEligibleLobbies: Lobby[]): { team1: Lobby[], team2: Lobby[], aiPlayers: number } | null {
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
        
        // Try all possible ways to split the lobbies into two teams with class restrictions
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
                    
                    // Check class compatibility for both teams
                    if (this.isTeamClassCompatible(team1Lobbies) && this.isTeamClassCompatible(team2Lobbies)) {
                        return { team1: team1Lobbies, team2: team2Lobbies };
                    }
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