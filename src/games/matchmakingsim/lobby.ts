function someRandomName() {
    return "Player" + Math.floor(Math.random() * 1000);
}

export class Player {
    name: string;
    ready: boolean;
    constructor() {
        this.name = someRandomName();
        this.ready = false;
    }
}

export class Lobby {
    id: number;
    playerSlots: (Player | null)[];
    timeJoined: number;
    aiEligible: boolean;
    classId: number;

    private onDelete: (lobbyId: number) => void;
    private previousAllReady: boolean = false;
    
    constructor(id: number, classId: number, onDelete: (lobbyId: number) => void) {
        this.id = id;
        this.playerSlots = [null, null, null];
        this.timeJoined = 0;
        this.aiEligible = false;
        this.classId = classId;

        this.onDelete = onDelete;
        
        this.createLobbyElement();
    }

    get allReady(): boolean {
        const hasPlayers = this.playerSlots.some(slot => slot !== null);
        return hasPlayers && this.playerSlots.every(slot => slot === null || slot.ready);
    }

    private checkAndFireReadyStatusChange(): void {
        const currentAllReady = this.allReady;
        if (currentAllReady !== this.previousAllReady) {
            this.previousAllReady = currentAllReady;
            
            // Fire custom event
            const event = new CustomEvent('lobbyReadyStatusChanged', {
                detail: { lobby: this, allReady: currentAllReady }
            });
            document.dispatchEvent(event);
        }
    }

    get playerCount(): number {
        return this.playerSlots.filter(slot => slot !== null).length;
    }

    addPlayer(player: Player) {
        // Find the first empty slot
        const emptySlotIndex = this.playerSlots.findIndex(slot => slot === null);
        if (emptySlotIndex !== -1) {
            this.playerSlots[emptySlotIndex] = player;
            this.updateDisplay();
            this.checkAndFireReadyStatusChange();
        }
    }


    setTimeJoined(timeJoined: number) {
        this.timeJoined = timeJoined;
    }

    isFull() {
        return this.playerSlots.length === this.playerSlots.length;
    }

    isEmpty() {
        return this.playerSlots.length === 0;
    }

    private createLobbyElement(): void {
        const lobbyContainer = document.getElementById('lobbyContainer');
        if (lobbyContainer) {
            const lobbyDiv = document.createElement('div');
            lobbyDiv.className = 'lobby';
            lobbyDiv.id = `lobby-${this.id}`;
            
            // Lobby ID (top left)
            const lobbyIdDiv = document.createElement('div');
            lobbyIdDiv.className = 'lobby-id';
            lobbyIdDiv.textContent = `id:${this.id}`;
            
            // Class ID (below lobby ID)
            const classIdDiv = document.createElement('div');
            classIdDiv.className = 'class-id';
            classIdDiv.id = `class-id-${this.id}`;
            classIdDiv.textContent = `class:${this.classId}`;
            classIdDiv.onclick = () => this.incrementClassId();
            
            // Queue time (center top)
            const queueTimeDiv = document.createElement('div');
            queueTimeDiv.className = 'queue-time';
            queueTimeDiv.id = `queue-time-${this.id}`;
            queueTimeDiv.style.display = 'none';
            
            // Toggle ready button
            const toggleReadyBtn = document.createElement('div');
            toggleReadyBtn.className = 'remove-btn toggle-ready-btn';
            toggleReadyBtn.textContent = '✓';
            toggleReadyBtn.onclick = () => this.toggleLobbyReady();
            
            // X button (top right)
            const deleteBtn = document.createElement('div');
            deleteBtn.className = 'remove-btn';
            deleteBtn.textContent = 'X';
            deleteBtn.onclick = () => this.onDelete(this.id);
            
            // Player slots
            const slotsDiv = document.createElement('div');
            slotsDiv.className = 'player-slots';
            for (let i = 0; i < 3; i++) {
                const slotDiv = document.createElement('div');
                slotDiv.className = 'player-slot empty';
                slotDiv.id = `lobby-${this.id}-slot-${i}`;
                slotDiv.onclick = () => this.handleSlotClick(i);
                slotsDiv.appendChild(slotDiv);
            }
            
            lobbyDiv.appendChild(lobbyIdDiv);
            lobbyDiv.appendChild(classIdDiv);
            lobbyDiv.appendChild(queueTimeDiv);
            lobbyDiv.appendChild(toggleReadyBtn);
            lobbyDiv.appendChild(deleteBtn);
            lobbyDiv.appendChild(slotsDiv);
            lobbyContainer.appendChild(lobbyDiv);
        }
    }

    handleSlotClick(slotIndex: number): void {
        if (this.playerSlots[slotIndex] === null) {
            // Add player to empty slot
            const player = new Player();
            this.playerSlots[slotIndex] = player;
        } else {
            // Toggle ready status
            const player = this.playerSlots[slotIndex];
            if (player) {
                player.ready = !player.ready;
            }
        }
        this.updateDisplay();
        this.checkAndFireReadyStatusChange();
    }



    updateDisplay(): void {
        // Update all player slots
        for (let i = 0; i < this.playerSlots.length; i++) {
            const slotDiv = document.getElementById(`lobby-${this.id}-slot-${i}`);
            if (slotDiv) {
                const player = this.playerSlots[i];
                if (player) {
                    // Update content without recreating event handlers
                    const nameSpan = slotDiv.querySelector('span') || document.createElement('span');
                    nameSpan.textContent = player.name;
                    
                    // Only update class name
                    slotDiv.className = `player-slot filled ${player.ready ? 'ready' : 'not-ready'}`;
                    
                    // Only add elements if they don't exist
                    if (!slotDiv.querySelector('span')) {
                        slotDiv.appendChild(nameSpan);
                    }
                    
                    // Add X button if it doesn't exist
                    if (!slotDiv.querySelector('.remove-btn')) {
                        const removeBtn = document.createElement('div');
                        removeBtn.textContent = 'X';
                        removeBtn.className = 'remove-btn';
                        removeBtn.onclick = (e) => {
                            e.stopPropagation();
                            this.removePlayer(i);
                        };
                        slotDiv.appendChild(removeBtn);
                    }
                } else {
                    // Clear content for empty slots
                    slotDiv.innerHTML = '';
                    slotDiv.className = 'player-slot empty';
                }
            }
        }
        
        // Update lobby status
        const lobbyDiv = document.getElementById(`lobby-${this.id}`);
        const queueTimeDiv = document.getElementById(`queue-time-${this.id}`);
        
        if (lobbyDiv && queueTimeDiv) {
            if (this.allReady) {
                lobbyDiv.className = 'lobby lobby-ready';
                queueTimeDiv.style.display = 'block';
            } else {
                lobbyDiv.className = 'lobby';
                queueTimeDiv.style.display = 'none';
            }
        }
        
        // Update timer display
        if (this.timeJoined > 0) {
            const queueTimeDiv = document.getElementById(`queue-time-${this.id}`);
            if (queueTimeDiv) {
                const elapsed = Date.now() - this.timeJoined;
                const minutes = Math.floor(elapsed / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                queueTimeDiv.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        } else {
            const queueTimeDiv = document.getElementById(`queue-time-${this.id}`);
            if (queueTimeDiv) {
                queueTimeDiv.textContent = 'pending...';
            }
        }
    }

    removePlayer(slotIndex: number): void {
        this.playerSlots[slotIndex] = null;
        this.setAllReady(false);
    }

    toggleLobbyReady(): void {
        // Check current state of all players
        const allCurrentlyReady = this.playerSlots.every(slot => slot === null || slot.ready);
        // Toggle to opposite of current state
        this.setAllReady(!allCurrentlyReady);
    }

    setAllReady(ready: boolean) {
        this.playerSlots.forEach(player => {
            if (player) {
                player.ready = ready;
            }
        });
        this.updateDisplay();
        this.checkAndFireReadyStatusChange();
    }

    incrementClassId(): void {
        this.classId = (this.classId + 1) % 3; // Cycle through 0, 1, 2
        this.updateClassIdDisplay();
    }

    private updateClassIdDisplay(): void {
        const classIdDiv = document.getElementById(`class-id-${this.id}`);
        if (classIdDiv) {
            classIdDiv.textContent = `class:${this.classId}`;
        }
    }

    destroy() {
        const lobbyDiv = document.getElementById(`lobby-${this.id}`);
        if (lobbyDiv) {
            lobbyDiv.remove();
        }
    }
}

