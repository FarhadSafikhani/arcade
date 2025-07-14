import { Lobby } from "./lobby";
import { Matcher } from "./matcher";

export class MatcherNoClassMix {
    /**
     * Optimized matching algorithm when class mixing is NOT allowed
     * Uses greedy approach with class compatibility checks for better performance
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
        // Group lobbies by class ID for easier matching
        const classBuckets: Map<number, Lobby[]> = new Map();
        for (const lobby of lobbies) {
            if (!classBuckets.has(lobby.classId)) {
                classBuckets.set(lobby.classId, []);
            }
            classBuckets.get(lobby.classId)!.push(lobby);
        }

        // Try to find matches within the same class first (both teams same class)
        for (const classLobbies of classBuckets.values()) {
            const sameClassMatch = this.findSixPlayerSameClassGreedy(classLobbies);
            if (sameClassMatch) {
                return sameClassMatch;
            }
        }

        // Try to find matches across different classes (team1 one class, team2 another class)
        const classIds = Array.from(classBuckets.keys());
        for (let i = 0; i < classIds.length; i++) {
            for (let j = i + 1; j < classIds.length; j++) {
                const class1Lobbies = classBuckets.get(classIds[i])!;
                const class2Lobbies = classBuckets.get(classIds[j])!;
                
                const crossClassMatch = this.findSixPlayerCrossClassGreedy(class1Lobbies, class2Lobbies);
                if (crossClassMatch) {
                    return crossClassMatch;
                }
            }
        }

        return null;
    }

    private static findSixPlayerSameClassGreedy(lobbies: Lobby[]): { team1: Lobby[], team2: Lobby[] } | null {
        // Use dynamic programming to find combination with exactly 6 players
        const targetPlayers = 6;
        const dp = new Array(targetPlayers + 1).fill(null).map(() => null as Lobby[] | null);
        dp[0] = []; // 0 players can be achieved with empty set
        
        for (const lobby of lobbies) {
            const playerCount = lobby.playerCount;
            // Work backwards to avoid using the same lobby multiple times
            for (let i = targetPlayers; i >= playerCount; i--) {
                if (dp[i - playerCount] !== null) {
                    dp[i] = [...dp[i - playerCount]!, lobby];
                    
                    // Early termination: if we found 6 players, try to split into teams
                    if (i === targetPlayers && dp[i] !== null) {
                        const teams = this.splitIntoTeamsSameClass(dp[i]!);
                        if (teams) {
                            return teams;
                        }
                    }
                }
            }
        }
        
        return null;
    }

    private static findSixPlayerCrossClassGreedy(class1Lobbies: Lobby[], class2Lobbies: Lobby[]): { team1: Lobby[], team2: Lobby[] } | null {
        // Try to find team1 with exactly 3 players from class1, team2 with exactly 3 players from class2
        const team1Match = this.findExactPlayerCountGreedy(class1Lobbies, 3);
        if (team1Match) {
            const team2Match = this.findExactPlayerCountGreedy(class2Lobbies, 3);
            if (team2Match) {
                return { team1: team1Match, team2: team2Match };
            }
        }

        // Try the reverse: team1 from class2, team2 from class1
        const team1MatchReverse = this.findExactPlayerCountGreedy(class2Lobbies, 3);
        if (team1MatchReverse) {
            const team2MatchReverse = this.findExactPlayerCountGreedy(class1Lobbies, 3);
            if (team2MatchReverse) {
                return { team1: team1MatchReverse, team2: team2MatchReverse };
            }
        }

        return null;
    }

    private static splitIntoTeamsSameClass(lobbies: Lobby[]): { team1: Lobby[], team2: Lobby[] } | null {
        // Since all lobbies are the same class, we can use greedy approach
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

    private static findAIAssistedMatchGreedy(aiEligibleLobbies: Lobby[]): { team1: Lobby[], team2: Lobby[], aiPlayers: number } | null {
        // Group lobbies by class ID for easier matching
        const classBuckets: Map<number, Lobby[]> = new Map();
        for (const lobby of aiEligibleLobbies) {
            if (!classBuckets.has(lobby.classId)) {
                classBuckets.set(lobby.classId, []);
            }
            classBuckets.get(lobby.classId)!.push(lobby);
        }

        // Try different numbers of human players (starting from max to minimize AI players)
        for (let humanPlayers = Math.min(6, aiEligibleLobbies.reduce((sum, lobby) => sum + lobby.playerCount, 0)); humanPlayers >= 1; humanPlayers--) {
            const neededAIPlayers = 6 - humanPlayers;
            
            if (neededAIPlayers >= 0 && neededAIPlayers <= 6) {
                // Try same class matching first
                for (const classLobbies of classBuckets.values()) {
                    const humanMatch = this.findExactPlayerCountGreedy(classLobbies, humanPlayers);
                    if (humanMatch) {
                        const teams = this.splitIntoTeamsWithAIGreedy(humanMatch, neededAIPlayers);
                        if (teams) {
                            return { ...teams, aiPlayers: neededAIPlayers };
                        }
                    }
                }

                // Try cross-class matching
                const classIds = Array.from(classBuckets.keys());
                for (let i = 0; i < classIds.length; i++) {
                    for (let j = i + 1; j < classIds.length; j++) {
                        const class1Lobbies = classBuckets.get(classIds[i])!;
                        const class2Lobbies = classBuckets.get(classIds[j])!;
                        
                        // Try different splits between the two classes
                        for (let class1Players = 1; class1Players < humanPlayers; class1Players++) {
                            const class2Players = humanPlayers - class1Players;
                            
                            const class1Match = this.findExactPlayerCountGreedy(class1Lobbies, class1Players);
                            const class2Match = this.findExactPlayerCountGreedy(class2Lobbies, class2Players);
                            
                            if (class1Match && class2Match) {
                                const allLobbies = [...class1Match, ...class2Match];
                                const teams = this.splitIntoTeamsWithAIGreedyClassCheck(allLobbies, neededAIPlayers);
                                if (teams) {
                                    return { ...teams, aiPlayers: neededAIPlayers };
                                }
                            }
                        }
                    }
                }
            }
        }
        
        return null;
    }

    private static splitIntoTeamsWithAIGreedy(lobbies: Lobby[], aiPlayers: number): { team1: Lobby[], team2: Lobby[] } | null {
        if (aiPlayers === 0) {
            return this.splitIntoTeamsSameClass(lobbies);
        }
        
        // Since all lobbies are the same class, distribute evenly
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
            team1Players <= 3 && team2Players <= 3 &&
            this.isTeamClassCompatible(team1) && this.isTeamClassCompatible(team2)) {
            
            return { team1, team2 };
        }
        
        return null;
    }

    private static splitIntoTeamsWithAIGreedyClassCheck(lobbies: Lobby[], aiPlayers: number): { team1: Lobby[], team2: Lobby[] } | null {
        // More complex splitting that checks class compatibility
        const team1: Lobby[] = [];
        const team2: Lobby[] = [];
        let team1Players = 0;
        let team2Players = 0;
        
        for (const lobby of lobbies) {
            const playerCount = lobby.playerCount;
            
            // Try to add to team1 if it's class compatible
            if (team1Players + playerCount <= 3 && this.canAddToTeam(team1, lobby)) {
                team1.push(lobby);
                team1Players += playerCount;
            } else if (team2Players + playerCount <= 3 && this.canAddToTeam(team2, lobby)) {
                team2.push(lobby);
                team2Players += playerCount;
            }
        }
        
        const team1AINeeded = 3 - team1Players;
        const team2AINeeded = 3 - team2Players;
        
        if (team1AINeeded >= 0 && team2AINeeded >= 0 && 
            team1AINeeded + team2AINeeded === aiPlayers &&
            team1Players <= 3 && team2Players <= 3 &&
            this.isTeamClassCompatible(team1) && this.isTeamClassCompatible(team2)) {
            
            return { team1, team2 };
        }
        
        return null;
    }

    private static canAddToTeam(team: Lobby[], lobby: Lobby): boolean {
        if (team.length === 0) return true;
        return team.every(existingLobby => existingLobby.classId === lobby.classId);
    }

    private static isTeamClassCompatible(lobbies: Lobby[]): boolean {
        if (lobbies.length <= 1) return true;
        
        const firstClassId = lobbies[0].classId;
        return lobbies.every(lobby => lobby.classId === firstClassId);
    }
} 