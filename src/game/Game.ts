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
  Block
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

// 初期ブロック配置定義
const INITIAL_BLOCKS: Omit<Block, 'hp'>[] = [
  // 脆いブロック (HP1) - 四隅付近
  { x: 3, y: 1, maxHp: 1 },
  { x: 9, y: 1, maxHp: 1 },
  { x: 1, y: 3, maxHp: 1 },
  { x: 11, y: 3, maxHp: 1 },
  { x: 1, y: 9, maxHp: 1 },
  { x: 11, y: 9, maxHp: 1 },
  { x: 3, y: 11, maxHp: 1 },
  { x: 9, y: 11, maxHp: 1 },
  // 硬いブロック (HP2) - 中央エリア周辺
  { x: 4, y: 3, maxHp: 2 },
  { x: 8, y: 3, maxHp: 2 },
  { x: 4, y: 9, maxHp: 2 },
  { x: 8, y: 9, maxHp: 2 },
];

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
    }
  }
  
  // 獲得したトークンを削除
  G.pointTokens = G.pointTokens.filter(t => !collectedTokens.includes(t));
}

function getDistance(p1: Position, p2: Position): number {
  return Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
}

function createChampionInstance(
  definitionId: string, 
  team: Team, 
  instanceIndex: number,
  initialPos: Position | null
): ChampionInstance | null {
  const definition = getChampionById(definitionId);
  if (!definition) return null;
  
  return {
    id: `${team}-${definitionId}-${instanceIndex}`,
    definitionId,
    team,
    currentHp: definition.hp,
    maxHp: definition.hp,
    currentType: definition.type,
    pos: initialPos,
    hand: [...definition.cards],
    usedCards: [],
    isGuarding: false,
    knockoutTurnsRemaining: 0,
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
  };
}

/**
 * CPUの自動配置（新AI使用）
 * 勝利マスに近い位置を優先して配置
 */
function autoCPUDeploy(G: GameState): void {
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
    // 計画フェーズ: カードを選択
    selectCard: (
      { G, playerID }: { G: GameState; playerID: string },
      championId: string,
      cardId: string,
      isAlternativeMove?: boolean
    ) => {
      if (G.gamePhase !== 'planning') return;
      
      const team = playerID as Team;
      const playerState = G.players[team];
      
      const champion = playerState.champions.find(c => c.id === championId);
      if (!champion || champion.pos === null) return;
      
      const card = champion.hand.find(c => c.id === cardId);
      if (!card) return;
      
      const currentActions = G.turnActions[team].actions;
      if (currentActions.length >= 2) return;
      
      const alreadyActing = currentActions.some(a => a.championId === championId);
      if (alreadyActing) return;
      
      const action: CardAction = {
        championId,
        cardId,
        isAlternativeMove: isAlternativeMove || false,
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
      
      const card1 = champion.hand.find(c => c.id === discardCardIds[0]);
      const card2 = champion.hand.find(c => c.id === discardCardIds[1]);
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
            const card = champion.hand.find(c => c.id === action.cardId);
            priority = card?.priority || 0;
          }
          
          allActions.push({
            action,
            team,
            priority,
            championId: action.championId,
          });
        }
      }
      
      // 優先度の高い順にソート
      allActions.sort((a, b) => b.priority - a.priority);
      
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
      targetTowerId?: string,
      skipAttack?: boolean,
      attackDirection?: Position
    ) => {
      if (G.gamePhase !== 'resolution') return;
      if (!G.currentResolvingAction) return;
      if (!G.awaitingTargetSelection) return;
      
      const { action, team } = G.currentResolvingAction;
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
      if (targetTowerId) cardAction.targetTowerId = targetTowerId;
      if (attackDirection) cardAction.attackDirection = attackDirection;

      // 代替アクション以外でカード情報を取得
      const card = !cardAction.isAlternativeMove 
        ? champion.hand.find(c => c.id === cardAction.cardId) 
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
          if (cardAction.targetChampionId || cardAction.targetTowerId) {
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
              
              if (hasEnemyChampion) {
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
      const champion = G.players[team].champions.find(c => c.id === action.championId);
      
      if (champion && !('discardCardIds' in action)) {
        const card = champion.hand.find(c => c.id === action.cardId);
        if (card) {
          G.turnLog.push(`${getChampionDisplayName(champion)} は ${card.nameJa} の使用をスキップした`);
          // カードは消費される
          champion.hand = champion.hand.filter(c => c.id !== card.id);
          champion.usedCards.push(card);
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

    return {
      players,
      territory,
      scores: { '0': 0, '1': 0 },
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
      cpuActionDelay: 0,
      homeSquares: { '0': [], '1': [] },
      blocks: INITIAL_BLOCKS.map(b => ({ ...b, hp: b.maxHp })),
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
    const card = champion.hand.find(c => c.id === action.cardId);
    G.turnLog.push(`[あなたの番] ${getChampionDisplayName(champion)} の ${card?.nameJa || 'カード'} - ターゲットを選択してください`);
    return;
  }
  
  // CPUの行動: ディレイ表示のためにここで一旦停止
  // ターゲットを事前に決定してアクションに設定
  const card = champion.hand.find(c => c.id === action.cardId);
  if (card) {
    const { targetPos, targetChampionId, targetTowerId } = selectCPUTarget(
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
  champion.hand = champion.hand.filter(c => 
    c.id !== action.discardCardIds[0] && c.id !== action.discardCardIds[1]
  );
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
  
  const card = champion.hand.find(c => c.id === action.cardId);
  if (!card) return;
  
  const championDef = getChampionById(champion.definitionId);
  const championName = getChampionDisplayName(champion);
  
  const enemyTeam = team === '0' ? '1' : '0';
  
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
          champion.pos = action.targetPos;
          paintTile(G, action.targetPos.x, action.targetPos.y, team);
          G.turnLog.push(`${championName} は (${action.targetPos.x}, ${action.targetPos.y}) に移動した（代替アクション）`);
        }
      }
    }
    // カードを消費
    champion.hand = champion.hand.filter(c => c.id !== card.id);
    champion.usedCards.push(card);
    return;
  }
  
  // へんげんじざい特性
  if (championDef?.ability === 'protean' && card.type !== 'normal') {
    champion.currentType = card.type;
    G.turnLog.push(`${championName} は ${getTypeNameJa(card.type)} タイプに変化した！`);
  }
  
  // 移動処理
  if (card.move > 0 && action.targetPos) {
    const dist = getDistance(champion.pos, action.targetPos);
    
    // 自陣（自チームの色のマス）を通る場合、コスト0として扱うロジックが必要
    // ここでは簡易的に「マンハッタン距離 - 自陣マスの数 <= move」や
    // 「経路探索」が必要になるが、一旦は単純な距離判定 + 
    // 「現在地が自陣ならコスト減少」等の簡易計算、あるいは「自陣ワープ」の実装とする
    // 
    // ユーザー要望 A: "カードの移動距離内で、自陣マスは移動距離を消費しない"
    // これを実現するには経路探索(BFS/Dijkstra)が必要。
    
    // 簡易実装: 最短経路上のコストを概算
    // 本格的な経路探索は計算が重くなる可能性があるが、盤面が13x13なのでBFSで十分可能
    
    const moveCost = calculateMoveCost(G, champion.pos, action.targetPos, team);
    
    if (moveCost <= card.move) {
      const allChampions = [...G.players['0'].champions, ...G.players['1'].champions];
      const isOccupied = allChampions.some(c => 
        c.id !== champion.id && c.pos?.x === action.targetPos!.x && c.pos?.y === action.targetPos!.y
      );
      
      if (!isOccupied) {
        // 移動経路を塗る（簡易的に移動先と移動元を結ぶ直線を塗る、あるいはBFS経路）
        // ここでは「移動により通過したとみなされるマス」を塗るべきだが、
        // ワープ的な移動でなければ「移動先」を塗る
        
        const oldPos = { ...champion.pos };
        champion.pos = action.targetPos;
        G.turnLog.push(`${championName} は (${action.targetPos.x}, ${action.targetPos.y}) に移動した`);
        
        // 移動先を塗る
        paintTile(G, action.targetPos.x, action.targetPos.y, team);
        
        // 移動経路塗り（始点と終点の間も塗る必要がある場合）
        // ユーザー要望: "移動ルートに「ライン」を生成"
        // 直線補間で塗る
        paintPath(G, oldPos, action.targetPos, team);
      }
    }
  }
  
  // 勝利が確定している場合は攻撃処理をスキップ
  if (G.winner) {
    champion.hand = champion.hand.filter(c => c.id !== card.id);
    champion.usedCards.push(card);
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
          const { damage, effectiveness } = calculateDamage(
            card.power,
            card.type,
            champion.currentType,
            enemy.currentType
          );
          
          let finalDamage = damage;
          if (enemy.isGuarding) {
            finalDamage = Math.floor(damage * GUARD_DAMAGE_REDUCTION);
            G.turnLog.push(`${getChampionDisplayName(enemy)} はガードしている！`);
          }
          
          enemy.currentHp -= finalDamage;
          
          G.damageEvents.push({
            id: `dmg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            targetId: enemy.id,
            amount: finalDamage,
            effectiveness: effectiveness || undefined,
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
    // 通常の単体ターゲット攻撃
    else if (action.targetChampionId) {
      const target = G.players[enemyTeam].champions.find(c => c.id === action.targetChampionId);
      
      if (target && target.pos) {
        targetPos = target.pos; // ターゲットの位置を塗る座標とする
        
        const dist = getDistance(champion.pos, target.pos);
        
        if (dist <= attackRange) {
          const { damage, effectiveness } = calculateDamage(
            card.power,
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
          
          target.currentHp -= finalDamage;
          
          // ダメージイベントを追加（アニメーション用）
          G.damageEvents.push({
            id: `dmg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            targetId: target.id,
            amount: finalDamage,
            effectiveness: effectiveness || undefined,
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
             G.scores[team] += KILL_POINTS;
             G.turnLog.push(`${getChampionDisplayName(target)} は撃破された！ +${KILL_POINTS}pt`);
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
  
  // カードを消費
  champion.hand = champion.hand.filter(c => c.id !== card.id);
  champion.usedCards.push(card);
}

// ヘルパー関数: 移動コスト計算 (BFS)
function calculateMoveCost(G: GameState, start: Position, end: Position, team: Team): number {
  if (start.x === end.x && start.y === end.y) return 0;

  const size = BOARD_SIZE;
  const visited = Array(size).fill(null).map(() => Array(size).fill(false));
  const queue: { pos: Position; cost: number }[] = [{ pos: start, cost: 0 }];
  visited[start.y][start.x] = true;

  const directions = [
    { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
    { dx: -1, dy: 0 }, { dx: 1, dy: 0 }
  ];

  while (queue.length > 0) {
    // コストが小さい順に処理したいが、単純なキューでも距離順になるのでOK
    // ただしコスト重みが異なる（0と1）ので、本当はDijkstraかDequeが必要。
    // 今回は簡易的に「コスト0マスの移動」を優先的に探索するように配列操作するか、
    // あるいは単純に全探索して最小コストを見つける
    
    // 簡易実装: 配列をソートする（効率は悪いが盤面が小さいのでOK）
    queue.sort((a, b) => a.cost - b.cost);
    const { pos, cost } = queue.shift()!;

    if (pos.x === end.x && pos.y === end.y) return cost;

    for (const dir of directions) {
      const nx = pos.x + dir.dx;
      const ny = pos.y + dir.dy;

      if (nx >= 0 && nx < size && ny >= 0 && ny < size && !visited[ny][nx]) {
        // 壁（他ユニット）判定はここでは行わない（すり抜け不可ルールは別途あるが、コスト計算としては最短パスを探す）
        // ただし敵ユニットがいるマスは通れないとするのが一般的
        // ここでは「移動力チェック」用なので、障害物は無視して地形コストのみ見る
        
        visited[ny][nx] = true;
        
        // 自陣ならコスト0、それ以外は1
        const tileCost = G.territory[ny][nx] === team ? 0 : 1;
        queue.push({ pos: { x: nx, y: ny }, cost: cost + tileCost });
      }
    }
  }
  
  return Infinity; // 到達不能
}

// ヘルパー関数: 経路塗り (Bresenham's line algorithm or simple interpolation)
function paintPath(G: GameState, start: Position, end: Position, team: Team) {
  let x0 = start.x;
  let y0 = start.y;
  const x1 = end.x;
  const y1 = end.y;

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = (x0 < x1) ? 1 : -1;
  const sy = (y0 < y1) ? 1 : -1;
  let err = dx - dy;

  while(true) {
    paintTile(G, x0, y0, team);
    if ((x0 === x1) && (y0 === y1)) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
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
 * 解決フェーズ終了
 */
function finishResolutionPhase(G: GameState, random: any) {
  // 撃破チェック
  checkKnockouts(G);
  
  // ベンチ回復
  processBenchRecovery(G);
  
  // 撃破カウントダウン
  processKnockoutCountdown(G);
  
  // ★ 新ルール: 接続チェック - 3マス未満の連結成分を消去
  removeDisconnectedTerritories(G);
  
  // ★ 新ルール: ポイント獲得 - 陣地上のトークンを回収
  collectPointsFromTerritory(G);
  
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
    refillCards(G);
    G.turnLog.push(`=== フェイズ${G.currentPhase}開始 ===`);
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
  
  // 4ターンに1回（フェーズ開始時）のみ配置フェーズに移行
  // ただし、配置が必要な場合（3体未満のチームがある場合）のみ
  if (isNewPhase && needsDeployPhase(G)) {
    G.gamePhase = 'deploy';
    G.deployTurn = '0'; // 青チームから開始
    G.turnLog.push('--- 配置フェーズ開始 ---');
  } else {
    // 配置不要なら計画フェーズへ
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
        G.turnLog.push(`${getChampionDisplayName(champion)} は撃破された！`);
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

function refillCards(G: GameState) {
  for (const team of ['0', '1'] as Team[]) {
    for (const champion of G.players[team].champions) {
      const definition = getChampionById(champion.definitionId);
      if (definition) {
        champion.hand = [...definition.cards];
        champion.usedCards = [];
      }
    }
  }
  G.turnLog.push('全チャンピオンのカードが補充された');
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
