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
  Card
} from './types';
import { ALL_CHAMPIONS, getChampionById } from './champions';
import { calculateDamage } from './typeChart';

const BOARD_SIZE = 9;
const TURNS_PER_PHASE = 4;
const KNOCKOUT_TURNS = 4;
const BENCH_RECOVERY_PERCENT = 0.15;
const GUARD_DAMAGE_REDUCTION = 1 / 3;
const CHAMPIONS_ON_FIELD = 3;
const CHAMPIONS_PER_TEAM = 4;

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

/**
 * チャンピオン定義からゲーム内インスタンスを生成
 */
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
    hand: [...definition.cards], // カードをコピー
    usedCards: [],
    isGuarding: false,
    knockoutTurnsRemaining: 0,
  };
}

/**
 * チームのスポーン位置を取得
 */
function getSpawnPositions(team: Team): Position[] {
  if (team === '0') {
    // 左下エリア
    return [
      { x: 0, y: 6 },
      { x: 0, y: 7 },
      { x: 0, y: 8 },
      { x: 1, y: 7 },
      { x: 1, y: 8 },
    ];
  } else {
    // 右上エリア
    return [
      { x: 8, y: 0 },
      { x: 8, y: 1 },
      { x: 8, y: 2 },
      { x: 7, y: 0 },
      { x: 7, y: 1 },
    ];
  }
}

/**
 * 初期配置位置を取得
 */
function getInitialPositions(team: Team): Position[] {
  const spawns = getSpawnPositions(team);
  return spawns.slice(0, CHAMPIONS_ON_FIELD);
}

/**
 * プレイヤー状態を初期化
 */
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

    // チーム0のタワー配置 (左下エリアを守る)
    towers.push(createTower('tower-0-1', '0', 0, 4));
    towers.push(createTower('tower-0-2', '0', 2, 6));
    towers.push(createTower('tower-0-3', '0', 4, 8));

    // チーム1のタワー配置 (右上エリアを守る)
    towers.push(createTower('tower-1-1', '1', 8, 4));
    towers.push(createTower('tower-1-2', '1', 6, 2));
    towers.push(createTower('tower-1-3', '1', 4, 0));

    // 各プレイヤーに4体のチャンピオンを割り当て（バンピック未実装のため固定）
    // チーム0: ゲコゲコガ、炎獅子、雷鳥、機動馬
    // チーム1: 機動馬、雷鳥、炎獅子、ゲコゲコガ
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
      turnLog: ['ゲーム開始 - 9×9ボード'],
      gamePhase: 'action',
      winner: null,
    };
  },

  moves: {
    /**
     * カードをプレイする
     */
    playCard: (
      { G, playerID }: { G: GameState; playerID: string },
      championId: string,
      cardId: string,
      targetPos?: Position,
      targetChampionId?: string
    ) => {
      const team = playerID as Team;
      const playerState = G.players[team];
      
      // チャンピオンの存在確認
      const champion = playerState.champions.find(c => c.id === championId);
      if (!champion || champion.pos === null) {
        console.warn(`Champion ${championId} not found or not on field`);
        return;
      }
      
      // カードの存在確認
      const card = champion.hand.find(c => c.id === cardId);
      if (!card) {
        console.warn(`Card ${cardId} not in hand`);
        return;
      }
      
      // 既に2体分の行動を選択済みかチェック
      const currentActions = G.turnActions[team].actions;
      if (currentActions.length >= 2) {
        console.warn('Already selected 2 actions this turn');
        return;
      }
      
      // 同じチャンピオンが既に行動選択済みかチェック
      const alreadyActing = currentActions.some(a => a.championId === championId);
      if (alreadyActing) {
        console.warn(`Champion ${championId} already has an action this turn`);
        return;
      }
      
      const action: CardAction = {
        championId,
        cardId,
        targetPos,
        targetChampionId,
      };
      
      G.turnActions[team].actions.push(action);
    },
    
    /**
     * ガードアクションを選択
     */
    guard: (
      { G, playerID }: { G: GameState; playerID: string },
      championId: string,
      discardCardIds: [string, string]
    ) => {
      const team = playerID as Team;
      const playerState = G.players[team];
      
      const champion = playerState.champions.find(c => c.id === championId);
      if (!champion || champion.pos === null) return;
      
      // 2枚のカードを持っているか確認
      const card1 = champion.hand.find(c => c.id === discardCardIds[0]);
      const card2 = champion.hand.find(c => c.id === discardCardIds[1]);
      if (!card1 || !card2) {
        console.warn('Need 2 cards to guard');
        return;
      }
      
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
    
    /**
     * 行動選択をキャンセル
     */
    cancelAction: (
      { G, playerID }: { G: GameState; playerID: string },
      championId: string
    ) => {
      const team = playerID as Team;
      G.turnActions[team].actions = G.turnActions[team].actions.filter(
        a => a.championId !== championId
      );
    },
    
    /**
     * 出撃フェーズでチャンピオンを配置
     */
    deployChampion: (
      { G, playerID }: { G: GameState; playerID: string },
      championId: string,
      pos: Position
    ) => {
      if (G.gamePhase !== 'deploy') return;
      
      const team = playerID as Team;
      const playerState = G.players[team];
      
      const champion = playerState.champions.find(c => c.id === championId);
      if (!champion || champion.pos !== null) return;
      if (champion.knockoutTurnsRemaining > 0) return;
      
      // 有効なスポーン位置か確認
      const spawnPositions = getSpawnPositions(team);
      const isValidSpawn = spawnPositions.some(sp => sp.x === pos.x && sp.y === pos.y);
      if (!isValidSpawn) return;
      
      // 他のユニットと重なっていないか
      const allChampions = [...G.players['0'].champions, ...G.players['1'].champions];
      const isOccupied = allChampions.some(c => c.pos?.x === pos.x && c.pos?.y === pos.y);
      if (isOccupied) return;
      
      champion.pos = pos;
    },
  },

  turn: {
    activePlayers: ActivePlayers.ALL,
    onBegin: ({ G }: { G: GameState }) => {
      // ターン開始時の初期化
      G.turnActions = { '0': { actions: [] }, '1': { actions: [] } };
      
      // ガード状態をリセット
      for (const team of ['0', '1'] as Team[]) {
        for (const champion of G.players[team].champions) {
          champion.isGuarding = false;
        }
      }
    },
    onEnd: ({ G, ctx, random }: { G: GameState; ctx: any; random: any }) => {
      resolveActions(G, ctx, random);
    },
  },
  
  endIf: ({ G }: { G: GameState }) => {
    // タワー全滅チェック
    const team0Towers = G.towers.filter(t => t.team === '0').length;
    const team1Towers = G.towers.filter(t => t.team === '1').length;
    
    if (team0Towers === 0) return { winner: '1' };
    if (team1Towers === 0) return { winner: '0' };
    
    // 本拠地到達チェック
    const allChampions = [...G.players['0'].champions, ...G.players['1'].champions];
    
    // チーム0が右上エリア（チーム1の本拠地）に到達
    const team0ReachedBase = allChampions.some(c => 
      c.team === '0' && c.pos && c.pos.x === 8 && c.pos.y === 0
    );
    if (team0ReachedBase) return { winner: '0' };
    
    // チーム1が左下エリア（チーム0の本拠地）に到達
    const team1ReachedBase = allChampions.some(c =>
      c.team === '1' && c.pos && c.pos.x === 0 && c.pos.y === 8
    );
    if (team1ReachedBase) return { winner: '1' };
    
    return undefined;
  },
};

/**
 * 行動解決処理
 */
function resolveActions(G: GameState, ctx: any, random: any) {
  const logs: string[] = [];
  logs.push(`--- フェイズ${G.currentPhase} ターン${G.turnInPhase} ---`);
  
  // すべての行動を収集して優先度順にソート
  const allActions: { action: CardAction | GuardAction; team: Team; priority: number }[] = [];
  
  for (const team of ['0', '1'] as Team[]) {
    for (const action of G.turnActions[team].actions) {
      // GuardActionかCardActionかを判定
      if ('discardCardIds' in action) {
        // ガードは優先度0（最後に処理）
        allActions.push({ action, team, priority: 0 });
      } else {
        // カードアクションは優先度を取得
        const champion = G.players[team].champions.find(c => c.id === action.championId);
        const card = champion?.hand.find(c => c.id === action.cardId);
        if (card) {
          allActions.push({ action, team, priority: card.priority });
        }
      }
    }
  }
  
  // 優先度の高い順にソート
  allActions.sort((a, b) => b.priority - a.priority);
  
  // 行動を順番に解決
  for (const { action, team } of allActions) {
    const playerState = G.players[team];
    
    if ('discardCardIds' in action) {
      // ガードアクション
      const champion = playerState.champions.find(c => c.id === action.championId);
      if (champion && champion.pos) {
        champion.isGuarding = true;
        // カードを捨てる
        champion.hand = champion.hand.filter(c => 
          c.id !== action.discardCardIds[0] && c.id !== action.discardCardIds[1]
        );
        const cardNames = action.discardCardIds.join(', ');
        logs.push(`${getChampionDisplayName(champion)} がガード状態になった`);
      }
    } else {
      // カードアクション
      resolveCardAction(G, action, team, logs, random);
    }
  }
  
  // タワーの攻撃（範囲内の敵を攻撃）
  resolveTowerAttacks(G, logs);
  
  // 撃破チェック
  checkKnockouts(G, logs);
  
  // ベンチ回復
  processBenchRecovery(G, logs);
  
  // 撃破カウントダウン
  processKnockoutCountdown(G);
  
  // ターン/フェイズ進行
  G.turnInPhase++;
  if (G.turnInPhase > TURNS_PER_PHASE) {
    G.turnInPhase = 1;
    G.currentPhase++;
    
    // フェイズ終了時: カード補充
    refillCards(G, logs);
    
    // 出撃フェーズに移行
    G.gamePhase = 'deploy';
    logs.push(`=== フェイズ${G.currentPhase}開始 - 出撃フェーズ ===`);
  }
  
  // 行動をクリア
  G.turnActions = { '0': { actions: [] }, '1': { actions: [] } };
  G.turnLog = [...G.turnLog, ...logs];
}

/**
 * カードアクションの解決
 */
function resolveCardAction(
  G: GameState, 
  action: CardAction, 
  team: Team, 
  logs: string[],
  random: any
) {
  const champion = G.players[team].champions.find(c => c.id === action.championId);
  if (!champion || !champion.pos) return;
  
  const card = champion.hand.find(c => c.id === action.cardId);
  if (!card) return;
  
  const championDef = getChampionById(champion.definitionId);
  const championName = getChampionDisplayName(champion);
  
  // へんげんじざい特性の処理
  if (championDef?.ability === 'protean' && card.type !== 'normal') {
    champion.currentType = card.type;
    logs.push(`${championName} は ${getTypeNameJa(card.type)} タイプに変化した！`);
  }
  
  // 移動処理
  if (card.move > 0 && action.targetPos) {
    const dist = getDistance(champion.pos, action.targetPos);
    if (dist <= card.move) {
      // 衝突チェック
      const allChampions = [...G.players['0'].champions, ...G.players['1'].champions];
      const isOccupied = allChampions.some(c => 
        c.id !== champion.id && c.pos?.x === action.targetPos!.x && c.pos?.y === action.targetPos!.y
      );
      const isTowerPos = G.towers.some(t => 
        t.pos.x === action.targetPos!.x && t.pos.y === action.targetPos!.y
      );
      
      if (!isOccupied && !isTowerPos) {
        champion.pos = action.targetPos;
        logs.push(`${championName} は (${action.targetPos.x}, ${action.targetPos.y}) に移動した`);
      }
    }
  }
  
  // 攻撃処理
  if (card.power > 0 && action.targetChampionId) {
    const enemyTeam = team === '0' ? '1' : '0';
    const target = G.players[enemyTeam].champions.find(c => c.id === action.targetChampionId);
    
    if (target && target.pos) {
      const dist = getDistance(champion.pos, target.pos);
      const attackRange = card.move > 0 ? 1 : 2; // 移動技は隣接、それ以外は2マス
      
      if (dist <= attackRange) {
        // ダメージ計算
        const { damage, effectiveness } = calculateDamage(
          card.power,
          card.type,
          champion.currentType,
          target.currentType
        );
        
        // ガード補正
        let finalDamage = damage;
        if (target.isGuarding) {
          finalDamage = Math.floor(damage * GUARD_DAMAGE_REDUCTION);
          logs.push(`${getChampionDisplayName(target)} はガードしている！`);
        }
        
        // 特殊効果: みずしゅりけん（2-4回攻撃）
        if (card.effectFn === 'multiHit') {
          const hits = 2 + Math.floor(random.Number() * 3); // 2-4回
          finalDamage = finalDamage * hits;
          logs.push(`${championName} の ${card.nameJa}！ ${hits}回ヒット！`);
        }
        
        target.currentHp -= finalDamage;
        
        let logMsg = `${championName} の ${card.nameJa}！ ${getChampionDisplayName(target)} に ${finalDamage} ダメージ`;
        if (effectiveness) logMsg += ` ${effectiveness}`;
        logs.push(logMsg);
        
        // 特殊効果: ひるみ（flinch）
        if (card.effectFn === 'flinch') {
          const flinchChance = card.nameJa === 'あくのはどう' ? 0.2 : 0.3;
          if (random.Number() < flinchChance) {
            // このターンの相手の行動を無効化（簡易実装）
            logs.push(`${getChampionDisplayName(target)} はひるんだ！`);
          }
        }
        
        // 特殊効果: ノックバック
        if (card.effectFn === 'knockback' && random.Number() < 0.3) {
          // 押し出し方向を計算
          const dx = target.pos.x - champion.pos.x;
          const dy = target.pos.y - champion.pos.y;
          const newX = target.pos.x + (dx !== 0 ? Math.sign(dx) : 0);
          const newY = target.pos.y + (dy !== 0 ? Math.sign(dy) : 0);
          
          if (newX >= 0 && newX < BOARD_SIZE && newY >= 0 && newY < BOARD_SIZE) {
            target.pos = { x: newX, y: newY };
            logs.push(`${getChampionDisplayName(target)} は押し出された！`);
          }
        }
        
        // 特殊効果: 反動ダメージ
        if (card.effectFn === 'recoil') {
          const recoilDamage = Math.floor(finalDamage / 3);
          champion.currentHp -= recoilDamage;
          logs.push(`${championName} は反動で ${recoilDamage} ダメージを受けた`);
        }
      }
    }
  }
  
  // 交代処理
  if (card.isSwap || card.effectFn === 'uturn') {
    // 控えのチャンピオンを探す
    const benchChampion = G.players[team].champions.find(c => 
      c.pos === null && c.knockoutTurnsRemaining === 0
    );
    
    if (benchChampion) {
      // 位置を交換
      benchChampion.pos = { ...champion.pos };
      champion.pos = null;
      logs.push(`${championName} と ${getChampionDisplayName(benchChampion)} が交代した！`);
    }
  }
  
  // カードを使用済みに
  champion.hand = champion.hand.filter(c => c.id !== card.id);
  champion.usedCards.push(card);
}

/**
 * タワー攻撃の解決
 */
function resolveTowerAttacks(G: GameState, logs: string[]) {
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
      logs.push(`タワー(${tower.id}) が ${getChampionDisplayName(target)} に ${damage} ダメージ`);
    }
  }
}

/**
 * 撃破チェック
 */
function checkKnockouts(G: GameState, logs: string[]) {
  for (const team of ['0', '1'] as Team[]) {
    for (const champion of G.players[team].champions) {
      if (champion.currentHp <= 0 && champion.pos !== null) {
        champion.pos = null;
        champion.knockoutTurnsRemaining = KNOCKOUT_TURNS;
        champion.currentHp = 0;
        logs.push(`${getChampionDisplayName(champion)} は撃破された！ (${KNOCKOUT_TURNS}ターン後に復活可能)`);
      }
    }
  }
  
  // タワー破壊
  const destroyedTowers = G.towers.filter(t => t.hp <= 0);
  for (const tower of destroyedTowers) {
    logs.push(`タワー(${tower.id}) が破壊された！`);
  }
  G.towers = G.towers.filter(t => t.hp > 0);
}

/**
 * ベンチ回復処理
 */
function processBenchRecovery(G: GameState, logs: string[]) {
  for (const team of ['0', '1'] as Team[]) {
    for (const champion of G.players[team].champions) {
      if (champion.pos === null && champion.knockoutTurnsRemaining === 0 && champion.currentHp < champion.maxHp) {
        const recoveryAmount = Math.floor(champion.maxHp * BENCH_RECOVERY_PERCENT);
        champion.currentHp = Math.min(champion.currentHp + recoveryAmount, champion.maxHp);
        logs.push(`${getChampionDisplayName(champion)} はベンチで ${recoveryAmount} HP回復した`);
      }
    }
  }
}

/**
 * 撃破カウントダウン
 */
function processKnockoutCountdown(G: GameState) {
  for (const team of ['0', '1'] as Team[]) {
    for (const champion of G.players[team].champions) {
      if (champion.knockoutTurnsRemaining > 0) {
        champion.knockoutTurnsRemaining--;
        if (champion.knockoutTurnsRemaining === 0) {
          // 復活可能に（HP全回復）
          champion.currentHp = champion.maxHp;
        }
      }
    }
  }
}

/**
 * カード補充（フェイズ終了時）
 */
function refillCards(G: GameState, logs: string[]) {
  for (const team of ['0', '1'] as Team[]) {
    for (const champion of G.players[team].champions) {
      const definition = getChampionById(champion.definitionId);
      if (definition) {
        champion.hand = [...definition.cards];
        champion.usedCards = [];
      }
    }
  }
  logs.push('全チャンピオンのカードが補充された');
}

/**
 * チャンピオンの表示名を取得
 */
function getChampionDisplayName(champion: ChampionInstance): string {
  const def = getChampionById(champion.definitionId);
  const teamLabel = champion.team === '0' ? '青' : '赤';
  return `[${teamLabel}]${def?.nameJa || champion.definitionId}`;
}

/**
 * タイプ名の日本語化
 */
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
