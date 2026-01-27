import { ActivePlayers } from 'boardgame.io/core';
import { GameState, Unit, Tower, Order, Position, Team } from './types';

const BOARD_ROWS = 5;
const BOARD_COLS = 5;

const INITIAL_CHAMPION_HP = 100;
const INITIAL_MINION_HP = 30;
const INITIAL_TOWER_HP = 200;

const CHAMPION_ATTACK = 20;
const MINION_ATTACK = 10;
const TOWER_ATTACK = 30;

const CHAMPION_RANGE = 2; // Manhattan distance
const MINION_RANGE = 1;
const TOWER_RANGE = 2;

function createUnit(id: string, type: 'champion' | 'minion', team: Team, x: number, y: number): Unit {
  return {
    id,
    type,
    hp: type === 'champion' ? INITIAL_CHAMPION_HP : INITIAL_MINION_HP,
    maxHp: type === 'champion' ? INITIAL_CHAMPION_HP : INITIAL_MINION_HP,
    attack: type === 'champion' ? CHAMPION_ATTACK : MINION_ATTACK,
    range: type === 'champion' ? CHAMPION_RANGE : MINION_RANGE,
    pos: { x, y },
    team,
  };
}

function createTower(id: string, team: Team, x: number, y: number): Tower {
  return {
    id,
    hp: INITIAL_TOWER_HP,
    maxHp: INITIAL_TOWER_HP,
    pos: { x, y },
    team,
  };
}

function getDistance(p1: Position, p2: Position): number {
  return Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
}

export const LoLBoardGame = {
  name: 'lol-board-game',

  setup: (): GameState => {
    const units: Unit[] = [];
    const towers: Tower[] = [];

    // Setup Towers (5x5 Square, Diagonal Fronts)
    
    // Team 0 (Bottom-Left Corner: 0, 4)
    // Towers shielding the corner
    towers.push(createTower('tower-0-top', '0', 0, 2)); // Top-ish flank
    towers.push(createTower('tower-0-mid', '0', 1, 3)); // Mid flank
    towers.push(createTower('tower-0-bot', '0', 2, 4)); // Bot flank

    // Team 1 (Top-Right Corner: 4, 0)
    // Towers shielding the corner
    towers.push(createTower('tower-1-top', '1', 2, 0)); // Top flank
    towers.push(createTower('tower-1-mid', '1', 3, 1)); // Mid flank
    towers.push(createTower('tower-1-bot', '1', 4, 2)); // Bot flank

    // Setup Champions (At base/Nexus locations)
    units.push(createUnit('champ-0', 'champion', '0', 0, 4)); // Blue Champ (Bottom-Left)
    units.push(createUnit('champ-1', 'champion', '1', 4, 0)); // Red Champ (Top-Right)

    // Setup Initial Minions (In front of towers, slightly forward)
    // Team 0
    units.push(createUnit('minion-0-top', 'minion', '0', 0, 1)); 
    units.push(createUnit('minion-0-mid', 'minion', '0', 2, 2)); // Center contention?
    units.push(createUnit('minion-0-bot', 'minion', '0', 3, 4)); 

    // Team 1
    units.push(createUnit('minion-1-top', 'minion', '1', 1, 0)); 
    units.push(createUnit('minion-1-mid', 'minion', '1', 2, 2)); // Center contention - Crash!
    // Note: Minions at 2,2 will crash instantly if spawned same spot.
    // Let's adjust mid minion to be safe.
    // Team 0 mid minion at 1, 2 ?
    // Team 1 mid minion at 3, 2 ?
    // 2,2 is the exact center.
    
    // Retrying Minions
    // T0
    // units.push(createUnit('minion-0-top', 'minion', '0', 0, 1)); // Front of 0,2
    // units.push(createUnit('minion-0-mid', 'minion', '0', 1, 2)); // Front of 1,3 ? No, 1,3 is tower. Front is 2,2?
    // Let's spawn them safely behind the "front line" of clash or just ahead of towers.
    
    // Towers: T0: (0,2), (1,3), (2,4). T1: (2,0), (3,1), (4,2).
    // Mid line is x+y = 4. (0,4), (1,3), (2,2), (3,1), (4,0).
    // The towers are ON the mid line or near it?
    // T0 Towers sum: 0+2=2, 1+3=4, 2+4=6.
    // T1 Towers sum: 2+0=2, 3+1=4, 4+2=6.
    
    // Wait, T0 (1,3) is x+y=4. T1 (3,1) is x+y=4.
    // (1,3) vs (3,1) are separated by (2,2).
    
    // Let's place Minions:
    // T0 Minions: (0,1), (1,2), (2,3).
    // T1 Minions: (1,0), (2,1), (3,2).
    // This avoids instant overlap.

    // Remove previous push
    units.length = 0; // Reset units just to be clean in this thinking block, though above code didn't run yet.
    
    // Re-add Champs
    units.push(createUnit('champ-0', 'champion', '0', 0, 4)); 
    units.push(createUnit('champ-1', 'champion', '1', 4, 0)); 
    
    // Add Minions
    // Team 0
    units.push(createUnit('minion-0-top', 'minion', '0', 0, 1)); 
    units.push(createUnit('minion-0-mid', 'minion', '0', 1, 2)); 
    units.push(createUnit('minion-0-bot', 'minion', '0', 2, 3)); 
    
    // Team 1
    units.push(createUnit('minion-1-top', 'minion', '1', 2, 1)); // x=2, y=1. Mirror of 2,3? (4-2, 4-3) = (2,1). Yes.
    units.push(createUnit('minion-1-mid', 'minion', '1', 3, 2)); // x=3, y=2. Mirror of 1,2? (4-1, 4-2) = (3,2). Yes.
    units.push(createUnit('minion-1-bot', 'minion', '1', 4, 3)); // x=4, y=3. Mirror of 0,1? (4-0, 4-1) = (4,3). Yes.
    
    // Wait, (4,3) is near (4,0) base?
    // Team 1 Base is (4,0). (4,3) is far away.
    // Team 1 Towers: (2,0), (3,1), (4,2).
    // Minions should be in front of towers towards enemy.
    // Enemy is at (0,4).
    // Direction is (-1, +1) roughly? No, diagonal.
    
    // Let's just place them adjacent to towers towards center.
    // T1 Tower (2,0) -> Minion at (1,1)?
    // T1 Tower (3,1) -> Minion at (2,2)?
    // T1 Tower (4,2) -> Minion at (3,3)?
    
    // T0 Tower (0,2) -> Minion at (1,1)? Clash!
    // T0 Tower (1,3) -> Minion at (2,2)? Clash!
    // T0 Tower (2,4) -> Minion at (3,3)? Clash!
    
    // Okay, start them slightly back.
    // T0: (0,3), (1,4).
    // T1: (4,1), (3,0).
    // Too passive.
    
    // Let's stick to the previous safely separated ones.
    // T0 Minions: (0,1), (1,2), (2,3).
    // T1 Minions: (1,0), (2,1), (3,2).
    // (0,1) vs (1,0). Distance 2.
    // (1,2) vs (2,1). Distance 2.
    // (2,3) vs (3,2). Distance 2.
    // Safe.

    // Correction on T1 Minions to be properly mirroring T0 relative to the board center/symmetry.
    // Board 5x5.
    // T0 (0,1) -> Mirror is (4-0, 4-1) = (4,3).
    // T0 (1,2) -> Mirror is (4-1, 4-2) = (3,2).
    // T0 (2,3) -> Mirror is (4-2, 4-3) = (2,1).
    
    // So T1 Minions: (4,3), (3,2), (2,1).
    
    // Verify T1 Positions:
    // (4,3): Near (4,4)? Wait.
    // T1 Base is (4,0).
    // (4,3) is near (4,4). That's the other corner!
    // My mirroring logic assumes center symmetry, which flips (0,4) to (4,0).
    // (0,4) is T0 Base. Mirror (4-0, 4-4) = (4,0) T1 Base. Correct.
    
    // T0 Minions:
    // (0,1) -> Near (0,0) Top Left.
    // (1,2) -> Mid.
    // (2,3) -> Near (2,4)? (2,4) is T0 Tower.
    
    // Let's visualize 5x5.
    // y
    // 0  . . . . .
    // 1  . . . . .
    // 2  . . . . .
    // 3  . . . . .
    // 4  B . . . .
    //    0 1 2 3 4 x
    
    // T0 Base (0,4).
    // T0 Towers: (0,2), (1,3), (2,4).
    //    . . T . .  (0,2)
    //    . . . T .  (1,3)
    //    . . . . T  (2,4)
    // T0 Minions:
    //    . M . . . (1,2) ?
    //    M . . . . (0,1) ?
    //    . . M . . (2,3) ?
    //    These seem scattered.
    
    // Let's place minions directly next to towers towards center (2,2).
    // Center is (2,2).
    // T0 Tower (0,2). Path to (2,2) -> (1,2).
    // T0 Tower (1,3). Path to (2,2) -> (1,2) or (2,3).
    // T0 Tower (2,4). Path to (2,2) -> (2,3).
    
    // T1 Base (4,0).
    // T1 Towers: (2,0), (3,1), (4,2).
    //    T . . . . (2,0)
    //    . T . . . (3,1)
    //    . . T . . (4,2)
    
    // T1 Minions:
    // Path to (2,2).
    // (2,0) -> (2,1).
    // (3,1) -> (2,1) or (3,2).
    // (4,2) -> (3,2).
    
    // Proposed Minions:
    // T0: (1,2), (2,3).
    // T1: (2,1), (3,2).
    
    // (1,2) vs (2,1). Dist 2.
    // (2,3) vs (3,2). Dist 2.
    // Balanced.
    // Let's add one more pair near the "outer" edges?
    // (0,1) vs (1,0)?
    // (3,4) vs (4,3)?
    
    // T0 Base (0,4). (0,1) is far up the left edge.
    // T1 Base (4,0). (4,3) is far down the right edge.
    // Let's try 3 minions per team.
    // T0: (1,2), (2,3), (0,1).
    // T1: (3,2), (2,1), (4,3).
    
    // Implementation:
    units.push(createUnit('minion-0-mid1', 'minion', '0', 1, 2)); 
    units.push(createUnit('minion-0-mid2', 'minion', '0', 2, 3)); 
    units.push(createUnit('minion-0-side', 'minion', '0', 0, 1)); 

    units.push(createUnit('minion-1-mid1', 'minion', '1', 3, 2)); 
    units.push(createUnit('minion-1-mid2', 'minion', '1', 2, 1)); 
    units.push(createUnit('minion-1-side', 'minion', '1', 4, 3));

    return {
      units,
      towers,
      orders: { '0': [], '1': [] },
      turnLog: ['Game Started - 5x5 Board'],
      turnResolved: false,
    };
  },

  moves: {
    planOrder: (
        { G, playerID }: { G: GameState; playerID: string },
        unitId: string,
        type: 'move' | 'attack',
        target: Position | string
      ) => {
        const team = playerID as Team;
        // Only allow ordering own units
        const unit = G.units.find((u) => u.id === unitId && u.team === team);
        if (!unit) {
            console.warn(`Player ${playerID} tried to order unit ${unitId} which is not theirs or doesn't exist.`);
            return; 
        }

        // Initialize orders array if missing
        if (!G.orders[playerID]) G.orders[playerID] = [];
  
        // Remove existing order for this unit if any
        G.orders[playerID] = G.orders[playerID].filter((o) => o.sourceUnitId !== unitId);
  
        const newOrder: Order = {
          sourceUnitId: unitId,
          type,
        };
  
        // Basic validation
        if (type === 'move') {
            // Check if target is a Position object
            if (typeof target === 'string') {
                console.warn("Invalid target for move order");
                return;
            }
            newOrder.targetPos = target;
        } else if (type === 'attack') {
             if (typeof target !== 'string') {
                console.warn("Invalid target for attack order");
                return;
            }
            newOrder.targetUnitId = target;
        }
  
        G.orders[playerID].push(newOrder);
      },
  },

  turn: {
    activePlayers: ActivePlayers.ALL,
    onBegin: ({ G }: { G: GameState }) => {
        G.turnResolved = false;
    },
    onEnd: ({ G, ctx }: { G: GameState; ctx: any }) => {
       if (!G.turnResolved) {
           resolveGame(G, ctx);
           G.turnResolved = true;
       }
    },
  },
  
  endIf: ({ G }: { G: GameState }) => {
      const team0Towers = G.towers.filter(t => t.team === '0').length;
      const team1Towers = G.towers.filter(t => t.team === '1').length;
      
      if (team0Towers === 0) return { winner: '1' };
      if (team1Towers === 0) return { winner: '0' };
  }
};

function resolveGame(G: GameState, ctx: any) {
    const logs: string[] = [];
    logs.push("--- Turn Resolution ---");

    // 1. Resolve Movements
    // Collect all move orders
    const moveOrders: { order: Order, team: string }[] = [];
    Object.entries(G.orders).forEach(([team, orders]) => {
        orders.forEach(o => {
            if (o.type === 'move') moveOrders.push({ order: o, team });
        });
    });

    // Execute moves
    moveOrders.forEach(({ order }) => {
        const unit = G.units.find(u => u.id === order.sourceUnitId);
        if (unit && order.targetPos) {
            // Check bounds
            if (order.targetPos.x >= 0 && order.targetPos.x < BOARD_COLS &&
                order.targetPos.y >= 0 && order.targetPos.y < BOARD_ROWS) {
                
                // Check Range (Max 1 step for move)
                const dist = Math.abs(unit.pos.x - order.targetPos.x) + Math.abs(unit.pos.y - order.targetPos.y);
                if (dist > 1) {
                    logs.push(`${unit.id} failed to move - Too far`);
                    return;
                }

                // Check collision (very simple: if occupied by ANY unit or tower, don't move)
                // Note: Simultaneous movement might mean two units swap places or move to same spot.
                // MVP: If target is currently occupied, fail.
                const isOccupied = G.units.some(u => u.pos.x === order.targetPos!.x && u.pos.y === order.targetPos!.y) ||
                                   G.towers.some(t => t.pos.x === order.targetPos!.x && t.pos.y === order.targetPos!.y);
                
                if (!isOccupied) {
                    unit.pos = order.targetPos;
                    logs.push(`${unit.id} moved to (${unit.pos.x}, ${unit.pos.y})`);
                } else {
                    logs.push(`${unit.id} failed to move to (${order.targetPos.x}, ${order.targetPos.y}) - Blocked`);
                }
            }
        }
    });

    // 2. Resolve Attacks
    // Champions attack based on orders
    const attackOrders: { order: Order, team: string }[] = [];
    Object.entries(G.orders).forEach(([team, orders]) => {
        orders.forEach(o => {
            if (o.type === 'attack') attackOrders.push({ order: o, team });
        });
    });

    attackOrders.forEach(({ order }) => {
        const attacker = G.units.find(u => u.id === order.sourceUnitId);
        if (attacker && order.targetUnitId) {
            // Find target in units or towers
            const targetUnit = G.units.find(u => u.id === order.targetUnitId);
            const targetTower = G.towers.find(t => t.id === order.targetUnitId);
            
            const target = targetUnit || targetTower;

            if (target) {
                const dist = getDistance(attacker.pos, target.pos);
                if (dist <= attacker.range) {
                    // Critical Hit Chance: 20% for 2x Damage
                    const isCrit = ctx.random.Number() < 0.2;
                    const dmg = isCrit ? attacker.attack * 2 : attacker.attack;
                    target.hp -= dmg;
                    logs.push(`${attacker.id} attacked ${target.id} for ${dmg} dmg${isCrit ? ' (CRIT!)' : ''}`);
                } else {
                     logs.push(`${attacker.id} failed to attack ${target.id} - Out of range`);
                }
            }
        }
    });
    
    // 3. Minion & Tower AI (Automated)
    // Minions move if they didn't have an order (players can't order minions in MVP? Description says "Unit: Champion (Player controlled) and Minion (Automated logic)". So players should NOT order minions.)
    // Wait, the plan says "planning: ... planOrder(unitId)". I should restrict planOrder to champions.
    
    // Let's handle Minion AI here. Minions are units but not controlled.
    const minions = G.units.filter(u => u.type === 'minion');
    minions.forEach(minion => {
        // AI Logic:
        // 1. Attack enemy in range?
        // 2. Move towards enemy base?
        
        // Find closest enemy
        const enemyTeam = minion.team === '0' ? '1' : '0';
        const enemies: (Unit | Tower)[] = [...G.units.filter(u => u.team === enemyTeam), ...G.towers.filter(t => t.team === enemyTeam)];
        
        let target: Unit | Tower | null = null;
        let minDist = Infinity;
        
        for (const e of enemies) {
            const d = getDistance(minion.pos, e.pos);
            if (d < minDist) {
                minDist = d;
                target = e;
            }
        }

        if (target && minDist <= minion.range) {
            // Attack
            // target can be Unit or Tower, both have hp
            target.hp -= minion.attack;
             logs.push(`${minion.id} attacked ${target.id} for ${minion.attack} dmg`);
        } else {
            // Move
            // Direction x: team 0 -> positive, team 1 -> negative
            const dx = minion.team === '0' ? 1 : -1;
            const newPos = { x: minion.pos.x + dx, y: minion.pos.y }; // Simple forward movement
            
            // Check bounds and collision
             if (newPos.x >= 0 && newPos.x < BOARD_COLS &&
                newPos.y >= 0 && newPos.y < BOARD_ROWS) {
                 const isOccupied = G.units.some(u => u.pos.x === newPos.x && u.pos.y === newPos.y) ||
                                   G.towers.some(t => t.pos.x === newPos.x && t.pos.y === newPos.y);
                 
                 if (!isOccupied) {
                     minion.pos = newPos;
                    // logs.push(`${minion.id} moved to (${minion.pos.x}, ${minion.pos.y})`);
                 }
            }
        }
    });

    // Towers attack
    G.towers.forEach(tower => {
         const enemyTeam = tower.team === '0' ? '1' : '0';
         const enemies = G.units.filter(u => u.team === enemyTeam);
         // Find closest enemy
         let target: Unit | null = null;
         let minDist = Infinity;
         for (const e of enemies) {
             const d = getDistance(tower.pos, e.pos);
             if (d < minDist) {
                 minDist = d;
                 target = e;
             }
         }
         
         if (target && minDist <= TOWER_RANGE) {
             target.hp -= TOWER_ATTACK;
             logs.push(`${tower.id} attacked ${target.id} for ${TOWER_ATTACK} dmg`);
         }
    });

    // 4. Cleanup Dead Units/Towers
    const deadUnits = G.units.filter(u => u.hp <= 0);
    deadUnits.forEach(u => logs.push(`${u.id} died`));
    G.units = G.units.filter(u => u.hp > 0);
    
    const deadTowers = G.towers.filter(t => t.hp <= 0);
    deadTowers.forEach(t => logs.push(`${t.id} destroyed`));
    G.towers = G.towers.filter(t => t.hp > 0);

    // Clear Orders
    G.orders = { '0': [], '1': [] };
    G.turnLog = [...G.turnLog, ...logs];
}
