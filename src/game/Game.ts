import { ActivePlayers, TurnOrder } from 'boardgame.io/core';
import { 
  GameState, 
  Position, 
  Team, 
  TerritoryOwner,
  ChampionInstance, 
  PlayerState, 
  CardAction,
  GuardAction,
  TurnAction,
  Card,
  PendingAction,
  ElementType,
  PointToken,
  PendingPointToken,
  Block,
  ResourceType,
  ResourceNode
} from './types';
import { ALL_CHAMPIONS, getChampionById } from './champions';
import { calculateDamage } from './typeChart';
import { selectCPUActions, selectCPUTarget, selectCPUDeployPosition } from './cpuAI';

const BOARD_SIZE = 13;
const TURNS_PER_PHASE = 4;
const KNOCKOUT_TURNS = 4;
const BENCH_RECOVERY_PERCENT = 0.15;
const GUARD_DAMAGE_REDUCTION = 1 / 3;
const CHAMPIONS_ON_FIELD = 3;
const VICTORY_SCORE = 50;
const ADMIN_DOMAIN_POINTS = 5; // 中央マスのポイント
const KILL_POINTS = 5; // 撃破ポイント
const DEPLOY_MIN_DISTANCE = 3; // 配置時の最低距離制約



// Admin Domain: 中央3x3 (5,5) ~ (7,7)
function isAdminDomain(x: number, y: number): boolean {
  return x >= 5 && x <= 7 && y >= 5 && y <= 7;
}



// 陣地を塗る
export function paintTile(G: GameState, x: number, y: number, team: Team): void {
  if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return;
  
  // ホームマスチェック：相手のホームマスは塗れない
  const enemyTeam = team === '0' ? '1' : '0';
  const isEnemyHomeSquare = G.homeSquares[enemyTeam].some(
    pos => pos.x === x && pos.y === y
  );
  if (isEnemyHomeSquare) return; // 相手のホームマスは保護
  
  G.territory[y][x] = team;
}

// スコアを計算（現在の陣地面積）
export function calculateScores(G: GameState): void {
  const scores: Record<Team, number> = { '0': 0, '1': 0 };
  
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const owner = G.territory[y][x];
      if (owner !== null) {
        const points = isAdminDomain(x, y) ? ADMIN_DOMAIN_POINTS : 1;
        scores[owner] += points;
      }
    }
  }
  
  G.scores = scores;
}

// Flood-fill で囲まれた領域を検出して塗りつぶす（廃止：呼び出されない）
// 盤面の端は自色と同じ扱い
export function detectAndFillEnclosures(G: GameState, team: Team): void {
  // 囲い塗りルールは廃止されました
  // この関数は互換性のために残していますが、呼び出されません
}

// ポイントトークンを生成（ターン終了時に呼び出し）
function spawnPointTokens(G: GameState, random: any): void {
  // 1. 予告トークンを実体化（前ターンで予告されたもの）
  for (const pending of G.pendingPointTokens) {
    G.pointTokens.push({
      x: pending.x,
      y: pending.y,
      value: pending.value
    });
    G.turnLog.push(`ポイントトークン(${pending.value}pt)が (${pending.x}, ${pending.y}) に出現！`);
  }
  G.pendingPointTokens = [];

  // 2. 新しい予告トークンを生成（2~4個）- 5~10ターンで決着がつくよう増量
  const numTokens = 2 + Math.floor(random.Number() * 3);
  
  for (let i = 0; i < numTokens; i++) {
    let x: number, y: number, attempts = 0;
    do {
      // 中央エリア(Admin Domain: 5-7, 5-7)に50%の確率で出現
      if (random.Number() < 0.5) {
        // 中央3x3エリアに配置
        x = 5 + Math.floor(random.Number() * 3);
        y = 5 + Math.floor(random.Number() * 3);
      } else {
        // ランダム配置
        x = Math.floor(random.Number() * BOARD_SIZE);
        y = Math.floor(random.Number() * BOARD_SIZE);
      }
      attempts++;
    } while (
      (G.pointTokens.some(t => t.x === x && t.y === y) ||
       G.pendingPointTokens.some(t => t.x === x && t.y === y)) && 
      attempts < 50
    );
    
    if (attempts < 50) {
      // 中央エリア(Admin Domain)は高価値ポイント（5pt）が非常に出やすい
      const isCenter = isAdminDomain(x, y);
      // 中央: 80%で5pt、それ以外: 20%で5pt
      const isHighValue = isCenter ? random.Number() < 0.8 : random.Number() < 0.2;
      
      G.pendingPointTokens.push({
        x, y,
        value: isHighValue ? 5 : 1
      });
      
      G.turnLog.push(`💫 ポイント予告: (${x}, ${y}) に ${isHighValue ? '5pt' : '1pt'} が次ターン出現予定`);
    }
  }
}

// 接続されていない陣地を消去（4マス以上連結していない色は消える、ただしホームマス接続は除外）
function removeDisconnectedTerritories(G: GameState): void {
  const directions = [
    { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
    { dx: -1, dy: 0 }, { dx: 1, dy: 0 }
  ];
  
  for (const team of ['0', '1'] as Team[]) {
    const visited: boolean[][] = Array(BOARD_SIZE)
      .fill(null)
      .map(() => Array(BOARD_SIZE).fill(false));
    
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (G.territory[y][x] === team && !visited[y][x]) {
          // BFSで連結成分を探索
          const component: Position[] = [];
          const queue: Position[] = [{ x, y }];
          visited[y][x] = true;
          let hasHomeSquare = false; // ホームマスを含むかどうか
          
          while (queue.length > 0) {
            const pos = queue.shift()!;
            component.push(pos);
            
            // ホームマスかどうかチェック
            if (G.homeSquares[team].some(hs => hs.x === pos.x && hs.y === pos.y)) {
              hasHomeSquare = true;
            }
            
            for (const dir of directions) {
              const nx = pos.x + dir.dx;
              const ny = pos.y + dir.dy;
              
              if (nx >= 0 && nx < BOARD_SIZE && 
                  ny >= 0 && ny < BOARD_SIZE &&
                  !visited[ny][nx] && 
                  G.territory[ny][nx] === team) {
                visited[ny][nx] = true;
                queue.push({ x: nx, y: ny });
              }
            }
          }
          
          // チャンピオンがいるマスかどうかチェック
          const hasChampion = component.some(pos => 
            G.players[team].champions.some(c => 
              c.pos !== null && c.pos.x === pos.x && c.pos.y === pos.y
            )
          );
          
          // ホームマスまたはチャンピオンに接続している場合は消滅しない
          // そうでなければ4マス未満の連結成分を消去
          if (!hasHomeSquare && !hasChampion && component.length < 4) {
            for (const pos of component) {
              G.territory[pos.y][pos.x] = null;
            }
            G.turnLog.push(`${team === '0' ? '青' : '赤'}チームの陣地(${component.length}マス)が接続不足で消滅...`);
          }
        }
      }
    }
  }
}

// 塗られた陣地上のポイントトークンを獲得
function collectPointsFromTerritory(G: GameState): void {
  const collectedTokens: PointToken[] = [];
  
  for (const token of G.pointTokens) {
    const owner = G.territory[token.y][token.x];
    if (owner !== null) {
      G.scores[owner] += token.value;
      collectedTokens.push(token);
      G.turnLog.push(`${owner === '0' ? '青' : '赤'}チームが ${token.value}pt 獲得！(${token.x}, ${token.y})`);
      
      G.pointEvents.push({
        id: `point-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        x: token.x,
        y: token.y,
        amount: token.value,
        team: owner,
        timestamp: Date.now()
      });
    }
  }
  
  // 獲得したトークンを削除
  G.pointTokens = G.pointTokens.filter(t => !collectedTokens.includes(t));
}

// ターン終了時にサイコロを振って資源を獲得する
export function processResourceNodes(G: GameState, random: any): void {
  // 1〜3のサイコロを振る
  const roll = 1 + Math.floor(random.Number() * 3);
  G.resourceRollResult = roll;

  if (!G.resourceNodes) return; // 古いセーブデータ対策

  // 出目と一致する資源マスを塗っているプレイヤーに資源を付与
  for (const node of G.resourceNodes) {
    if (node.triggerNumber === roll) {
      const owner = G.territory[node.y][node.x];
      if (owner !== null) {
        G.players[owner].resources[node.type] += 1;
        
        // アニメーション用のイベントを追加
        if (!G.resourceEvents) G.resourceEvents = [];
        G.resourceEvents.push({
          id: `res-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          x: node.x,
          y: node.y,
          amount: 1,
          type: node.type,
          team: owner,
          timestamp: Date.now()
        });

        const resourceNameStr = node.type === 'wood' ? '木材' : node.type === 'stone' ? '石' : '鉄';
        G.turnLog.push(`${owner === '0' ? '青' : '赤'}チームが ${resourceNameStr} を獲得！(${node.x}, ${node.y})`);
      }
    }
  }
}

function getDistance(p1: Position, p2: Position): number {
  return Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
}

// ロンゲストペイントボーナス（10マス以上で最大面積のプレイヤーに+10pt）をチェック・更新
export function checkLongestPaintBonus(G: GameState): void {
  // 1. 各チームの塗られているマス数を計算
  const paintCount: Record<Team, number> = { '0': 0, '1': 0 };
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const owner = G.territory[y][x];
      if (owner !== null) {
        paintCount[owner]++;
      }
    }
  }

  // 2. 現在の保持者と状況を確認
  const currentHolder = G.longestPaintBonusHolder;
  const team0Qualifies = paintCount['0'] >= 10;
  const team1Qualifies = paintCount['1'] >= 10;

  if (currentHolder === null) {
    // 誰も持っていない場合、どちらかが10マス以上で、かつ相手より多ければ獲得
    if (team0Qualifies && paintCount['0'] > paintCount['1']) {
      G.longestPaintBonusHolder = '0';
      G.scores['0'] += 10;
      G.turnLog.push(`🌟 青チームが盤面を${paintCount['0']}マス塗り、ロンゲストペイントボーナス(+10pt)を獲得！`);
    } else if (team1Qualifies && paintCount['1'] > paintCount['0']) {
      G.longestPaintBonusHolder = '1';
      G.scores['1'] += 10;
      G.turnLog.push(`🌟 赤チームが盤面を${paintCount['1']}マス塗り、ロンゲストペイントボーナス(+10pt)を獲得！`);
    }
  } else {
    // 既に誰かが持っている場合
    const holderCount = paintCount[currentHolder];
    const challenger = currentHolder === '0' ? '1' : '0';
    const challengerCount = paintCount[challenger];

    if (holderCount < 10) {
      // 保持者が10マス未満になったので喪失
      G.longestPaintBonusHolder = null;
      G.scores[currentHolder] -= 10;
      G.turnLog.push(`💔 ${currentHolder === '0' ? '青' : '赤'}チームの陣地が10マス未満になり、ロンゲストペイントボーナス(-10pt)を喪失した...`);
      
      // チャレンジャーが10マス以上あればそのまま獲得
      if (challengerCount >= 10) {
        G.longestPaintBonusHolder = challenger;
        G.scores[challenger] += 10;
        G.turnLog.push(`🌟 ${challenger === '0' ? '青' : '赤'}チームがロンゲストペイントボーナス(+10pt)を獲得！`);
      }
    } else {
      // 保持者は10マス以上維持しているが、チャレンジャーがそれを上回った場合奪取
      // 同数の場合は保持者のまま
      if (challengerCount > holderCount) {
        G.longestPaintBonusHolder = challenger;
        G.scores[currentHolder] -= 10;
        G.scores[challenger] += 10;
        G.turnLog.push(`🌟 ${challenger === '0' ? '青' : '赤'}チームが盤面を${challengerCount}マス塗り、ロンゲストペイントボーナスを奪取！`);
      }
    }
  }
}

function createChampionInstance(
  definitionId: string, 
  team: Team, 
  instanceIndex: number,
  initialPos: Position | null
): ChampionInstance | null {
  const definition = getChampionById(definitionId);
  if (!definition) return null;
  
  // ゲーム中は3つのスキル + 1つの交代カードにする
  const nonSwapCards = definition.cards.filter(c => !c.isSwap).slice(0, 3);
  const swapCard = definition.cards.find(c => c.isSwap);
  const selectedCards = swapCard ? [...nonSwapCards, swapCard] : nonSwapCards;

  return {
    id: `${team}-${definitionId}-${instanceIndex}`,
    definitionId,
    team,
    currentHp: definition.hp,
    maxHp: definition.hp,
    currentType: definition.type,
    pos: initialPos,
    cards: selectedCards.map(c => ({ ...c, currentCooldown: 0 })),
    isGuarding: false,
    knockoutTurnsRemaining: 0,
    isAwakened: false,
    usedSkillIds: [],
  };
}

export function getSpawnPositions(): Position[] {
  // 全盤面配置可能（中央3x3のAdmin Domainを除く）
  const positions: Position[] = [];
  for (let x = 0; x < BOARD_SIZE; x++) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      // 中央3x3 (Admin Domain) は配置不可
      if (isAdminDomain(x, y)) continue;
      positions.push({ x, y });
    }
  }
  return positions;
}

/**
 * 配置位置の妥当性をチェック（距離制約含む）
 * @param G ゲーム状態
 * @param pos 配置位置
 * @param excludeId 除外するチャンピオンID（自分自身）
 * @returns 配置可能ならtrue
 */
export function isValidDeployPosition(G: GameState, pos: Position, excludeId?: string): boolean {
  // 1. 盤面内チェック
  if (pos.x < 0 || pos.x >= BOARD_SIZE || pos.y < 0 || pos.y >= BOARD_SIZE) return false;
  
  // 2. 中央3x3 (Admin Domain) は配置不可
  if (isAdminDomain(pos.x, pos.y)) return false;
  
  // 3. 他のチャンピオンとの距離チェック
  const allChampions = [...G.players['0'].champions, ...G.players['1'].champions];
  for (const c of allChampions) {
    if (c.id === excludeId) continue;
    if (c.pos === null) continue;
    
    const distance = getDistance(pos, c.pos);
    if (distance < DEPLOY_MIN_DISTANCE) {
      return false; // 距離が近すぎる
    }
  }
  
  return true;
}

function getInitialPositions(team: Team): Position[] {
  const spawns = getSpawnPositions();
  return spawns.slice(0, CHAMPIONS_ON_FIELD);
}

function initializePlayerState(team: Team, championIds: string[]): PlayerState {
  const initialPositions = getInitialPositions(team);
  
  const champions: ChampionInstance[] = championIds.map((defId, idx) => {
    // 初期配置はnull（展開フェーズで配置）
    const pos = null;
    return createChampionInstance(defId, team, idx, pos);
  }).filter((c): c is ChampionInstance => c !== null);
  
  return {
    team,
    selectedChampionIds: championIds,
    champions,
    resources: { wood: 0, stone: 0 },
  };
}

/**
 * CPUの自動配置（新AI使用）
 * 勝利マスに近い位置を優先して配置
 */
function autoCPUDeploy(G: GameState): void {
  // 配置フェーズはAntigravityモードでも通常通りCPUが自動配置する
  // （Antigravityが操作するのは計画フェーズのアクションのみ）
  const cpuTeam: Team = '1';
  const cpuPlayer = G.players[cpuTeam];
  
  // まだ配置されていないチャンピオン（ノックアウトされていない、HP > 0）
  const undeployedChampion = cpuPlayer.champions.find(c => 
    c.pos === null && c.knockoutTurnsRemaining === 0 && c.currentHp > 0
  );
  
  if (!undeployedChampion) return; // 配置可能なチャンピオンがいない
  
  // 既にフィールドに3体いる場合は配置しない
  const deployedCount = cpuPlayer.champions.filter(c => c.pos !== null).length;
  if (deployedCount >= 3) return;
  
  // 新AIを使って最適な配置位置を選択
  const bestPos = selectCPUDeployPosition(G, undeployedChampion, cpuTeam);
  
  if (bestPos) {
    undeployedChampion.pos = { x: bestPos.x, y: bestPos.y };
    
    // ホームマス登録（CPU チームの初回配置フェーズの3体まで）
    if (G.homeSquares[cpuTeam].length < 3) {
      G.homeSquares[cpuTeam].push({ x: bestPos.x, y: bestPos.y });
      paintTile(G, bestPos.x, bestPos.y, cpuTeam);
      G.turnLog.push(`(${bestPos.x}, ${bestPos.y}) がホームマスとして登録されました`);
    }
    
    G.turnLog.push(`${getChampionDisplayName(undeployedChampion)} を (${bestPos.x}, ${bestPos.y}) に配置しました`);
  }
}


const ELEMENT_TYPES: ElementType[] = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'
];

const commonMoves = {
    // AIモードの切り替え
    toggleAIMode: ({ G }: { G: GameState }) => {
      if (G.gamePhase !== 'deploy' && G.gamePhase !== 'planning') return;
      G.aiMode = G.aiMode === 'cpu' ? 'antigravity' : 'cpu';
      G.turnLog.push(`AIモードを ${G.aiMode === 'cpu' ? 'CPU' : 'Antigravity'} に変更しました`);
    },
    
    // Antigravityからのアクションを受信
    submitAntigravityAction: ({ G, random }: { G: GameState; random: any }, actionsPayload: TurnAction | any[]) => {
      if (G.aiMode !== 'antigravity' || G.gamePhase !== 'planning' || G.antigravityState !== 'waiting_for_move') return;
      
      // 受信したアクションをセット (配列が直接渡された場合と、{actions: [...]}のオブジェクトが渡された場合の両方に対応)
      if (Array.isArray(actionsPayload)) {
        G.turnActions['1'] = { actions: actionsPayload };
      } else {
        G.turnActions['1'] = actionsPayload;
      }
      G.antigravityState = 'idle';
      
      // 全行動を優先度順にソートして解決フェーズへ
      const allActions: PendingAction[] = [];
      
      for (const team of ['0', '1'] as Team[]) {
        for (const action of G.turnActions[team].actions) {
          const champion = G.players[team].champions.find(c => c.id === action.championId);
          if (!champion) continue;
          
          let priority = 0;
          if (!('discardCardIds' in action)) {
            const card = champion.cards.find(c => c.id === action.cardId);
            priority = card?.priority || 0;
          }
          
          const def = getChampionById(champion.definitionId);
          const speed = def ? def.speed : 0;
          
          allActions.push({
            action,
            team,
            priority,
            speed,
            championId: action.championId,
          });
        }
      }
      
      // 優先度の高い順にソート（同数の場合は素早さが高い順）
      allActions.sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return b.speed - a.speed;
      });
      
      G.pendingActions = allActions;
      G.gamePhase = 'resolution';
      G.turnLog.push('--- 解決フェーズ開始 (Antigravity行動受付完了) ---');
      
      processNextAction(G, random);
    },

    // 解決フェーズ: Antigravityからのターゲット情報を受信する
    submitAntigravityTarget: ({ G, random }: { G: GameState; random: any }, targetData: any) => {
      // 解決フェーズかつAntigravityのターゲット待ち状態でのみ有効
      if (G.gamePhase !== 'resolution' || G.antigravityState !== 'waiting_for_action_target' || !G.currentResolvingAction) return;

      const { action, team } = G.currentResolvingAction;
      const cardAction = action as CardAction;

      // targetDataをアクションのプロパティに適用
      if (targetData.targetPos) cardAction.targetPos = targetData.targetPos;
      if (targetData.targetChampionId) cardAction.targetChampionId = targetData.targetChampionId;
      if (targetData.attackDirection) cardAction.attackDirection = targetData.attackDirection;
      if (targetData.attackTargetPos) cardAction.attackTargetPos = targetData.attackTargetPos;

      G.antigravityState = 'idle';
      
      // ターゲット情報が設定された前提で解決を実行
      resolveCardAction(G, cardAction, team, random);
      G.awaitingTargetSelection = false;
      G.currentResolvingAction = null;
      processNextAction(G, random);
    },

    // 計画フェーズ: カードを選択
    selectCard: (
      { G, playerID }: { G: GameState; playerID: string },
      championId: string,
      cardId: string,
      isAlternativeMove?: boolean,
      isAlternativePurchase?: boolean
    ) => {
      if (G.gamePhase !== 'planning') return;
      
      const team = playerID as Team;
      const playerState = G.players[team];
      
      const champion = playerState.champions.find(c => c.id === championId);
      if (!champion || champion.pos === null) return;
      
      const card = champion.cards.find(c => c.id === cardId && c.currentCooldown === 0);
      if (!card) return;
      
      const currentActions = G.turnActions[team].actions;
      if (currentActions.length >= 2) return;
      
      const alreadyActing = currentActions.some(a => a.championId === championId);
      if (alreadyActing) return;

      // 代替購入の資源チェック
      if (isAlternativePurchase) {
        // 先に計画された代替購入があるか確認（同じターンで複数回購入する場合の複数チェック）
        let plannedWoodCost = 0;
        let plannedStoneCost = 0;
        for (const a of currentActions) {
          if ('isAlternativePurchase' in a && a.isAlternativePurchase) {
            plannedWoodCost += 1;
            plannedStoneCost += 1;
          }
        }
        
        if (playerState.resources.wood < 1 + plannedWoodCost || playerState.resources.stone < 1 + plannedStoneCost) {
          G.turnLog.push(`❌ 代替購入には木材1と石材1が必要です！`);
          return;
        }
      } 
      // 通常の資源コストチェック
      else if (!isAlternativeMove && card.resourceCost) {
        // 古いセーブデータ対策
        const usedSkills = champion.usedSkillIds || [];
        const isFirstTime = !usedSkills.includes(card.id);
        if (!isFirstTime) {
          // 既に計画されているアクションのコストを計算
          const plannedCosts = { wood: 0, stone: 0, iron: 0 };
          for (const a of currentActions) {
            if ('discardCardIds' in a) continue; // ガードはコストなし
            if (a.isAlternativeMove) continue;
            
            const plannedChampion = playerState.champions.find(c => c.id === a.championId);
            if (!plannedChampion) continue;
            
            const plannedCard = plannedChampion.cards.find(c => c.id === a.cardId);
            if (!plannedCard || !plannedCard.resourceCost) continue;
            
            const plannedUsedSkills = plannedChampion.usedSkillIds || [];
            const plannedFirstTime = !plannedUsedSkills.includes(plannedCard.id);
            if (!plannedFirstTime) {
              plannedCosts.wood += plannedCard.resourceCost.wood || 0;
              plannedCosts.stone += plannedCard.resourceCost.stone || 0;
            }
          }
          
          const neededWood = (card.resourceCost.wood || 0) + plannedCosts.wood;
          const neededStone = (card.resourceCost.stone || 0) + plannedCosts.stone;
          
          if (
            playerState.resources.wood < neededWood ||
            playerState.resources.stone < neededStone
          ) {
            G.turnLog.push(`❌ ${card.nameJa} を使用するための資源が足りません！`);
            return; // 資源不足
          }
        }
      }
      
      const action: CardAction = {
        championId,
        cardId,
        isAlternativeMove: isAlternativeMove || false,
        isAlternativePurchase: isAlternativePurchase || false,
      };
      
      G.turnActions[team].actions.push(action);
    },
    
    // 計画フェーズ: ガード選択
    guard: (
      { G, playerID }: { G: GameState; playerID: string },
      championId: string,
      discardCardIds: [string, string]
    ) => {
      if (G.gamePhase !== 'planning') return;
      
      const team = playerID as Team;
      const playerState = G.players[team];
      
      const champion = playerState.champions.find(c => c.id === championId);
      if (!champion || champion.pos === null) return;
      
      const card1 = champion.cards.find(c => c.id === discardCardIds[0] && c.currentCooldown === 0);
      const card2 = champion.cards.find(c => c.id === discardCardIds[1] && c.currentCooldown === 0);
      if (!card1 || !card2) return;
      
      const currentActions = G.turnActions[team].actions;
      if (currentActions.length >= 2) return;
      
      const alreadyActing = currentActions.some(a => a.championId === championId);
      if (alreadyActing) return;
      
      const action: GuardAction = {
        championId,
        discardCardIds,
      };
      
      G.turnActions[team].actions.push(action);
    },
    
    // 行動キャンセル
    cancelAction: (
      { G, playerID }: { G: GameState; playerID: string },
      championId: string
    ) => {
      if (G.gamePhase !== 'planning') return;
      const team = playerID as Team;
      G.turnActions[team].actions = G.turnActions[team].actions.filter(
        a => a.championId !== championId
      );
    },
    
    // 計画確定 → 解決フェーズへ
    confirmPlan: ({ G, random }: { G: GameState; random: any }) => {
      if (G.gamePhase !== 'planning') return;
      
      const activeChampionsCount = G.players['0'].champions.filter(c => c.pos !== null).length;
      const requiredActions = Math.min(2, activeChampionsCount);
      
      if (G.turnActions['0'].actions.length < requiredActions) return;
      
      if (G.aiMode === 'antigravity') {
        // Antigravityモードの場合は外部からの入力を待つ
        G.antigravityState = 'waiting_for_move';
        G.turnLog.push('Antigravityの行動を待機しています...');
        return;
      }
      
      // CPUの行動を自動選択（新AI）
      const cpuActions = selectCPUActions(G, '1');
      G.turnActions['1'].actions = cpuActions;
      
      // 全行動を優先度順にソート
      const allActions: PendingAction[] = [];
      
      for (const team of ['0', '1'] as Team[]) {
        for (const action of G.turnActions[team].actions) {
          const champion = G.players[team].champions.find(c => c.id === action.championId);
          if (!champion) continue;
          
          let priority = 0;
          if (!('discardCardIds' in action)) {
            const card = champion.cards.find(c => c.id === action.cardId);
            priority = card?.priority || 0;
          }
          
          const def = getChampionById(champion.definitionId);
          const speed = def ? def.speed : 0;
          
          allActions.push({
            action,
            team,
            priority,
            speed,
            championId: action.championId,
          });
        }
      }
      
      // 優先度の高い順にソート（同数の場合は素早さが高い順）
      allActions.sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return b.speed - a.speed;
      });
      
      G.pendingActions = allActions;
      G.gamePhase = 'resolution';
      G.turnLog.push('--- 解決フェーズ開始 ---');
      
      // 最初の行動を設定
      processNextAction(G, random);
    },
    
    // 解決フェーズ: ターゲットを選択して実行
    selectTarget: (
      { G, random }: { G: GameState; random: any },
      targetPos?: Position,
      targetChampionId?: string,
      skipAttack?: boolean,
      attackDirection?: Position,
      attackTargetPos?: Position
    ) => {
      if (G.gamePhase !== 'resolution') return;
      if (!G.currentResolvingAction) return;
      if (!G.awaitingTargetSelection) return;
      
      const { action, team } = G.currentResolvingAction;

      // Antigravity AIのターゲット選択待ち状態では、ここで（UIからの）プレイヤー入力を受け付けない
      if (G.aiMode === 'antigravity' && team === '1') {
        return;
      }

      const champion = G.players[team].champions.find(c => c.id === action.championId);
      if (!champion) return;

      // ガードの場合はターゲット不要
      if ('discardCardIds' in action) {
        resolveGuardAction(G, action, team);
        G.awaitingTargetSelection = false;
        G.currentResolvingAction = null;
        processNextAction(G, random);
        return;
      }

      const cardAction = action as CardAction;

      // 入力を更新 (undefinedでない場合のみ上書き)
      if (targetPos) cardAction.targetPos = targetPos;
      if (targetChampionId) cardAction.targetChampionId = targetChampionId;
      if (attackDirection) cardAction.attackDirection = attackDirection;
      if (attackTargetPos) cardAction.attackTargetPos = attackTargetPos;

      // 代替アクション以外でカード情報を取得
      const card = !cardAction.isAlternativeMove 
        ? champion.cards.find(c => c.id === cardAction.cardId) 
        : null;

      // 解決の可否を判定
      let readyToResolve = true;

      // 0. 方向指定攻撃の場合：方向が設定されていれば即解決
      if (card && card.isDirectional && cardAction.attackDirection) {
        // 方向が設定されているので即解決
        readyToResolve = true;
      }
      // 1. 代替アクションの場合：移動先が必須
      else if (cardAction.isAlternativeMove) {
        if (!cardAction.targetPos) readyToResolve = false;
      } 
      // 2. カードアクションの場合
      else if (card) {
        // A. 移動が必要な場合、移動先チェック
        if (card.move > 0 && !cardAction.targetPos) {
          readyToResolve = false;
        }

        // B. 攻撃が必要な場合
        // 条件: 攻撃力がある AND 攻撃スキップされていない
        if (card.power > 0 && !skipAttack) {
          // すでにターゲット指定済みならOK
          if (cardAction.targetChampionId || cardAction.attackTargetPos) {
            // OK
          } else {
            // ターゲット未指定の場合、
            // 「そもそも攻撃可能な対象がいるか」を判定する
            const effectivePos = cardAction.targetPos || champion.pos;
            if (!effectivePos) {
              // 移動先も未定なら判定不能なのでfalse
               readyToResolve = false;
            } else {
              const attackRange = card.attackRange ?? (card.move > 0 ? 1 : 2);
              const enemyTeam = team === '0' ? '1' : '0';
              
              // 敵チャンピオンチェック
              const hasEnemyChampion = G.players[enemyTeam].champions.some(c => 
                c.pos !== null && getDistance(effectivePos, c.pos) <= attackRange
              );
              // ブロックチェック
              const hasBlock = G.blocks.some(b => getDistance(effectivePos, {x: b.x, y: b.y}) <= attackRange);
              
              if (hasEnemyChampion || hasBlock) {
                // 対象がいるのに選択されていない -> 待機
                readyToResolve = false;
              } else {
                // 対象がいない -> 攻撃ステップは完了とみなす(スキップ)
                // 明示的にスキップログを出しても良いが、解決関数内で処理されないだけ
              }
            }
          }
        }

        if (card.isSwap) {
          if (!cardAction.targetChampionId) {
             // 交代対象（ベンチ）の指定が必須
             // ベンチに交代可能なユニットがいるか確認
             const benchChampions = G.players[team].champions.filter(c => 
               c.pos === null && c.knockoutTurnsRemaining === 0
             );
             
             if (benchChampions.length > 0) {
                readyToResolve = false; 
             } else {
                // 交代相手がいない場合はそのまま実行（効果不発）
                readyToResolve = true; 
             }
          } else {
             // 指定されたIDが本当に自軍のベンチか検証
             const targetChamp = G.players[team].champions.find(c => c.id === cardAction.targetChampionId);
             if (!targetChamp || targetChamp.pos !== null) {
                // 不正なターゲット
                readyToResolve = false; 
             }
          }
        }
      }

      // すべての情報が揃ったら解決
      if (readyToResolve) {
        resolveCardAction(G, cardAction, team, random);
        G.awaitingTargetSelection = false;
        G.currentResolvingAction = null;
        processNextAction(G, random);
      } else {
        // まだ情報が足りない場合、ステートを更新して待機継続
        console.log('Waiting for more targets...', cardAction);
      }
    },
    
    // 解決フェーズ: スキップ（移動・攻撃しない）
    skipAction: ({ G, random }: { G: GameState; random: any }) => {
      if (G.gamePhase !== 'resolution') return;
      if (!G.currentResolvingAction) return;
      
      const { action, team } = G.currentResolvingAction;

      // Antigravity AIの待機状態ではプレイヤーによるスキップ操作を受け付けない
      if (G.aiMode === 'antigravity' && team === '1') {
        return;
      }

      const champion = G.players[team].champions.find(c => c.id === action.championId);
      
      if (champion && !('discardCardIds' in action)) {
        const card = champion.cards.find(c => c.id === action.cardId);
        if (card) {
          G.turnLog.push(`${getChampionDisplayName(champion)} は ${card.nameJa} の使用をスキップした`);
          // スキップしてもCDは消費する
          card.currentCooldown = card.cooldown;
        }
      }
      
      G.awaitingTargetSelection = false;
      G.currentResolvingAction = null;
      processNextAction(G, random);
    },

    // CPUアクション実行（ディレイ後にUIから呼ばれる）
    continueCPUAction: ({ G, random }: { G: GameState; random: any }) => {
      console.log('[DEBUG] continueCPUAction called', {
        gamePhase: G.gamePhase,
        cpuActionDelay: G.cpuActionDelay,
        currentResolvingAction: G.currentResolvingAction
      });
      if (G.gamePhase !== 'resolution') {
        console.log('[DEBUG] Returning: not in resolution phase');
        return;
      }
      if (G.cpuActionDelay === 0) {
        console.log('[DEBUG] Returning: cpuActionDelay is 0');
        return;
      }
      if (!G.currentResolvingAction) {
        console.log('[DEBUG] Returning: no currentResolvingAction');
        return;
      }
      
      const { action, team } = G.currentResolvingAction;
      
      // ガードアクションの場合
      if ('discardCardIds' in action) {
        resolveGuardAction(G, action, team);
      } else {
        // カードアクションの場合（ターゲットは既に設定済み）
        // Antigravityモードでは、ターゲットは外部から既に指定されている前提
        resolveCardAction(G, action, team, random);
      }
      
      G.cpuActionDelay = 0;
      G.currentResolvingAction = null;
      console.log('[DEBUG] continueCPUAction completed, calling processNextAction');
      processNextAction(G, random);
    },

    // 配置フェーズ: チャンピオンを配置
    deployChampion: (
      { G, playerID, events }: { G: GameState; playerID: string; events: any },
      championId: string,
      x: number,
      y: number
    ) => {
      if (G.gamePhase !== 'deploy') return;
      
      // 手番チェック
      if (G.deployTurn && G.deployTurn !== playerID) return;

      const team = playerID as Team;
      const player = G.players[team];
      
      // 3体制限チェック
      const deployedCount = player.champions.filter(c => c.pos !== null).length;
      if (deployedCount >= CHAMPIONS_ON_FIELD) return; // 既に3体フィールドにいる
      
      const champion = player.champions.find(c => c.id === championId);
      if (!champion) return;
      if (champion.pos !== null) return; // 既に配置済み
      
      // 配置位置の妥当性チェック（距離制約含む）
      const pos = { x, y };
      if (!isValidDeployPosition(G, pos)) {
        return; // 配置不可（距離制約違反または中央エリア）
      }
      
      // 配置実行
      champion.pos = { x, y };
      
      // ホームマス登録（初回配置フェーズの3体まで）
      // G.currentPhase === 1 かつ G.turnInPhase === 1（ゲーム開始直後）の間に配置された場所をホームマスとする
      // より簡易に：homeSquaresが3マス未満の間は登録
      if (G.homeSquares[team].length < 3) {
        G.homeSquares[team].push({ x, y });
        paintTile(G, x, y, team);
        G.turnLog.push(`(${x}, ${y}) がホームマスとして登録されました`);
      }
      
      G.turnLog.push(`${getChampionDisplayName(champion)} を (${x}, ${y}) に配置しました`);
      
      // 手番を交代
      const nextTurn = G.deployTurn === '0' ? '1' : '0';
      G.deployTurn = nextTurn;
      
      // CPUのターン('1')なら自動配置
      if (nextTurn === '1') {
        autoCPUDeploy(G);
        // CPUが配置したら再度プレイヤーの番に戻す
        G.deployTurn = '0';
      }
      
      // 配置完了チェック（mainフェーズ中の配置用）
      const team0Deployed = G.players['0'].champions.filter(c => c.pos !== null).length;
      const team1Deployed = G.players['1'].champions.filter(c => c.pos !== null).length;
      const team0Ready = team0Deployed >= CHAMPIONS_ON_FIELD || G.players['0'].champions.every(c => 
        c.pos !== null || c.knockoutTurnsRemaining > 0 || c.currentHp <= 0
      );
      const team1Ready = team1Deployed >= CHAMPIONS_ON_FIELD || G.players['1'].champions.every(c => 
        c.pos !== null || c.knockoutTurnsRemaining > 0 || c.currentHp <= 0
      );
      
      if (team0Ready && team1Ready) {
        // 配置完了 → 計画フェーズへ
        G.gamePhase = 'planning';
        G.turnLog.push('--- 配置完了: 計画フェーズ開始 ---');
      }
      
      events.endTurn({ next: G.deployTurn });
    },


};

export const LoLBoardGame = {
  name: 'lol-board-game',

  setup: ({ random }: { random: any }): GameState => {
    // 13x13の陣地マップを初期化（全てnull = 未塗り）
    const territory: TerritoryOwner[][] = Array(BOARD_SIZE)
      .fill(null)
      .map(() => Array(BOARD_SIZE).fill(null));

    const team0Champions = ['gekogekoga', 'enshishi', 'raichou', 'kidouba'];
    const team1Champions = ['kidouba', 'raichou', 'enshishi', 'gekogekoga'];

    const players: Record<Team, PlayerState> = {
      '0': initializePlayerState('0', team0Champions),
      '1': initializePlayerState('1', team1Champions),
    };

    // ゲーム開始時に中央エリアに初期ポイントトークン（予告）を配置
    const initialPendingTokens: PendingPointToken[] = [];
    const centerPositions = [
      { x: 5, y: 6 }, { x: 6, y: 5 }, { x: 6, y: 6 }, 
      { x: 6, y: 7 }, { x: 7, y: 6 }
    ];
    // ランダムに3箇所選んで5ptトークンを配置
    const shuffled = [...centerPositions].sort(() => random.Number() - 0.5);
    for (let i = 0; i < 3; i++) {
      initialPendingTokens.push({
        x: shuffled[i].x,
        y: shuffled[i].y,
        value: 5
      });
    }

    // ランダムなブロックの生成 (hp1が6個、hp2が4個 = 計10個)
    const blocks: Block[] = [];
    const blockHps = [1, 1, 1, 1, 1, 1, 2, 2, 2, 2];
    let placedBlocks = 0;
    
    while (placedBlocks < blockHps.length) {
      const x = Math.floor(random.Number() * BOARD_SIZE);
      const y = Math.floor(random.Number() * BOARD_SIZE);
      
      // Admin Domainを避ける
      if (isAdminDomain(x, y)) continue;
      // 重複チェック
      if (blocks.some(b => b.x === x && b.y === y)) continue;
      
      const maxHp = blockHps[placedBlocks];
      blocks.push({ x, y, hp: maxHp, maxHp });
      placedBlocks++;
    }

    // 資源ノードの生成 (木材9、石材9 = 計18個)
    const resourceNodes: ResourceNode[] = [];
    const resourceTypes: ResourceType[] = ['wood', 'wood', 'wood', 'wood', 'wood', 'wood', 'wood', 'wood', 'wood', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone'];
    let placed = 0;
    
    while (placed < resourceTypes.length) {
      const x = Math.floor(random.Number() * BOARD_SIZE);
      const y = Math.floor(random.Number() * BOARD_SIZE);
      
      // Admin Domainとブロックを避ける
      if (isAdminDomain(x, y)) continue;
      if (blocks.some(b => b.x === x && b.y === y)) continue;
      // 重複チェック
      if (resourceNodes.some(n => n.x === x && n.y === y)) continue;
      
      // 1〜3のランダムな目を割り当て
      const triggerNumber = 1 + Math.floor(random.Number() * 3);
      resourceNodes.push({ x, y, type: resourceTypes[placed], triggerNumber });
      placed++;
    }

    return {
      players,
      territory,
      scores: { '0': 0, '1': 0 },
      longestPaintBonusHolder: null, // ★ロンゲストペイントボーナスの初期化
      pointTokens: [],  // ポイントトークン初期化
      pendingPointTokens: initialPendingTokens,  // 初期予告トークン（中央に5pt×3）
      currentPhase: 1,
      turnInPhase: 1,
      turnActions: { 
        '0': { actions: [] }, 
        '1': { actions: [] } 
      },
      turnLog: [
        'ゲーム開始 - 13×13ボード（陣取りモード）', 
        '【ルール】先に50ポイント到達で勝利！',
        '【新ルール】ポイントトークンを集めよう！',
        '【注意】3マス未満の陣地は消滅します',
        'まずはチャンピオンを配置してください'
      ],
      gamePhase: 'deploy',
      deployTurn: '0',
      winner: null,
      pendingActions: [],
      currentResolvingAction: null,
      awaitingTargetSelection: false,
      damageEvents: [],
      pointEvents: [],
      cpuActionDelay: 0,
      homeSquares: { '0': [], '1': [] },
      blocks,
      resourceNodes,           // ★ 生成した資源ノードを初期化
      resourceRollResult: null, // ★
      aiMode: 'cpu',
      antigravityState: 'idle',
      merchant: null
    };
  },

  moves: {
    ...commonMoves
  },
  
  phases: {
    deploy: {
      start: true,
      next: 'main',
      turn: {
        order: TurnOrder.RESET,
        activePlayers: { currentPlayer: 'deploy' },
      },
      moves: {
        deployChampion: commonMoves.deployChampion,
        toggleAIMode: commonMoves.toggleAIMode,
      },
      endIf: ({ G }: { G: GameState }) => {
        // 両チームが3体ずつ配置したら終了
        const team0Deployed = G.players['0'].champions.filter(c => c.pos !== null).length;
        const team1Deployed = G.players['1'].champions.filter(c => c.pos !== null).length;
        // ベンチの数や撃破状態も考慮必要だが、初期配置・再配置フェーズでは
        // 「出撃可能なチャンピオン(knockoutTurns=0)で、まだFieldにいないもの」を出し切るまで、あるいはFieldが3体になるまで
        
        // 簡易判定: Field上限(3)に達しているか、または出せる駒がもうない
        // HP 0のチャンピオンは配置不可として扱う
        const team0Ready = team0Deployed >= 3 || G.players['0'].champions.every(c => 
          c.pos !== null || c.knockoutTurnsRemaining > 0 || c.currentHp <= 0
        );
        const team1Ready = team1Deployed >= 3 || G.players['1'].champions.every(c => 
          c.pos !== null || c.knockoutTurnsRemaining > 0 || c.currentHp <= 0
        );
        
        console.log('[DEBUG] Deploy endIf check:', {
          team0Deployed,
          team1Deployed,
          team0Ready,
          team1Ready,
          team0Champions: G.players['0'].champions.map(c => ({
            id: c.definitionId,
            pos: c.pos,
            hp: c.currentHp,
            knockout: c.knockoutTurnsRemaining
          })),
          team1Champions: G.players['1'].champions.map(c => ({
            id: c.definitionId,
            pos: c.pos,
            hp: c.currentHp,
            knockout: c.knockoutTurnsRemaining
          }))
        });
        
        return team0Ready && team1Ready;
      },
      onEnd: ({ G }: { G: GameState }) => {
        G.gamePhase = 'planning';
        G.turnLog.push('--- 配置完了: 計画フェーズ開始 ---');
      }
    },
    main: {
      moves: {
        ...commonMoves,
        deployChampion: commonMoves.deployChampion,
      }
    }
  },

  turn: {
    activePlayers: ActivePlayers.ALL,
    onBegin: ({ G }: { G: GameState }) => {
      G.turnActions = { '0': { actions: [] }, '1': { actions: [] } };
      // 配置フェーズ中はgamePhaseを上書きしない
      if (G.gamePhase !== 'deploy') {
        G.gamePhase = 'planning';
      }
      G.pendingActions = [];
      G.currentResolvingAction = null;
      G.awaitingTargetSelection = false;
      
      for (const team of ['0', '1'] as Team[]) {
        for (const champion of G.players[team].champions) {
          champion.isGuarding = false;
        }
      }
    },
  },
  
  endIf: ({ G }: { G: GameState }) => {
    // 勝利判定: winnerが設定されていればそれを返す
    if (G.winner) return { winner: G.winner };
    
    // スコアベースの勝利判定（50ポイント到達）
    if (G.scores['0'] >= VICTORY_SCORE) return { winner: '0' };
    if (G.scores['1'] >= VICTORY_SCORE) return { winner: '1' };
    
    // 全員ひんし敗北判定: フィールド上のチャンピオンが0体になったチームの負け
    // ただし配置フェーズ中（deploy）は判定しない（まだ誰も配置していないため）
    if (G.gamePhase !== 'deploy') {
      for (const team of ['0', '1'] as Team[]) {
        const enemyTeam = team === '0' ? '1' : '0';
        const hasFieldChampion = G.players[team].champions.some(c => c.pos !== null);
        if (!hasFieldChampion) {
          return { winner: enemyTeam };
        }
      }
    }
    
    return undefined;
  },
};

/**
 * 次の行動を処理
 */
function processNextAction(G: GameState, random: any) {
  // 全行動終了チェック
  if (G.pendingActions.length === 0) {
    finishResolutionPhase(G, random);
    return;
  }
  
  // 次の行動を取得
  const nextAction = G.pendingActions.shift()!;
  G.currentResolvingAction = nextAction;
  
  const { action, team } = nextAction;
  const champion = G.players[team].champions.find(c => c.id === action.championId);
  
  if (!champion || !champion.pos) {
    // チャンピオンが倒されている場合、スキップ
    processNextAction(G, random);
    return;
  }
  
  // ガードアクションの処理
  if ('discardCardIds' in action) {
    if (team === '0') {
      // プレイヤーのガードは即時実行
      resolveGuardAction(G, action, team);
      G.currentResolvingAction = null;
      processNextAction(G, random);
    } else {
      // CPUのガードはディレイ表示
      G.cpuActionDelay = Date.now();
      const championForLog = G.players[team].champions.find(c => c.id === action.championId);
      G.turnLog.push(`[CPU] ${championForLog ? getChampionDisplayName(championForLog) : 'チャンピオン'} がガードを選択...`);
    }
    return;
  }
  
  // プレイヤーの行動: ターゲット選択待ち
  if (team === '0') {
    G.awaitingTargetSelection = true;
    const card = champion.cards.find(c => c.id === action.cardId);
    G.turnLog.push(`[あなたの番] ${getChampionDisplayName(champion)} の ${card?.nameJa || 'カード'} - ターゲットを選択してください`);
    return;
  }
  
  // CPUの行動
  const card = champion.cards.find(c => c.id === action.cardId);

  // --- Antigravityモード時のターゲット選択待機 ---
  if (G.aiMode === 'antigravity' && team === '1') {
    // 既にターゲット情報が含まれているか確認
    let needsTarget = true;
    if (action.isAlternativeMove && action.targetPos) needsTarget = false;
    else if (card) {
      if (card.isSwap && action.targetChampionId) needsTarget = false;
      else if (card.isDirectional && action.attackDirection) needsTarget = false;
      else if (card.move > 0 && action.targetPos && card.power === 0) needsTarget = false;
      else if (card.power > 0 && (action.targetChampionId || action.attackTargetPos || action.targetPos)) {
        // 攻撃技で、何らかのターゲットが指定済みなら待機不要とする
        needsTarget = false;
      }
    }

    if (needsTarget) {
      G.awaitingTargetSelection = true;
      G.antigravityState = 'waiting_for_action_target';
      G.turnLog.push(`[Antigravity] ${getChampionDisplayName(champion)} が ${card?.nameJa || 'カード'} を使用 - ターゲット選択待ち...`);
      return;
    }
  }
  // ---------------------------------------------
  
  // ディレイ表示のためにここで一旦停止
  // ターゲットを事前に決定してアクションに設定
  if (card) {
    const { targetPos, targetChampionId } = selectCPUTarget(
      G, 
      champion, 
      card, 
      team, 
      !!action.isAlternativeMove // isAlternativeMoveフラグを渡す
    );
    action.targetPos = targetPos;
    action.targetChampionId = targetChampionId;
  }
  
  // CPUアクションディレイを設定（UIが続行を呼ぶまで待機）
  G.cpuActionDelay = Date.now();
  G.turnLog.push(`[CPU] ${getChampionDisplayName(champion)} が ${card?.nameJa || 'カード'} を使用...`);
}

/**
 * ガードアクションの解決
 */
function resolveGuardAction(G: GameState, action: GuardAction, team: Team) {
  const champion = G.players[team].champions.find(c => c.id === action.championId);
  if (!champion || !champion.pos) return;
  
  champion.isGuarding = true;
  // ガードで使った2枚のカードにCDをセット
  for (const cardId of action.discardCardIds) {
    const card = champion.cards.find(c => c.id === cardId);
    if (card) card.currentCooldown = card.cooldown;
  }
  G.turnLog.push(`${getChampionDisplayName(champion)} がガード状態になった`);
}

/**
 * カードアクションの解決
 */
function resolveCardAction(
  G: GameState, 
  action: CardAction, 
  team: Team,
  random: any
) {
  const champion = G.players[team].champions.find(c => c.id === action.championId);
  if (!champion || !champion.pos) return;
  
  const card = champion.cards.find(c => c.id === action.cardId);
  if (!card) return;
  
  const championDef = getChampionById(champion.definitionId);
  const championName = getChampionDisplayName(champion);
  
  const enemyTeam = team === '0' ? '1' : '0';
  
  // 代替購入: 商人との取引
  if (action.isAlternativePurchase) {
    if (G.merchant) {
      const dist = Math.abs(G.merchant.x - champion.pos.x) + Math.abs(G.merchant.y - champion.pos.y);
      if (dist <= 1) {
        if (G.players[team].resources.wood >= 1 && G.players[team].resources.stone >= 1) {
          G.players[team].resources.wood -= 1;
          G.players[team].resources.stone -= 1;
          G.scores[team] += 10;
          
          G.pointEvents.push({
            id: `pt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            x: G.merchant.x,
            y: G.merchant.y,
            amount: 10,
            team: team,
            timestamp: Date.now(),
          });
          
          G.turnLog.push(`💰 ${championName} は商人と取引した！ (木材-1, 石材-1, スコア+10pt)`);
        } else {
          G.turnLog.push(`❌ ${championName} は商人と取引しようとしたが、資源が足りなかった...`);
        }
      } else {
        G.turnLog.push(`❌ ${championName} は商人と取引しようとしたが、遠すぎた...`);
      }
    }
    card.currentCooldown = card.cooldown;
    return;
  }

  // 代替アクション: 2マス移動（マンハッタン距離2以内）
  if (action.isAlternativeMove) {
    if (action.targetPos) {
      const dist = Math.abs(action.targetPos.x - champion.pos.x) + Math.abs(action.targetPos.y - champion.pos.y);
      const isWithinRange = dist >= 1 && dist <= 2;
      
      if (isWithinRange) {
        const allChampions = [...G.players['0'].champions, ...G.players['1'].champions];
        const isOccupied = allChampions.some(c => 
          c.id !== champion.id && c.pos?.x === action.targetPos!.x && c.pos?.y === action.targetPos!.y
        );
        
        if (!isOccupied) {
          // 移動経路を塗る（チャンピオン位置更新前に経路を計算して塗る）
          const oldPos = { ...champion.pos };
          
          // 移動経路塗り（BFS経路を使用）- 位置更新前に計算
          paintPathBetween(G, oldPos, action.targetPos, team, champion.id);
          
          // チャンピオン位置を更新
          champion.pos = action.targetPos;
          G.turnLog.push(`${championName} は (${action.targetPos.x}, ${action.targetPos.y}) に移動した（代替アクション）`);
        }
      }
    }
    // カードにCDをセット
    card.currentCooldown = card.cooldown;
    return;
  }
  
  // 資源コストの支払いと初回使用チェック
  if (card.resourceCost) {
    if (!champion.usedSkillIds) champion.usedSkillIds = [];
    const isFirstTime = !champion.usedSkillIds.includes(card.id);
    if (!isFirstTime) {
      if (card.resourceCost.wood) G.players[team].resources.wood -= card.resourceCost.wood;
      if (card.resourceCost.stone) G.players[team].resources.stone -= card.resourceCost.stone;
    } else {
      G.turnLog.push(`✨ ${championName} は初めて ${card.nameJa} を使うため、資源コスト0で発動！`);
      champion.usedSkillIds.push(card.id);
    }
  }
  
  // へんげんじざい特性
  if (championDef?.ability === 'protean' && card.type !== 'normal') {
    champion.currentType = card.type;
    G.turnLog.push(`${championName} は ${getTypeNameJa(card.type)} タイプに変化した！`);
  }
  
  // 移動処理（bonusMoveを加算）
  const effectiveMove = card.move + (card.bonusMove ?? 0);
  if (effectiveMove > 0 && action.targetPos) {
    const dist = getDistance(champion.pos, action.targetPos);
    
    const moveCost = calculateMoveCost(G, champion.pos, action.targetPos, team);
    
    if (moveCost <= effectiveMove) {
      const allChampions = [...G.players['0'].champions, ...G.players['1'].champions];
      const isOccupied = allChampions.some(c => 
        c.id !== champion.id && c.pos?.x === action.targetPos!.x && c.pos?.y === action.targetPos!.y
      );
      
      if (!isOccupied) {
        // 移動経路を塗る（チャンピオン位置更新前に経路を計算して塗る）
        const oldPos = { ...champion.pos };
        
        // 移動経路塗り（BFS経路を使用）- 位置更新前に計算
        paintPathBetween(G, oldPos, action.targetPos, team, champion.id);
        
        // チャンピオン位置を更新
        champion.pos = action.targetPos;
        G.turnLog.push(`${championName} は (${action.targetPos.x}, ${action.targetPos.y}) に移動した`);
      }
    }
  }
  
  // 勝利が確定している場合は攻撃処理をスキップ
  if (G.winner) {
    card.currentCooldown = card.cooldown;
    return;
  }
  
  // 攻撃処理
  if (card.power > 0) {
    const attackRange = card.attackRange ?? (card.move > 0 ? 1 : 2);
    
    // 攻撃対象位置（ユニットがいるかどうかに関わらず、攻撃した場所は塗れる？）
    // ユーザー要望: "攻撃を行うマスにも塗ることができます"
    
    // ターゲット指定座標があればそこを塗る
    let targetPos = action.targetPos;
    
    // 方向指定攻撃（かえんほうしゃ等）の処理
    if (card.isDirectional && action.attackDirection && card.lineRange) {
      const dir = action.attackDirection;
      const lineRange = card.lineRange;
      
      G.turnLog.push(`${championName} の ${card.nameJa}！`);
      
      for (let i = 1; i <= lineRange; i++) {
        const tx = champion.pos.x + dir.x * i;
        const ty = champion.pos.y + dir.y * i;
        
        // 盤面外チェック
        if (tx < 0 || tx >= BOARD_SIZE || ty < 0 || ty >= BOARD_SIZE) break;
        
        // ブロックチェック（当たったら終了）
        const block = G.blocks.find(b => b.x === tx && b.y === ty);
        if (block) {
          block.hp--;
          G.turnLog.push(`ブロックにヒット！ (残りHP: ${block.hp})`);
          paintTile(G, tx, ty, team);
          if (block.hp <= 0) {
            G.blocks = G.blocks.filter(b => b !== block);
            G.turnLog.push(`ブロックが破壊された！`);
          }
          break; // 貫通しない
        }
        
        // 敵チャンピオンチェック
        const enemy = G.players[enemyTeam].champions.find(c => 
          c.pos !== null && c.pos.x === tx && c.pos.y === ty
        );
        if (enemy) {
          const effectivePower1 = card.power + (card.bonusPower ?? 0);
          const { damage, effectiveness } = calculateDamage(
            effectivePower1,
            card.type,
            champion.currentType,
            enemy.currentType
          );
          
          let finalDamage = damage;
          if (enemy.isGuarding) {
            finalDamage = Math.floor(damage * GUARD_DAMAGE_REDUCTION);
            G.turnLog.push(`${getChampionDisplayName(enemy)} はガードしている！`);
          }
          // 装甲特性: 被ダメージを10軽減
          const enemyDef1 = getChampionById(enemy.definitionId);
          if (enemyDef1?.ability === 'steelArmor') {
            finalDamage = Math.max(1, finalDamage - 10);
            G.turnLog.push(`${getChampionDisplayName(enemy)} の装甲が発動！ダメージ軽減`);
          }
          
          enemy.currentHp -= finalDamage;
          
          G.damageEvents.push({
            id: `dmg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            targetId: enemy.id,
            amount: finalDamage,
            effectiveness: effectiveness || undefined,
            element: card.type,
            timestamp: Date.now(),
          });
          
          let logMsg = `${getChampionDisplayName(enemy)} に ${finalDamage} ダメージ`;
          if (effectiveness) logMsg += ` ${effectiveness}`;
          G.turnLog.push(logMsg);
          
          // 撃破処理
          if (enemy.currentHp <= 0) {
            enemy.pos = null;
            enemy.knockoutTurnsRemaining = KNOCKOUT_TURNS;
            enemy.currentHp = 0;
            G.scores[team] += KILL_POINTS;
            G.turnLog.push(`${getChampionDisplayName(enemy)} は撃破された！ +${KILL_POINTS}pt`);
          }
        }
        
        // 攻撃範囲を塗る
        paintTile(G, tx, ty, team);
      }
    }
    // 周囲1マス全体攻撃（ふみつけ等）の処理
    else if (card.isSurroundingAoE) {
      G.turnLog.push(`${championName} の ${card.nameJa}！`);
      
      // 8方向（周囲1マス）をすべて攻撃
      const surroundingDirs = [
        { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
        { dx: -1, dy: 0 },                      { dx: 1, dy: 0 },
        { dx: -1, dy: 1 },  { dx: 0, dy: 1 },  { dx: 1, dy: 1 },
      ];
      
      for (const dir of surroundingDirs) {
        const tx = champion.pos.x + dir.dx;
        const ty = champion.pos.y + dir.dy;
        
        // 盤面外チェック
        if (tx < 0 || tx >= BOARD_SIZE || ty < 0 || ty >= BOARD_SIZE) continue;
        
        // ブロックへのダメージ
        const block = G.blocks.find(b => b.x === tx && b.y === ty);
        if (block) {
          block.hp--;
          G.turnLog.push(`ブロックにヒット！ (残りHP: ${block.hp})`);
          if (block.hp <= 0) {
            G.blocks = G.blocks.filter(b => b !== block);
            G.turnLog.push(`ブロックが破壊された！`);
          }
        }
        
        // 敵チャンピオンへのダメージ
        const enemy = G.players[enemyTeam].champions.find(c => 
          c.pos !== null && c.pos.x === tx && c.pos.y === ty
        );
        if (enemy) {
          const effectivePower2 = card.power + (card.bonusPower ?? 0);
          const { damage, effectiveness } = calculateDamage(
            effectivePower2,
            card.type,
            champion.currentType,
            enemy.currentType
          );
          
          let finalDamage = damage;
          if (enemy.isGuarding) {
            finalDamage = Math.floor(damage * GUARD_DAMAGE_REDUCTION);
            G.turnLog.push(`${getChampionDisplayName(enemy)} はガードしている！`);
          }
          // 装甲特性: 被ダメージを10軽減
          const enemyDef2 = getChampionById(enemy.definitionId);
          if (enemyDef2?.ability === 'steelArmor') {
            finalDamage = Math.max(1, finalDamage - 10);
            G.turnLog.push(`${getChampionDisplayName(enemy)} の装甲が発動！ダメージ軽減`);
          }
          
          enemy.currentHp -= finalDamage;
          
          G.damageEvents.push({
            id: `dmg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            targetId: enemy.id,
            amount: finalDamage,
            effectiveness: effectiveness || undefined,
            element: card.type,
            timestamp: Date.now(),
          });
          
          let logMsg = `${getChampionDisplayName(enemy)} に ${finalDamage} ダメージ`;
          if (effectiveness) logMsg += ` ${effectiveness}`;
          G.turnLog.push(logMsg);
          
          // 撃破処理
          if (enemy.currentHp <= 0) {
            enemy.pos = null;
            enemy.knockoutTurnsRemaining = KNOCKOUT_TURNS;
            enemy.currentHp = 0;
            const bounty = enemy.isAwakened ? 5 : 0;
            G.scores[team] += KILL_POINTS + bounty;
            if (bounty > 0) {
              G.turnLog.push(`🎯 SHUTDOWN! ${getChampionDisplayName(enemy)} を討ち取った！ +${KILL_POINTS + bounty}pt`);
            } else {
              G.turnLog.push(`${getChampionDisplayName(enemy)} は撃破された！ +${KILL_POINTS}pt`);
            }
          }
        }
        
        // 攻撃範囲を塗る
        paintTile(G, tx, ty, team);
      }
    }
    // 通常の単体ターゲット攻撃
    else if (action.targetChampionId) {
      const target = G.players[enemyTeam].champions.find(c => c.id === action.targetChampionId);
      
      if (target && target.pos) {
        targetPos = target.pos; // ターゲットの位置を塗る座標とする
        
        const dist = getDistance(champion.pos, target.pos);
        
        if (dist <= attackRange) {
          const effectivePower3 = card.power + (card.bonusPower ?? 0);
          const { damage, effectiveness } = calculateDamage(
            effectivePower3,
            card.type,
            champion.currentType,
            target.currentType
          );
          
          let finalDamage = damage;
          if (target.isGuarding) {
            finalDamage = Math.floor(damage * GUARD_DAMAGE_REDUCTION);
            G.turnLog.push(`${getChampionDisplayName(target)} はガードしている！`);
          }
          
          // みずしゅりけん
          if (card.effectFn === 'multiHit') {
            const hits = 2 + Math.floor(random.Number() * 3);
            finalDamage = finalDamage * hits;
            G.turnLog.push(`${championName} の ${card.nameJa}！ ${hits}回ヒット！`);
          }
          
          // 装甲特性: 被ダメージを10軽減（みずしゅりけんは合計ダメージから軽減）
          const targetDef = getChampionById(target.definitionId);
          if (targetDef?.ability === 'steelArmor') {
            finalDamage = Math.max(1, finalDamage - 10);
            G.turnLog.push(`${getChampionDisplayName(target)} の装甲が発動！ダメージ軽減`);
          }
          
          target.currentHp -= finalDamage;
          
          // ダメージイベントを追加（アニメーション用）
          G.damageEvents.push({
            id: `dmg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            targetId: target.id,
            amount: finalDamage,
            effectiveness: effectiveness || undefined,
            element: card.type,
            timestamp: Date.now(),
          });
          
          let logMsg = `${championName} の ${card.nameJa}！ ${getChampionDisplayName(target)} に ${finalDamage} ダメージ`;
          if (effectiveness) logMsg += ` ${effectiveness}`;
          G.turnLog.push(logMsg);
          
          // 撃破処理（即時）- HPが0以下になったら即座に盤面から消す
          if (target.currentHp <= 0) {
             target.pos = null;
             target.knockoutTurnsRemaining = KNOCKOUT_TURNS;
             target.currentHp = 0;
             const bounty = target.isAwakened ? 5 : 0;
             G.scores[team] += KILL_POINTS + bounty;
             if (bounty > 0) {
               G.turnLog.push(`🎯 SHUTDOWN! ${getChampionDisplayName(target)} を讨ち取った！ +${KILL_POINTS + bounty}pt`);
             } else {
               G.turnLog.push(`${getChampionDisplayName(target)} は撃破された！ +${KILL_POINTS}pt`);
             }
          }

          // ノックバック（撃破されていない場合のみ）
          if (card.effectFn === 'knockback' && random.Number() < 0.3 && target.pos) {
            const dx = target.pos.x - champion.pos.x;
            const dy = target.pos.y - champion.pos.y;
            const newX = target.pos.x + (dx !== 0 ? Math.sign(dx) : 0);
            const newY = target.pos.y + (dy !== 0 ? Math.sign(dy) : 0);
            
            if (newX >= 0 && newX < BOARD_SIZE && newY >= 0 && newY < BOARD_SIZE) {
              target.pos = { x: newX, y: newY };
              G.turnLog.push(`${getChampionDisplayName(target)} は押し出された！`);
            }
          }
          
          // 反動
          if (card.effectFn === 'recoil') {
            const recoilDamage = Math.floor(finalDamage / 3);
            champion.currentHp -= recoilDamage;
            G.turnLog.push(`${championName} は反動で ${recoilDamage} ダメージを受けた`);
          }
          
          // 撃破処理は checkKnockouts で
        } else {
          G.turnLog.push(`${championName} の ${card.nameJa}！ しかし ${getChampionDisplayName(target)} に届かなかった...`);
        }
      }
    } else if (action.attackTargetPos) {
      // ブロックなどの位置自体をターゲットした場合
      const block = G.blocks.find(b => b.x === action.attackTargetPos!.x && b.y === action.attackTargetPos!.y);
      if (block) {
        targetPos = action.attackTargetPos;
        const dist = getDistance(champion.pos, targetPos);
        if (dist <= attackRange) {
          block.hp -= 1; // ブロックは固定1ダメージとする
          G.turnLog.push(`${championName} の ${card.nameJa}！ ブロックにヒット！ (残りHP: ${block.hp})`);
          if (block.hp <= 0) {
            G.blocks = G.blocks.filter(b => b !== block);
            G.turnLog.push(`ブロックが破壊された！`);
          }
        }
      }
    }
    
    // 攻撃によって床を塗る処理
    if (targetPos) {
       paintTile(G, targetPos.x, targetPos.y, team);
       // 範囲攻撃の場合は周囲も塗るなどの拡張が可能だが、一旦単体対象のみ
    }
    
    // タワーへの攻撃ロジックは削除
  }
  
  // 交代処理
  if (card.isSwap || card.effectFn === 'uturn') {
    let benchChampion: ChampionInstance | undefined;
    
    if (card.isSwap && action.targetChampionId) {
      // 指定されたベンチのチャンピオンと交代
      benchChampion = G.players[team].champions.find(c => c.id === action.targetChampionId);
      
      // バリデーション (念のため)
      if (benchChampion && (benchChampion.pos !== null || benchChampion.knockoutTurnsRemaining > 0)) {
        benchChampion = undefined; 
      }
    } 
    
    // ターゲット指定がない（とんぼがえり等、または自動選択フォールバック）場合
    if (!benchChampion) {
       benchChampion = G.players[team].champions.find(c => 
        c.pos === null && c.knockoutTurnsRemaining === 0
      );
    }
    
    if (benchChampion) {
      // 交代実行
      benchChampion.pos = { ...champion.pos };
      champion.pos = null;
      G.turnLog.push(`${championName} と ${getChampionDisplayName(benchChampion)} が交代した！`);
      
      // 交代後のユニットは行動済み扱いにはならない（次のフェイズで行動可能だが、
      // このターン中は行動できない。仕様次第だが、ここでは単に配置が変わるだけ）
    } else {
      G.turnLog.push(`${championName} は交代しようとしたが、控えがいなかった！`);
    }
  }
  
  // カードにCDをセット
  card.currentCooldown = card.cooldown;
}

// 方向優先順位（決定論的経路のため固定: 上→右→下→左）
const DIRECTIONS = [
  { dx: 0, dy: -1 },  // 上
  { dx: 1, dy: 0 },   // 右
  { dx: 0, dy: 1 },   // 下
  { dx: -1, dy: 0 },  // 左
];

// 障害物判定（チャンピオン・ブロックがあるマスは通過不可）
function isObstacle(G: GameState, x: number, y: number, movingChampionId?: string): boolean {
  // ブロック判定
  if (G.blocks.some(b => b.x === x && b.y === y)) {
    return true;
  }
  
  // チャンピオン判定（移動中のチャンピオン自身は除外）
  const allChampions = [...G.players['0'].champions, ...G.players['1'].champions];
  if (allChampions.some(c => 
    c.pos !== null && 
    c.pos.x === x && 
    c.pos.y === y && 
    c.id !== movingChampionId
  )) {
    return true;
  }
  
  return false;
}

/**
 * BFSで障害物を考慮した経路を計算
 * 到達可能なマスとその経路を返す
 * @param G ゲーム状態
 * @param start 開始位置
 * @param maxCost 最大移動コスト
 * @param team 移動するチームのID（自陣コスト0のため）
 * @param movingChampionId 移動するチャンピオンのID（障害物判定で除外）
 * @returns 到達可能な位置と経路のマップ
 */
export function findReachablePositionsWithPath(
  G: GameState,
  start: Position,
  maxCost: number,
  team: Team,
  movingChampionId?: string
): Map<string, { cost: number; path: Position[] }> {
  const result = new Map<string, { cost: number; path: Position[] }>();
  const posKey = (p: Position) => `${p.x},${p.y}`;
  
  // 開始位置
  result.set(posKey(start), { cost: 0, path: [start] });
  
  // BFSキュー: { pos, cost, path }
  const queue: { pos: Position; cost: number; path: Position[] }[] = [
    { pos: start, cost: 0, path: [start] }
  ];
  
  while (queue.length > 0) {
    // コスト順にソート（Dijkstra風、自陣コスト0のため）
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift()!;
    
    for (const dir of DIRECTIONS) {
      const nx = current.pos.x + dir.dx;
      const ny = current.pos.y + dir.dy;
      
      // 盤面外チェック
      if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) continue;
      
      // 障害物チェック（チャンピオン・ブロック）
      if (isObstacle(G, nx, ny, movingChampionId)) continue;
      
      // 移動コスト計算（自陣は0.5、それ以外は1）
      // 自陣は2マスで1移動距離を消費
      const tileCost = G.territory[ny][nx] === team ? 0.5 : 1;
      const newCost = current.cost + tileCost;
      
      // 最大コストを超えたらスキップ
      if (newCost > maxCost) continue;
      
      const key = posKey({ x: nx, y: ny });
      const existing = result.get(key);
      
      // より低いコストで到達できるか、まだ訪問していない場合
      if (!existing || existing.cost > newCost) {
        const newPath = [...current.path, { x: nx, y: ny }];
        result.set(key, { cost: newCost, path: newPath });
        queue.push({ pos: { x: nx, y: ny }, cost: newCost, path: newPath });
      }
    }
  }
  
  // 開始位置は除外（自分自身への移動は不要）
  result.delete(posKey(start));
  
  return result;
}

/**
 * 2点間の最短経路を計算（障害物考慮）
 * @returns 経路の配列、到達不能ならnull
 */
export function findPathBetween(
  G: GameState,
  start: Position,
  end: Position,
  team: Team,
  movingChampionId?: string,
  maxCost: number = Infinity
): Position[] | null {
  const reachable = findReachablePositionsWithPath(G, start, maxCost, team, movingChampionId);
  const key = `${end.x},${end.y}`;
  const result = reachable.get(key);
  return result ? result.path : null;
}

// ヘルパー関数: 移動コスト計算 (BFS)（障害物考慮）
function calculateMoveCost(G: GameState, start: Position, end: Position, team: Team, movingChampionId?: string): number {
  if (start.x === end.x && start.y === end.y) return 0;
  
  // 障害物を考慮した経路探索
  const reachable = findReachablePositionsWithPath(G, start, Infinity, team, movingChampionId);
  const key = `${end.x},${end.y}`;
  const result = reachable.get(key);
  
  return result ? result.cost : Infinity;
}

// ヘルパー関数: BFS経路を塗る
function paintPath(G: GameState, path: Position[], team: Team) {
  for (const pos of path) {
    paintTile(G, pos.x, pos.y, team);
  }
}

// 旧API互換（2点間を塗る場合、経路計算して塗る）
function paintPathBetween(G: GameState, start: Position, end: Position, team: Team, movingChampionId?: string) {
  const path = findPathBetween(G, start, end, team, movingChampionId);
  if (path) {
    paintPath(G, path, team);
  } else {
    // フォールバック: 経路が見つからない場合は終点のみ塗る
    paintTile(G, end.x, end.y, team);
  }
}

/**
 * 配置が必要かどうかをチェック
 * 場に3体未満のチームがあり、かつ配置可能なチャンピオン（ノックアウトされていない控え）がいる場合true
 */
function needsDeployPhase(G: GameState): boolean {
  for (const team of ['0', '1'] as Team[]) {
    const deployedCount = G.players[team].champions.filter(c => c.pos !== null).length;
    const canDeployMore = G.players[team].champions.some(c => 
      c.pos === null && c.knockoutTurnsRemaining === 0 && c.currentHp > 0
    );
    // 3体未満で、かつ配置可能なチャンピオンがいる
    if (deployedCount < CHAMPIONS_ON_FIELD && canDeployMore) {
      return true;
    }
  }
  return false;
}

/**
 * ランダムイベントの発生（フェイズ開始時）
 */
function triggerRandomEvent(G: GameState, random: any) {
  // イベント1: 商人の出現 (北側にスポーン)
  let spawned = false;
  let attempts = 0;
  
  while (!spawned && attempts < 50) {
    const x = 2 + Math.floor(random.Number() * 9); // x: 2〜10
    const y = 0 + Math.floor(random.Number() * 4); // y: 0〜3 (北側)
    
    // ブロック、中央エリア、既存の商人と被らないようにする
    if (!isAdminDomain(x, y) && 
        !G.blocks.some(b => b.x === x && b.y === y) && 
        !(G.merchant && G.merchant.x === x && G.merchant.y === y)) {
      
      G.merchant = {
        id: `merchant-${G.currentPhase}`,
        x,
        y
      };
      
      G.turnLog.push(`🌟 イベント発生！ 北の座標(${x}, ${y})に商人が出現した！`);
      spawned = true;
      break;
    }
    attempts++;
  }
}

/**
 * 解決フェーズ終了
 */
function finishResolutionPhase(G: GameState, random: any) {
  // 撃破チェック
  checkKnockouts(G);
  
  // ベンチ回復
  processBenchRecovery(G);
  
  // 撃破カウントダウン
  processKnockoutCountdown(G);
  
  // カードクールダウンをデクリメント
  tickCardCooldowns(G);
  
  // ★ 新ルール: 接続チェック - 3マス未満の連結成分を消去
  removeDisconnectedTerritories(G);
  
  // ★ 新ルール: ポイント獲得 - 陣地上のトークンを回収
  collectPointsFromTerritory(G);
  
  // ★ 新ルール: ロンゲストペイントボーナスのチェック
  checkLongestPaintBonus(G);
  
  // ★ 新ルール: 資源獲得 - サイコロを振って該当する資源ノードから資源を獲得
  processResourceNodes(G, random);
  
  // ★ 旧ルール削除: 囲い塗りは廃止
  // detectAndFillEnclosures(G, '0');
  // detectAndFillEnclosures(G, '1');
  // calculateScores(G);  // スコアはポイント獲得ベースに変更
  
  // スコアログ
  G.turnLog.push(`スコア - 青: ${G.scores['0']}pt, 赤: ${G.scores['1']}pt`);
  
  // ★ 新ルール: ポイントトークン生成
  spawnPointTokens(G, random);
  
  // ターン/フェイズ進行
  G.turnInPhase++;
  let isNewPhase = false;
  if (G.turnInPhase > TURNS_PER_PHASE) {
    G.turnInPhase = 1;
    G.currentPhase++;
    isNewPhase = true;
    G.turnLog.push(`=== フェイズ${G.currentPhase}開始 ===`);
    
    // イベント発生
    triggerRandomEvent(G, random);
  }
  
  // 状態リセット
  G.turnActions = { '0': { actions: [] }, '1': { actions: [] } };
  G.pendingActions = [];
  G.currentResolvingAction = null;
  G.awaitingTargetSelection = false;
  
  // ガード状態リセット
  for (const team of ['0', '1'] as Team[]) {
    for (const champion of G.players[team].champions) {
      champion.isGuarding = false;
    }
  }
  
  G.turnLog.push('--- ターン終了 ---');
  
  // 配置が必要なら配置フェーズ、そうでなければ計画フェーズ
  if (needsDeployPhase(G)) {
    G.gamePhase = 'deploy';
    G.deployTurn = '0';
    G.turnLog.push('--- 配置フェーズ開始 ---');
  } else {
    G.gamePhase = 'planning';
  }
}

/**
 * 撃破チェック（フォールバック処理）
 * - 通常の攻撃による撃破はresolveCardAction内で即時処理される
 * - この関数は反動ダメージ等で撃破された場合を拾うためのもの
 */
function checkKnockouts(G: GameState) {
  for (const team of ['0', '1'] as Team[]) {
    for (const champion of G.players[team].champions) {
      if (champion.currentHp <= 0 && champion.pos !== null) {
        champion.pos = null;
        champion.knockoutTurnsRemaining = KNOCKOUT_TURNS;
        champion.currentHp = 0;
        
        const enemyTeam = team === '0' ? '1' : '0';
        const bounty = champion.isAwakened ? 5 : 0;
        G.scores[enemyTeam] += KILL_POINTS + bounty;
        
        if (bounty > 0) {
          G.turnLog.push(`🎯 SHUTDOWN! ${getChampionDisplayName(champion)} は反動で倒れた！ +${KILL_POINTS + bounty}pt`);
        } else {
          G.turnLog.push(`${getChampionDisplayName(champion)} は反動で倒れた！ +${KILL_POINTS}pt`);
        }
      }
    }
  }
}

function processBenchRecovery(G: GameState) {
  for (const team of ['0', '1'] as Team[]) {
    for (const champion of G.players[team].champions) {
      if (champion.pos === null && champion.knockoutTurnsRemaining === 0 && champion.currentHp < champion.maxHp) {
        const recoveryAmount = Math.floor(champion.maxHp * BENCH_RECOVERY_PERCENT);
        champion.currentHp = Math.min(champion.currentHp + recoveryAmount, champion.maxHp);
      }
    }
  }
}

function processKnockoutCountdown(G: GameState) {
  for (const team of ['0', '1'] as Team[]) {
    for (const champion of G.players[team].champions) {
      if (champion.knockoutTurnsRemaining > 0) {
        champion.knockoutTurnsRemaining--;
        if (champion.knockoutTurnsRemaining === 0) {
          champion.currentHp = champion.maxHp;
        }
      }
    }
  }
}

/**
 * ターン終了時に全カードのCDを1デクリメント
 */
function tickCardCooldowns(G: GameState) {
  for (const team of ['0', '1'] as Team[]) {
    for (const champion of G.players[team].champions) {
      for (const card of champion.cards) {
        if (card.currentCooldown > 0) {
          card.currentCooldown--;
        }
      }
    }
  }
}

function getChampionDisplayName(champion: ChampionInstance): string {
  const def = getChampionById(champion.definitionId);
  const teamLabel = champion.team === '0' ? '青' : '赤';
  return `[${teamLabel}]${def?.nameJa || champion.definitionId}`;
}

function getTypeNameJa(type: string): string {
  const typeNames: Record<string, string> = {
    normal: 'ノーマル',
    fire: 'ほのお',
    water: 'みず',
    electric: 'でんき',
    grass: 'くさ',
    ice: 'こおり',
    fighting: 'かくとう',
    poison: 'どく',
    ground: 'じめん',
    flying: 'ひこう',
    psychic: 'エスパー',
    bug: 'むし',
    rock: 'いわ',
    ghost: 'ゴースト',
    dragon: 'ドラゴン',
    dark: 'あく',
    steel: 'はがね',
    fairy: 'フェアリー',
  };
  return typeNames[type] || type;
}
// trigger reload
