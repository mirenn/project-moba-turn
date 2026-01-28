import { ActivePlayers } from 'boardgame.io/core';
import { 
  GameState, 
  Tower, 
  Position, 
  Team, 
  ChampionInstance, 
  PlayerState, 
  CardAction,
  GuardAction,
  TurnAction,
  Card,
  PendingAction
} from './types';
import { ALL_CHAMPIONS, getChampionById } from './champions';
import { calculateDamage } from './typeChart';

const BOARD_SIZE = 9;
const TURNS_PER_PHASE = 4;
const KNOCKOUT_TURNS = 4;
const BENCH_RECOVERY_PERCENT = 0.15;
const GUARD_DAMAGE_REDUCTION = 1 / 3;
const CHAMPIONS_ON_FIELD = 3;

function createTower(id: string, team: Team, x: number, y: number): Tower {
  return {
    id,
    hp: 300,
    maxHp: 300,
    pos: { x, y },
    team,
  };
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

function getSpawnPositions(team: Team): Position[] {
  if (team === '0') {
    return [
      { x: 0, y: 6 },
      { x: 0, y: 7 },
      { x: 0, y: 8 },
      { x: 1, y: 7 },
      { x: 1, y: 8 },
    ];
  } else {
    return [
      { x: 8, y: 0 },
      { x: 8, y: 1 },
      { x: 8, y: 2 },
      { x: 7, y: 0 },
      { x: 7, y: 1 },
    ];
  }
}

function getInitialPositions(team: Team): Position[] {
  const spawns = getSpawnPositions(team);
  return spawns.slice(0, CHAMPIONS_ON_FIELD);
}

function initializePlayerState(team: Team, championIds: string[]): PlayerState {
  const initialPositions = getInitialPositions(team);
  
  const champions: ChampionInstance[] = championIds.map((defId, idx) => {
    const pos = idx < CHAMPIONS_ON_FIELD ? initialPositions[idx] : null;
    return createChampionInstance(defId, team, idx, pos);
  }).filter((c): c is ChampionInstance => c !== null);
  
  return {
    team,
    selectedChampionIds: championIds,
    champions,
  };
}

export const LoLBoardGame = {
  name: 'lol-board-game',

  setup: (): GameState => {
    const towers: Tower[] = [];

    towers.push(createTower('tower-0-1', '0', 0, 4));
    towers.push(createTower('tower-0-2', '0', 2, 6));
    towers.push(createTower('tower-0-3', '0', 4, 8));

    towers.push(createTower('tower-1-1', '1', 8, 4));
    towers.push(createTower('tower-1-2', '1', 6, 2));
    towers.push(createTower('tower-1-3', '1', 4, 0));

    const team0Champions = ['gekogekoga', 'enshishi', 'raichou', 'kidouba'];
    const team1Champions = ['kidouba', 'raichou', 'enshishi', 'gekogekoga'];

    const players: Record<Team, PlayerState> = {
      '0': initializePlayerState('0', team0Champions),
      '1': initializePlayerState('1', team1Champions),
    };

    return {
      players,
      towers,
      currentPhase: 1,
      turnInPhase: 1,
      turnActions: { 
        '0': { actions: [] }, 
        '1': { actions: [] } 
      },
      turnLog: ['ゲーム開始 - 9×9ボード', '【ルール】カード選択後、解決フェーズでターゲットを選びます'],
      gamePhase: 'planning',
      winner: null,
      pendingActions: [],
      currentResolvingAction: null,
      awaitingTargetSelection: false,
    };
  },

  moves: {
    // 計画フェーズ: カードを選択
    selectCard: (
      { G, playerID }: { G: GameState; playerID: string },
      championId: string,
      cardId: string
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
      if (G.turnActions['0'].actions.length < 2) return;
      
      // CPUの行動を自動選択
      autoSelectCPUActions(G, '1', random);
      
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
      targetChampionId?: string
    ) => {
      if (G.gamePhase !== 'resolution') return;
      if (!G.currentResolvingAction) return;
      if (!G.awaitingTargetSelection) return;
      
      const { action, team } = G.currentResolvingAction;
      
      // ガードの場合はターゲット不要
      if ('discardCardIds' in action) {
        resolveGuardAction(G, action, team);
      } else {
        // カードアクションを実行
        action.targetPos = targetPos;
        action.targetChampionId = targetChampionId;
        resolveCardAction(G, action, team, random);
      }
      
      G.awaitingTargetSelection = false;
      G.currentResolvingAction = null;
      
      // 次の行動へ
      processNextAction(G, random);
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
  },

  turn: {
    activePlayers: ActivePlayers.ALL,
    onBegin: ({ G }: { G: GameState }) => {
      G.turnActions = { '0': { actions: [] }, '1': { actions: [] } };
      G.gamePhase = 'planning';
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
    const team0Towers = G.towers.filter(t => t.team === '0').length;
    const team1Towers = G.towers.filter(t => t.team === '1').length;
    
    if (team0Towers === 0) return { winner: '1' };
    if (team1Towers === 0) return { winner: '0' };
    
    const allChampions = [...G.players['0'].champions, ...G.players['1'].champions];
    
    const team0ReachedBase = allChampions.some(c => 
      c.team === '0' && c.pos && c.pos.x === 8 && c.pos.y === 0
    );
    if (team0ReachedBase) return { winner: '0' };
    
    const team1ReachedBase = allChampions.some(c =>
      c.team === '1' && c.pos && c.pos.x === 0 && c.pos.y === 8
    );
    if (team1ReachedBase) return { winner: '1' };
    
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
  
  // ガードアクションは即時実行
  if ('discardCardIds' in action) {
    resolveGuardAction(G, action, team);
    G.currentResolvingAction = null;
    processNextAction(G, random);
    return;
  }
  
  // プレイヤーの行動: ターゲット選択待ち
  if (team === '0') {
    G.awaitingTargetSelection = true;
    const card = champion.hand.find(c => c.id === action.cardId);
    G.turnLog.push(`[あなたの番] ${getChampionDisplayName(champion)} の ${card?.nameJa || 'カード'} - ターゲットを選択してください`);
    return;
  }
  
  // CPUの行動: 自動ターゲット選択
  const card = champion.hand.find(c => c.id === action.cardId);
  if (card) {
    const { targetPos, targetChampionId } = autoSelectTarget(G, champion, card, team);
    action.targetPos = targetPos;
    action.targetChampionId = targetChampionId;
    resolveCardAction(G, action, team, random);
  }
  
  G.currentResolvingAction = null;
  processNextAction(G, random);
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
  
  // へんげんじざい特性
  if (championDef?.ability === 'protean' && card.type !== 'normal') {
    champion.currentType = card.type;
    G.turnLog.push(`${championName} は ${getTypeNameJa(card.type)} タイプに変化した！`);
  }
  
  const enemyTeam = team === '0' ? '1' : '0';
  
  // 移動処理
  if (card.move > 0 && action.targetPos) {
    const dist = getDistance(champion.pos, action.targetPos);
    if (dist <= card.move) {
      const allChampions = [...G.players['0'].champions, ...G.players['1'].champions];
      const isOccupied = allChampions.some(c => 
        c.id !== champion.id && c.pos?.x === action.targetPos!.x && c.pos?.y === action.targetPos!.y
      );
      const isTowerPos = G.towers.some(t => 
        t.pos.x === action.targetPos!.x && t.pos.y === action.targetPos!.y
      );
      
      if (!isOccupied && !isTowerPos) {
        champion.pos = action.targetPos;
        G.turnLog.push(`${championName} は (${action.targetPos.x}, ${action.targetPos.y}) に移動した`);
      }
    }
  }
  
  // 攻撃処理
  if (card.power > 0 && action.targetChampionId) {
    const target = G.players[enemyTeam].champions.find(c => c.id === action.targetChampionId);
    
    if (target && target.pos) {
      const dist = getDistance(champion.pos, target.pos);
      const attackRange = card.move > 0 ? 1 : 2;
      
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
        
        let logMsg = `${championName} の ${card.nameJa}！ ${getChampionDisplayName(target)} に ${finalDamage} ダメージ`;
        if (effectiveness) logMsg += ` ${effectiveness}`;
        G.turnLog.push(logMsg);
        
        // ノックバック
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
        
        // 撃破チェック
        if (target.currentHp <= 0) {
          target.pos = null;
          target.knockoutTurnsRemaining = KNOCKOUT_TURNS;
          target.currentHp = 0;
          G.turnLog.push(`${getChampionDisplayName(target)} は撃破された！`);
        }
      } else {
        G.turnLog.push(`${championName} の ${card.nameJa}！ しかし届かなかった...`);
      }
    }
  }
  
  // 交代処理
  if (card.isSwap || card.effectFn === 'uturn') {
    const benchChampion = G.players[team].champions.find(c => 
      c.pos === null && c.knockoutTurnsRemaining === 0
    );
    
    if (benchChampion) {
      benchChampion.pos = { ...champion.pos };
      champion.pos = null;
      G.turnLog.push(`${championName} と ${getChampionDisplayName(benchChampion)} が交代した！`);
    }
  }
  
  // カードを消費
  champion.hand = champion.hand.filter(c => c.id !== card.id);
  champion.usedCards.push(card);
}

/**
 * CPUのターゲット自動選択
 */
function autoSelectTarget(
  G: GameState,
  champion: ChampionInstance,
  card: Card,
  team: Team
): { targetPos?: Position; targetChampionId?: string } {
  const enemyTeam = team === '0' ? '1' : '0';
  const enemies = G.players[enemyTeam].champions.filter(c => c.pos !== null);
  
  // 最も近い敵を見つける
  let closestEnemy: ChampionInstance | null = null;
  let closestDist = Infinity;
  
  if (champion.pos) {
    for (const enemy of enemies) {
      if (!enemy.pos) continue;
      const dist = getDistance(champion.pos, enemy.pos);
      if (dist < closestDist) {
        closestDist = dist;
        closestEnemy = enemy;
      }
    }
  }
  
  let targetPos: Position | undefined;
  let targetChampionId: string | undefined;
  
  // 移動先を決定
  if (card.move > 0 && champion.pos) {
    if (closestEnemy?.pos) {
      targetPos = getMoveTowardsTarget(champion.pos, closestEnemy.pos, card.move, G, champion.id);
    } else {
      const enemyBase = team === '0' ? { x: 8, y: 0 } : { x: 0, y: 8 };
      targetPos = getMoveTowardsTarget(champion.pos, enemyBase, card.move, G, champion.id);
    }
  }
  
  // 攻撃対象を決定
  if (card.power > 0 && closestEnemy) {
    targetChampionId = closestEnemy.id;
  }
  
  return { targetPos, targetChampionId };
}

/**
 * 目標に向かって移動する位置を計算
 */
function getMoveTowardsTarget(
  from: Position, 
  to: Position, 
  maxMove: number,
  G: GameState,
  selfId: string
): Position {
  const allChampions = [...G.players['0'].champions, ...G.players['1'].champions];
  
  let bestPos = from;
  let bestDist = getDistance(from, to);
  
  for (let mx = -maxMove; mx <= maxMove; mx++) {
    for (let my = -maxMove; my <= maxMove; my++) {
      if (Math.abs(mx) + Math.abs(my) > maxMove) continue;
      if (mx === 0 && my === 0) continue;
      
      const newX = from.x + mx;
      const newY = from.y + my;
      
      if (newX < 0 || newX >= BOARD_SIZE || newY < 0 || newY >= BOARD_SIZE) continue;
      
      const isOccupied = allChampions.some(c => 
        c.id !== selfId && c.pos?.x === newX && c.pos?.y === newY
      );
      const isTowerPos = G.towers.some(t => t.pos.x === newX && t.pos.y === newY);
      
      if (isOccupied || isTowerPos) continue;
      
      const distToTarget = getDistance({ x: newX, y: newY }, to);
      if (distToTarget < bestDist) {
        bestDist = distToTarget;
        bestPos = { x: newX, y: newY };
      }
    }
  }
  
  return bestPos;
}

/**
 * 解決フェーズ終了
 */
function finishResolutionPhase(G: GameState, random: any) {
  // タワー攻撃
  resolveTowerAttacks(G);
  
  // 撃破チェック
  checkKnockouts(G);
  
  // ベンチ回復
  processBenchRecovery(G);
  
  // 撃破カウントダウン
  processKnockoutCountdown(G);
  
  // ターン/フェイズ進行
  G.turnInPhase++;
  if (G.turnInPhase > TURNS_PER_PHASE) {
    G.turnInPhase = 1;
    G.currentPhase++;
    refillCards(G);
    G.turnLog.push(`=== フェイズ${G.currentPhase}開始 ===`);
  }
  
  // 計画フェーズに戻る
  G.gamePhase = 'planning';
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
}

function resolveTowerAttacks(G: GameState) {
  const TOWER_ATTACK = 40;
  const TOWER_RANGE = 2;
  
  for (const tower of G.towers) {
    const enemyTeam = tower.team === '0' ? '1' : '0';
    const enemies = G.players[enemyTeam].champions.filter(c => c.pos !== null);
    
    let target: ChampionInstance | null = null;
    let minDist = Infinity;
    
    for (const enemy of enemies) {
      if (!enemy.pos) continue;
      const dist = getDistance(tower.pos, enemy.pos);
      if (dist <= TOWER_RANGE && dist < minDist) {
        minDist = dist;
        target = enemy;
      }
    }
    
    if (target) {
      let damage = TOWER_ATTACK;
      if (target.isGuarding) {
        damage = Math.floor(damage * GUARD_DAMAGE_REDUCTION);
      }
      target.currentHp -= damage;
      G.turnLog.push(`タワー(${tower.id}) が ${getChampionDisplayName(target)} に ${damage} ダメージ`);
    }
  }
}

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
  
  const destroyedTowers = G.towers.filter(t => t.hp <= 0);
  for (const tower of destroyedTowers) {
    G.turnLog.push(`タワー(${tower.id}) が破壊された！`);
  }
  G.towers = G.towers.filter(t => t.hp > 0);
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

function autoSelectCPUActions(G: GameState, cpuTeam: Team, random: any) {
  const playerState = G.players[cpuTeam];
  const currentActions = G.turnActions[cpuTeam].actions;
  
  if (currentActions.length >= 2) return;
  
  const actingChampionIds = currentActions.map(a => a.championId);
  const availableChampions = playerState.champions.filter(
    c => c.pos !== null && !actingChampionIds.includes(c.id) && c.hand.length > 0
  );
  
  const actionsNeeded = 2 - currentActions.length;
  
  for (let i = 0; i < actionsNeeded && i < availableChampions.length; i++) {
    const champion = availableChampions[i];
    
    const attackCards = champion.hand.filter(c => c.power > 0 && !c.isSwap);
    const moveCards = champion.hand.filter(c => c.move > 0 && !c.isSwap);
    const otherCards = champion.hand.filter(c => !c.isSwap);
    
    let selectedCard;
    
    if (attackCards.length > 0 && random.Number() < 0.5) {
      selectedCard = attackCards[Math.floor(random.Number() * attackCards.length)];
    } else if (moveCards.length > 0 && random.Number() < 0.3) {
      selectedCard = moveCards[Math.floor(random.Number() * moveCards.length)];
    } else if (otherCards.length > 0) {
      selectedCard = otherCards[Math.floor(random.Number() * otherCards.length)];
    } else {
      selectedCard = champion.hand[0];
    }
    
    if (selectedCard) {
      const action: CardAction = {
        championId: champion.id,
        cardId: selectedCard.id,
      };
      G.turnActions[cpuTeam].actions.push(action);
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
