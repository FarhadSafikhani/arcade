import { Lobby } from "./lobby";
import { Matcher } from "./matcher";

export class MatcherClassMix {
    /**
     * Optimized matching algorithm when class mixing is allowed
     * Uses greedy approach for better performance with many lobbies
     */
    static runMatchAlgorithm(queuedLobbiesSorted: Lobby[]): { team1: Lobby[], team2: Lobby[], aiPlayers?: number } | null {
        if (queuedLobbiesSorted.length === 0) return null;

        // First try: Normal matching (all lobbies, no AI)
        const normalMatch = this.findSixPlayerMatchGreedy(queuedLobbiesSorted);
        
        if (normalMatch) {
            return normalMatch;
        } 

        // Second try: AI-eligible lobbies matching with each other (no AI yet)
        const aiEligibleLobbies = queuedLobbiesSorted.filter(lobby => lobby.isAiEligible);
        if (aiEligibleLobbies.length > 0) {
            const aiEligibleMatch = this.findSixPlayerMatchGreedy(aiEligibleLobbies);
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
                    const aiAssistedMatch = this.findAIAssistedMatchGreedy(aiEligibleLobbies);
                    if (aiAssistedMatch) {
                        return aiAssistedMatch;
                    }
                }
            }
        }
        
        return null;
    }

    private static findSixPlayerMatchGreedy(lobbies: Lobby[]): { team1: Lobby[], team2: Lobby[] } | null {
        // Greedy approach: try to find exactly 6 players using a subset sum approach
        const targetPlayers = 6;
        
        // Use dynamic programming approach to find combinations that sum to 6
        const dp = new Array(targetPlayers + 1).fill(null).map(() => [] as Lobby[]);
        dp[0] = []; // 0 players can be achieved with empty set
        
        for (const lobby of lobbies) {
            const playerCount = lobby.playerCount;
            // Work backwards to avoid using the same lobby multiple times
            for (let i = targetPlayers; i >= playerCount; i--) {
                if (dp[i - playerCount] !== null) {
                    dp[i] = [...dp[i - playerCount], lobby];
                    
                    // Early termination: if we found 6 players, try to split into teams
                    if (i === targetPlayers) {
                        const teams = this.splitIntoTeamsGreedy(dp[i]);
                        if (teams) {
                            return teams;
                        }
                    }
                }
            }
        }
        
        return null;
    }

    private static splitIntoTeamsGreedy(lobbies: Lobby[]): { team1: Lobby[], team2: Lobby[] } | null {
        // Simple greedy approach: try to build team1 with 3 players, rest goes to team2
        const team1: Lobby[] = [];
        const team2: Lobby[] = [];
        let team1Players = 0;
        
        for (const lobby of lobbies) {
            const playerCount = lobby.playerCount;
            if (team1Players + playerCount <= 3) {
                team1.push(lobby);
                team1Players += playerCount;
            } else {
                team2.push(lobby);
            }
        }
        
        const team2Players = team2.reduce((sum, lobby) => sum + lobby.playerCount, 0);
        
        if (team1Players === 3 && team2Players === 3) {
            return { team1, team2 };
        }
        
        return null;
    }

    private static findAIAssistedMatchGreedy(aiEligibleLobbies: Lobby[]): { team1: Lobby[], team2: Lobby[], aiPlayers: number } | null {
        // Try different numbers of human players (starting from max to minimize AI players)
        for (let humanPlayers = Math.min(6, aiEligibleLobbies.reduce((sum, lobby) => sum + lobby.playerCount, 0)); humanPlayers >= 1; humanPlayers--) {
            const neededAIPlayers = 6 - humanPlayers;
            
            if (neededAIPlayers >= 0 && neededAIPlayers <= 6) {
                const humanMatch = this.findExactPlayerCountGreedy(aiEligibleLobbies, humanPlayers);
                if (humanMatch) {
                    const teams = this.splitIntoTeamsWithAIGreedy(humanMatch, neededAIPlayers);
                    if (teams) {
                        return { ...teams, aiPlayers: neededAIPlayers };
                    }
                }
            }
        }
        
        return null;
    }

    private static findExactPlayerCountGreedy(lobbies: Lobby[], targetPlayers: number): Lobby[] | null {
        // Dynamic programming to find combination with exact player count
        const dp = new Array(targetPlayers + 1).fill(null).map(() => null as Lobby[] | null);
        dp[0] = []; // 0 players can be achieved with empty set
        
        for (const lobby of lobbies) {
            const playerCount = lobby.playerCount;
            // Work backwards to avoid using the same lobby multiple times
            for (let i = targetPlayers; i >= playerCount; i--) {
                if (dp[i - playerCount] !== null) {
                    dp[i] = [...dp[i - playerCount]!, lobby];
                    
                    // Early termination: if we found the target, return immediately
                    if (i === targetPlayers) {
                        return dp[i];
                    }
                }
            }
        }
        
        return null;
    }

    private static splitIntoTeamsWithAIGreedy(lobbies: Lobby[], aiPlayers: number): { team1: Lobby[], team2: Lobby[] } | null {
        if (aiPlayers === 0) {
            return this.splitIntoTeamsGreedy(lobbies);
        }
        
        // Greedy approach: try to distribute human players as evenly as possible
        const team1: Lobby[] = [];
        const team2: Lobby[] = [];
        let team1Players = 0;
        let team2Players = 0;
        
        for (const lobby of lobbies) {
            const playerCount = lobby.playerCount;
            // Add to team with fewer players, but don't exceed 3
            if (team1Players + playerCount <= 3 && (team1Players <= team2Players || team2Players + playerCount > 3)) {
                team1.push(lobby);
                team1Players += playerCount;
            } else if (team2Players + playerCount <= 3) {
                team2.push(lobby);
                team2Players += playerCount;
            }
        }
        
        const team1AINeeded = 3 - team1Players;
        const team2AINeeded = 3 - team2Players;
        
        if (team1AINeeded >= 0 && team2AINeeded >= 0 && 
            team1AINeeded + team2AINeeded === aiPlayers &&
            team1Players <= 3 && team2Players <= 3) {
            
            return { team1, team2 };
        }
        
        return null;
    }
} 