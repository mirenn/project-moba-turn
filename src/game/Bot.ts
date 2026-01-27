import { GameState, Position, Unit, Tower } from './types';

// Simple heuristic bot implementation
export class SimpleBot {
    constructor(
        public client: { 
            moves: { planOrder: (unitId: string, type: 'move' | 'attack', target: Position | string) => Promise<void> }; 
            events: { endTurn: () => Promise<void> } 
        }, 
        public playerID: string
    ) {}

    async play(state: { G: GameState, ctx: unknown }) {
        const { G } = state;
        const myTeam = this.playerID;
        
        // Find my champion
        const myChamp = G.units.find(u => u.team === myTeam && u.type === 'champion');
        if (!myChamp) return; // Dead

        // Logic:
        // 1. Check if can attack enemy (Unit or Tower)
        const enemyTeam = myTeam === '0' ? '1' : '0';
        const enemies = [...G.units.filter(u => u.team === enemyTeam), ...G.towers.filter(t => t.team === enemyTeam)];
        
        let target: Unit | Tower | null = null;
        let minDist = Infinity;
        
        // Find closest enemy
        for (const e of enemies) {
            const d = Math.abs(myChamp.pos.x - e.pos.x) + Math.abs(myChamp.pos.y - e.pos.y);
            if (d < minDist) {
                minDist = d;
                target = e;
            }
        }

        // If in range, Attack
        if (target && minDist <= myChamp.range) {
             await this.client.moves.planOrder(myChamp.id, 'attack', target.id);
        } else {
             // Move towards enemy base
             if (target) {
                 const dx = target.pos.x - myChamp.pos.x;
                 const dy = target.pos.y - myChamp.pos.y;
                 
                 // Move 1 step towards
                 let newX = myChamp.pos.x;
                 let newY = myChamp.pos.y;
                 
                 if (Math.abs(dx) > Math.abs(dy)) {
                     newX += Math.sign(dx);
                 } else {
                     newY += Math.sign(dy);
                 }
                 
                 // Check bounds (0-4)
                 newX = Math.max(0, Math.min(4, newX));
                 newY = Math.max(0, Math.min(4, newY));
                 
                 // Check if occupied by ME or friendly? Game logic prevents overlap.
                 // We blindly try to move.
                 await this.client.moves.planOrder(myChamp.id, 'move', { x: newX, y: newY });
             }
        }
        
        // Commit turn
        // Simultaneous turns require signaling completion.
        await this.client.events.endTurn();
    }
}
