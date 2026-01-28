import { GameState, Position, Team, ChampionInstance, Card } from './types';

// Simple heuristic bot implementation for the new card-based game
export class SimpleBot {
    constructor(
        public client: { 
            moves: { 
                playCard: (championId: string, cardId: string, targetPos?: Position, targetChampionId?: string) => Promise<void>;
                guard: (championId: string, discardCardIds: [string, string]) => Promise<void>;
            }; 
            events: { endTurn: () => Promise<void> } 
        }, 
        public playerID: string
    ) {}

    async play(state: { G: GameState, ctx: unknown }) {
        const { G } = state;
        const myTeam = this.playerID as Team;
        const myPlayerState = G.players[myTeam];
        
        // 場に出ているチャンピオン
        const myFieldChampions = myPlayerState.champions.filter(c => c.pos !== null);
        
        // 既に行動選択済みのチャンピオンID
        const actingChampionIds = G.turnActions[myTeam].actions.map(a => a.championId);
        
        // 行動可能なチャンピオン
        const availableChampions = myFieldChampions.filter(c => !actingChampionIds.includes(c.id));
        
        // 2体分の行動を選択
        for (let i = 0; i < 2 && i < availableChampions.length; i++) {
            const champion = availableChampions[i];
            if (!champion.pos) continue;
            
            await this.selectAction(G, champion, myTeam);
        }
        
        // ターン終了
        await this.client.events.endTurn();
    }
    
    private async selectAction(G: GameState, champion: ChampionInstance, myTeam: Team) {
        if (!champion.pos || champion.hand.length === 0) return;
        
        const enemyTeam = myTeam === '0' ? '1' : '0';
        const enemies = G.players[enemyTeam].champions.filter(c => c.pos !== null);
        
        // 最も近い敵を探す
        let closestEnemy: ChampionInstance | null = null;
        let minDist = Infinity;
        
        for (const enemy of enemies) {
            if (!enemy.pos) continue;
            const dist = Math.abs(champion.pos.x - enemy.pos.x) + Math.abs(champion.pos.y - enemy.pos.y);
            if (dist < minDist) {
                minDist = dist;
                closestEnemy = enemy;
            }
        }
        
        // 攻撃カードを探す（優先度順）
        const attackCards = champion.hand
            .filter(c => c.power > 0 && !c.isSwap)
            .sort((a, b) => b.priority - a.priority);
        
        // 移動カードを探す
        const moveCards = champion.hand
            .filter(c => c.move > 0 && c.power === 0 && !c.isSwap)
            .sort((a, b) => b.move - a.move);
        
        // 敵が攻撃範囲内にいる場合
        if (closestEnemy && closestEnemy.pos) {
            for (const card of attackCards) {
                const attackRange = card.move > 0 ? 1 : 2;
                
                if (card.move > 0) {
                    // 移動+攻撃カード: まず敵に近づく
                    const targetPos = this.getMoveTowardsTarget(champion.pos, closestEnemy.pos, card.move);
                    const newDist = Math.abs(targetPos.x - closestEnemy.pos.x) + Math.abs(targetPos.y - closestEnemy.pos.y);
                    
                    if (newDist <= 1) {
                        await this.client.moves.playCard(champion.id, card.id, targetPos, closestEnemy.id);
                        return;
                    }
                } else if (minDist <= attackRange) {
                    // 攻撃のみカード
                    await this.client.moves.playCard(champion.id, card.id, undefined, closestEnemy.id);
                    return;
                }
            }
            
            // 攻撃できない場合、移動で近づく
            for (const card of moveCards) {
                const targetPos = this.getMoveTowardsTarget(champion.pos, closestEnemy.pos, card.move);
                await this.client.moves.playCard(champion.id, card.id, targetPos);
                return;
            }
            
            // 移動+攻撃カードで移動だけする
            for (const card of attackCards) {
                if (card.move > 0) {
                    const targetPos = this.getMoveTowardsTarget(champion.pos, closestEnemy.pos, card.move);
                    await this.client.moves.playCard(champion.id, card.id, targetPos);
                    return;
                }
            }
        }
        
        // どうしても行動できない場合、最初のカードを使う（移動のみ）
        const anyCard = champion.hand[0];
        if (anyCard) {
            if (anyCard.move > 0) {
                // 敵ベースに向かって移動
                const enemyBase = myTeam === '0' ? { x: 8, y: 0 } : { x: 0, y: 8 };
                const targetPos = this.getMoveTowardsTarget(champion.pos, enemyBase, anyCard.move);
                await this.client.moves.playCard(champion.id, anyCard.id, targetPos);
            } else {
                // 移動なしカードで敵がいれば攻撃
                if (closestEnemy && closestEnemy.pos && minDist <= 2) {
                    await this.client.moves.playCard(champion.id, anyCard.id, undefined, closestEnemy.id);
                }
            }
        }
    }
    
    private getMoveTowardsTarget(from: Position, to: Position, maxMove: number): Position {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        
        let newX = from.x;
        let newY = from.y;
        
        // 移動可能な範囲内で目標に近づく
        const stepX = dx !== 0 ? Math.sign(dx) : 0;
        const stepY = dy !== 0 ? Math.sign(dy) : 0;
        
        let remainingMove = maxMove;
        
        // X方向に移動
        while (remainingMove > 0 && Math.abs(newX - to.x) > 0) {
            newX += stepX;
            remainingMove--;
        }
        
        // Y方向に移動
        while (remainingMove > 0 && Math.abs(newY - to.y) > 0) {
            newY += stepY;
            remainingMove--;
        }
        
        // ボード境界内に収める
        newX = Math.max(0, Math.min(8, newX));
        newY = Math.max(0, Math.min(8, newY));
        
        return { x: newX, y: newY };
    }
}
