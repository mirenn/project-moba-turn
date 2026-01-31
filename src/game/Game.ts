import { ActivePlayers, TurnOrder } from 'boardgame.io/core';
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
  PendingAction,
  ElementType
} from './types';
import { ALL_CHAMPIONS, getChampionById } from './champions';
import { calculateDamage } from './typeChart';
import { selectCPUActions, selectCPUTarget, selectCPUDeployPosition } from './cpuAI';

const BOARD_SIZE = 9;
const TURNS_PER_PHASE = 4;
const KNOCKOUT_TURNS = 4;
const BENCH_RECOVERY_PERCENT = 0.15;
const GUARD_DAMAGE_REDUCTION = 1 / 3;
const CHAMPIONS_ON_FIELD = 3;

// 勝利マス（タワーの後ろ）の定義
// 各チームの勝利マスは敵タワーの後ろに位置する
// タワーが破壊されるまで勝利判定は発動しない
function getVictorySquaresForTeam(team: Team): { pos: Position; behindTowerId: string }[] {
  // team '0' は右側（Team 1）のタワーの後ろを目指す
  // team '1' は左側（Team 0）のタワーの後ろを目指す
  if (team === '0') {
    return [
      { pos: { x: 8, y: 4 }, behindTowerId: 'tower-1-1' },  // (7,4)の後ろ
      { pos: { x: 7, y: 2 }, behindTowerId: 'tower-1-2' },  // (6,2)の後ろ
      { pos: { x: 7, y: 6 }, behindTowerId: 'tower-1-3' },  // (6,6)の後ろ
    ];
  } else {
    return [
      { pos: { x: 0, y: 4 }, behindTowerId: 'tower-0-1' },  // (1,4)の後ろ
      { pos: { x: 1, y: 2 }, behindTowerId: 'tower-0-2' },  // (2,2)の後ろ
      { pos: { x: 1, y: 6 }, behindTowerId: 'tower-0-3' },  // (2,6)の後ろ
    ];
  }
}

// 勝利マスの位置リスト（タワー破壊状況は考慮しない）
function getVictorySquares(team: Team): Position[] {
  return getVictorySquaresForTeam(team).map(vs => vs.pos);
}

// 指定位置が勝利マスかどうかをチェック（タワー破壊済みの場合のみtrue）
function isVictorySquare(pos: Position, forTeam: Team, towers: Tower[]): boolean {
  const victorySquares = getVictorySquaresForTeam(forTeam);
  for (const vs of victorySquares) {
    if (vs.pos.x === pos.x && vs.pos.y === pos.y) {
      // 対応するタワーが破壊されているかチェック
      const towerExists = towers.some(t => t.id === vs.behindTowerId);
      return !towerExists; // タワーが存在しなければ勝利マスとして有効
    }
  }
  return false;
}

// 自陣の勝利マス（敵が目指すマス）かどうかをチェック
function isOwnVictorySquare(pos: Position, team: Team): boolean {
  const enemyTeam = team === '0' ? '1' : '0';
  const enemyVictorySquares = getVictorySquares(enemyTeam);
  return enemyVictorySquares.some(vs => vs.x === pos.x && vs.y === pos.y);
}

function createTower(id: string, team: Team, x: number, y: number, type: ElementType): Tower {
  return {
    id,
    hp: 150,
    maxHp: 150,
    pos: { x, y },
    team,
    type,
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

export function getSpawnPositions(team: Team): Position[] {
  // タワー周辺のスポーン可能マスを定義（左右配置）
  // タワー位置:
  // Team 0 (左側): (1,4), (2,2), (2,6)
  // Team 1 (右側): (7,4), (6,2), (6,6)
  
  if (team === '0') {
    // 青チーム: 左側のタワー周辺
    return [
      // around (1,4)
      { x: 0, y: 3 }, { x: 0, y: 4 }, { x: 0, y: 5 }, { x: 1, y: 3 }, { x: 1, y: 5 }, { x: 2, y: 4 },
      // around (2,2)
      { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 1 }, { x: 3, y: 2 }, { x: 2, y: 3 },
      // around (2,6)
      { x: 1, y: 6 }, { x: 1, y: 7 }, { x: 2, y: 5 }, { x: 2, y: 7 }, { x: 3, y: 6 },
    ];
  } else {
    // 赤チーム: 右側のタワー周辺
    return [
      // around (7,4)
      { x: 8, y: 3 }, { x: 8, y: 4 }, { x: 8, y: 5 }, { x: 7, y: 3 }, { x: 7, y: 5 }, { x: 6, y: 4 },
      // around (6,2)
      { x: 7, y: 1 }, { x: 7, y: 2 }, { x: 6, y: 1 }, { x: 5, y: 2 }, { x: 6, y: 3 },
      // around (6,6)
      { x: 7, y: 6 }, { x: 7, y: 7 }, { x: 6, y: 5 }, { x: 6, y: 7 }, { x: 5, y: 6 },
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
  
  // まだ配置されていないチャンピオン（ノックアウトされていない）
  const undeployedChampion = cpuPlayer.champions.find(c => 
    c.pos === null && c.knockoutTurnsRemaining === 0
  );
  
  if (!undeployedChampion) return; // 配置可能なチャンピオンがいない
  
  // 既にフィールドに3体いる場合は配置しない
  const deployedCount = cpuPlayer.champions.filter(c => c.pos !== null).length;
  if (deployedCount >= 3) return;
  
  // 新AIを使って最適な配置位置を選択
  const bestPos = selectCPUDeployPosition(G, undeployedChampion, cpuTeam);
  
  if (bestPos) {
    undeployedChampion.pos = { x: bestPos.x, y: bestPos.y };
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
      skipAttack?: boolean
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

      // 代替アクション以外でカード情報を取得
      const card = !cardAction.isAlternativeMove 
        ? champion.hand.find(c => c.id === cardAction.cardId) 
        : null;

      // 解決の可否を判定
      let readyToResolve = true;

      // 1. 代替アクションの場合：移動先が必須
      if (cardAction.isAlternativeMove) {
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
              const attackRange = card.move > 0 ? 1 : 2;
              const enemyTeam = team === '0' ? '1' : '0';
              
              // 敵チャンピオンチェック
              const hasEnemyChampion = G.players[enemyTeam].champions.some(c => 
                c.pos !== null && getDistance(effectivePos, c.pos) <= attackRange
              );
              
              // 敵タワーチェック
              const hasEnemyTower = G.towers.some(t => 
                t.team === enemyTeam && getDistance(effectivePos, t.pos) <= attackRange
              );
              
              if (hasEnemyChampion || hasEnemyTower) {
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
      if (G.gamePhase !== 'resolution') return;
      if (!G.cpuActionDelay) return;
      if (!G.currentResolvingAction) return;
      
      const { action, team } = G.currentResolvingAction;
      
      // ガードアクションの場合
      if ('discardCardIds' in action) {
        resolveGuardAction(G, action, team);
      } else {
        // カードアクションの場合（ターゲットは既に設定済み）
        resolveCardAction(G, action, team, random);
      }
      
      G.cpuActionDelay = false;
      G.currentResolvingAction = null;
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
      
      const champion = player.champions.find(c => c.id === championId);
      if (!champion) return;
      if (champion.pos !== null) return; // 既に配置済み
      
      // 配置位置の妥当性チェック
      // 1. 他のユニットがいないか
      const allChampions = [...G.players['0'].champions, ...G.players['1'].champions];
      if (allChampions.some(c => c.pos?.x === x && c.pos?.y === y) || 
          G.towers.some(t => t.pos.x === x && t.pos.y === y)) {
        return; // 重なっている
      }
      
      // 2. スポーン可能エリアか (簡易チェック: getSpawnPositionsに含まれるか)
      // より厳密には「自軍タワーの周囲1マス」
      const spawnable = getSpawnPositions(team);
      if (!spawnable.some(p => p.x === x && p.y === y)) {
        return; // エリア外
      }
      
      // 配置実行
      champion.pos = { x, y };
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
      
      events.endTurn({ next: G.deployTurn });
    },
};

export const LoLBoardGame = {
  name: 'lol-board-game',

  setup: ({ random }: { random: any }): GameState => {
    const towers: Tower[] = [];
    
    // タイプをランダムに決定するヘルパー
    const getRandomType = () => ELEMENT_TYPES[Math.floor(random.Number() * ELEMENT_TYPES.length)];

    towers.push(createTower('tower-0-1', '0', 1, 4, getRandomType())); // 中央
    towers.push(createTower('tower-0-2', '0', 2, 2, getRandomType())); // 上側
    towers.push(createTower('tower-0-3', '0', 2, 6, getRandomType())); // 下側

    towers.push(createTower('tower-1-1', '1', 7, 4, getRandomType())); // 中央
    towers.push(createTower('tower-1-2', '1', 6, 2, getRandomType())); // 上側
    towers.push(createTower('tower-1-3', '1', 6, 6, getRandomType())); // 下側

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
      turnLog: ['ゲーム開始 - 9×9ボード', '【ルール】まずはチャンピオンを配置してください'],
      gamePhase: 'deploy',
      deployTurn: '0',
      winner: null,
      pendingActions: [],
      currentResolvingAction: null,
      awaitingTargetSelection: false,
      damageEvents: [],
      cpuActionDelay: false,
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
        const team0Ready = team0Deployed >= 3 || G.players['0'].champions.every(c => c.pos !== null || c.knockoutTurnsRemaining > 0);
        const team1Ready = team1Deployed >= 3 || G.players['1'].champions.every(c => c.pos !== null || c.knockoutTurnsRemaining > 0);
        
        return team0Ready && team1Ready;
      },
      onEnd: ({ G }: { G: GameState }) => {
        G.gamePhase = 'planning';
        G.turnLog.push('--- 配置完了: 計画フェーズ開始 ---');
      }
    },
    main: {
      moves: {
        ...commonMoves
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
    
    // タワー全滅による勝利（フォールバック）
    const team0Towers = G.towers.filter(t => t.team === '0').length;
    const team1Towers = G.towers.filter(t => t.team === '1').length;
    
    if (team0Towers === 0) return { winner: '1' };
    if (team1Towers === 0) return { winner: '0' };
    
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
      G.cpuActionDelay = true;
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
    const { targetPos, targetChampionId, targetTowerId } = selectCPUTarget(G, champion, card, team);
    action.targetPos = targetPos;
    action.targetChampionId = targetChampionId;
    action.targetTowerId = targetTowerId;
  }
  
  // CPUアクションディレイを設定（UIが続行を呼ぶまで待機）
  G.cpuActionDelay = true;
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
  
  // 代替アクション: 1マス移動のみ（上下左右）
  if (action.isAlternativeMove) {
    if (action.targetPos) {
      const dx = action.targetPos.x - champion.pos.x;
      const dy = action.targetPos.y - champion.pos.y;
      const isOrthogonal = (Math.abs(dx) <= 1 && dy === 0) || (dx === 0 && Math.abs(dy) <= 1);
      
      if (isOrthogonal) {
        const allChampions = [...G.players['0'].champions, ...G.players['1'].champions];
        const isOccupied = allChampions.some(c => 
          c.id !== champion.id && c.pos?.x === action.targetPos!.x && c.pos?.y === action.targetPos!.y
        );
        const isTowerPos = G.towers.some(t => 
          t.pos.x === action.targetPos!.x && t.pos.y === action.targetPos!.y
        );
        // 自陣の勝利マスには入れない
        const isOwnVictory = isOwnVictorySquare(action.targetPos, team);
        
        if (!isOccupied && !isTowerPos && !isOwnVictory) {
          champion.pos = action.targetPos;
          G.turnLog.push(`${championName} は (${action.targetPos.x}, ${action.targetPos.y}) に移動した（代替アクション）`);
          
          // 勝利マス到達チェック
          if (isVictorySquare(action.targetPos, team, G.towers)) {
            G.winner = team;
            G.turnLog.push(`★★★ ${championName} が勝利マスに到達！チーム${team}の勝利！ ★★★`);
          }
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
    if (dist <= card.move) {
      const allChampions = [...G.players['0'].champions, ...G.players['1'].champions];
      const isOccupied = allChampions.some(c => 
        c.id !== champion.id && c.pos?.x === action.targetPos!.x && c.pos?.y === action.targetPos!.y
      );
      const isTowerPos = G.towers.some(t => 
        t.pos.x === action.targetPos!.x && t.pos.y === action.targetPos!.y
      );
      // 自陣の勝利マスには入れない
      const isOwnVictory = isOwnVictorySquare(action.targetPos, team);
      
      if (!isOccupied && !isTowerPos && !isOwnVictory) {
        champion.pos = action.targetPos;
        G.turnLog.push(`${championName} は (${action.targetPos.x}, ${action.targetPos.y}) に移動した`);
        
        // 勝利マス到達チェック
        if (isVictorySquare(action.targetPos, team, G.towers)) {
          G.winner = team;
          G.turnLog.push(`★★★ ${championName} が勝利マスに到達！チーム${team}の勝利！ ★★★`);
        }
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
    const attackRange = card.move > 0 ? 1 : 2;
    
    // チャンピオンへの攻撃
    if (action.targetChampionId) {
      const target = G.players[enemyTeam].champions.find(c => c.id === action.targetChampionId);
      
      if (target && target.pos) {
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
          G.turnLog.push(`${championName} の ${card.nameJa}！ しかし ${getChampionDisplayName(target)} に届かなかった...`);
        }
      }
    }
    // タワーへの攻撃
    else if (action.targetTowerId) {
      const target = G.towers.find(t => t.id === action.targetTowerId);
      
      if (target) {
        const dist = getDistance(champion.pos, target.pos);
        
        if (dist <= attackRange) {
          // タワーへのダメージ計算（タイプ相性あり）
          const { damage, effectiveness } = calculateDamage(
            card.power,
            card.type,
            champion.currentType,
            target.type
          );
          
          let finalDamage = damage;
          
          // みずしゅりけん等の連続攻撃
          if (card.effectFn === 'multiHit') {
            const hits = 2 + Math.floor(random.Number() * 3);
            finalDamage = finalDamage * hits;
            G.turnLog.push(`${championName} の ${card.nameJa}！ ${hits}回ヒット！`);
          }
          
          target.hp -= finalDamage;
          
          // ダメージイベントを追加（アニメーション用）
          G.damageEvents.push({
            id: `dmg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            targetId: target.id,
            amount: finalDamage,
            effectiveness: effectiveness || undefined,
            timestamp: Date.now(),
          });
          
          let logMsg = `${championName} の ${card.nameJa}！ タワー(${target.id}) に ${finalDamage} ダメージ`;
          if (effectiveness) logMsg += ` ${effectiveness}`;
          G.turnLog.push(logMsg);
          
          // 反動
          if (card.effectFn === 'recoil') {
            const recoilDamage = Math.floor(finalDamage / 3);
            champion.currentHp -= recoilDamage;
            G.turnLog.push(`${championName} は反動で ${recoilDamage} ダメージを受けた`);
          }
          
          // 破壊チェックはチェックノックアウトフェーズで行われるが、ログのためにここでも確認可
          if (target.hp <= 0) {
             // 実際の破壊処理は checkKnockouts で一括で行う
             G.turnLog.push(`タワー(${target.id}) を破壊した！`);
          }
        } else {
          G.turnLog.push(`${championName} の ${card.nameJa}！ しかしタワー(${target.id}) に届かなかった...`);
        }
      }
    }
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



/**
 * 配置が必要かどうかをチェック
 * 場に3体未満のチームがあり、かつ配置可能なチャンピオン（ノックアウトされていない控え）がいる場合true
 */
function needsDeployPhase(G: GameState): boolean {
  for (const team of ['0', '1'] as Team[]) {
    const deployedCount = G.players[team].champions.filter(c => c.pos !== null).length;
    const canDeployMore = G.players[team].champions.some(c => 
      c.pos === null && c.knockoutTurnsRemaining === 0
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
  // タワーは攻撃しない（壁としてのみ機能）
  
  // 撃破チェック
  checkKnockouts(G);
  
  // ベンチ回復
  processBenchRecovery(G);
  
  // 撃破カウントダウン
  processKnockoutCountdown(G);
  
  // ターン/フェイズ進行
  G.turnInPhase++;
  let isNewPhase = false;
  if (G.turnInPhase > TURNS_PER_PHASE) {
    G.turnInPhase = 1;
    G.currentPhase++;
    isNewPhase = true;
    refillCards(G);
    
    // タワーのタイプを変更
    G.towers.forEach(tower => {
      tower.type = ELEMENT_TYPES[Math.floor(random.Number() * ELEMENT_TYPES.length)];
    });
    
    G.turnLog.push(`=== フェイズ${G.currentPhase}開始 (タワー属性変化) ===`);
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
  
  G.turnLog.push('--- ターン終了 ---');
}

// タワーは攻撃しない - 勝利マスへのアクセスをブロックする壁として機能
// function resolveTowerAttacks は削除

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
