/**
 * CPU AI Module - Heuristic Scoring System
 * 
 * 各評価関数は独立しており、ゲームルール変更時も局所的な修正で対応可能。
 * 重み調整で難易度を変更できる。
 */

import { 
  GameState, 
  Team, 
  ChampionInstance, 
  Card, 
  Position, 
  CardAction, 
  GuardAction,
  ElementType
} from './types';
import { calculateDamage, getTypeEffectiveness, TYPE_EFFECTIVENESS } from './typeChart';

// ============================================
// 定数
// ============================================
const BOARD_SIZE = 13;

// ============================================
// 重み設定（難易度調整可能）
// ============================================
export const AI_WEIGHTS = {
  victoryProgress: 100,   // 敵陣侵攻
  killPotential: 80,      // 撃破可能性
  typeAdvantage: 40,      // タイプ相性
  survival: 50,           // 生存価値
  positioning: 30,        // ポジショニング
  cardPriority: 10,       // カード優先度ボーナス
};

// ============================================
// 型定義
// ============================================
interface ActionCandidate {
  championId: string;
  card: Card;
  isGuard: boolean;
  isAlternativeMove: boolean;
  targetPos?: Position;
  targetChampionId?: string;
}

interface ScoredAction extends ActionCandidate {
  score: number;
  scoreBreakdown: Record<string, number>;
}

// ============================================
// ユーティリティ関数
// ============================================

function getDistance(p1: Position, p2: Position): number {
  return Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
}

function getVictoryTargets(team: Team): Position[] {
  // 敵陣の奥を目指す（スコア稼ぎのため）
  if (team === '0') {
    // 青チーム: 右端 (x=12) を目指す
    return [
      { x: 12, y: 3 }, { x: 12, y: 6 }, { x: 12, y: 9 }
    ];
  } else {
    // 赤チーム: 左端 (x=0) を目指す
    return [
      { x: 0, y: 3 }, { x: 0, y: 6 }, { x: 0, y: 9 }
    ];
  }
}

// Admin Domain: 中央3x3 (5,5) ~ (7,7)
function isAdminDomain(x: number, y: number): boolean {
  return x >= 5 && x <= 7 && y >= 5 && y <= 7;
}

const DEPLOY_MIN_DISTANCE = 3; // 配置時の最低距離制約

function getSpawnPositions(): Position[] {
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
 */
function isValidDeployPosition(G: GameState, pos: Position): boolean {
  // 1. 盤面内チェック
  if (pos.x < 0 || pos.x >= BOARD_SIZE || pos.y < 0 || pos.y >= BOARD_SIZE) return false;
  
  // 2. 中央3x3 (Admin Domain) は配置不可
  if (isAdminDomain(pos.x, pos.y)) return false;
  
  // 3. 他のチャンピオンとの距離チェック
  const allChampions = [...G.players['0'].champions, ...G.players['1'].champions];
  for (const c of allChampions) {
    if (c.pos === null) continue;
    
    const distance = getDistance(pos, c.pos);
    if (distance < DEPLOY_MIN_DISTANCE) {
      return false; // 距離が近すぎる
    }
  }
  
  return true;
}

function isPositionOccupied(G: GameState, pos: Position, excludeId?: string): boolean {
  const allChampions = [...G.players['0'].champions, ...G.players['1'].champions];
  const championOccupied = allChampions.some(c => 
    c.id !== excludeId && c.pos?.x === pos.x && c.pos?.y === pos.y
  );
  return championOccupied;
}

function isPositionValid(pos: Position): boolean {
  return pos.x >= 0 && pos.x < BOARD_SIZE && pos.y >= 0 && pos.y < BOARD_SIZE;
}

// ============================================
// 評価関数群
// ============================================

/**
 * 敵陣侵攻評価
 * 移動後の位置が敵陣奥に近いほど高スコア
 */
function evaluateVictoryProgress(
  G: GameState, 
  champion: ChampionInstance,
  action: ActionCandidate, 
  team: Team
): number {
  if (!champion.pos) return 0;
  
  const newPos = action.targetPos || champion.pos;
  const victoryTargets = getVictoryTargets(team);
  
  // 現在位置からの最短距離
  const currentMinDist = Math.min(...victoryTargets.map(v => getDistance(champion.pos!, v)));
  // 移動後の最短距離
  const newMinDist = Math.min(...victoryTargets.map(v => getDistance(newPos, v)));
  
  // 距離が縮まった場合にボーナス
  const improvement = currentMinDist - newMinDist;
  if (improvement > 0) {
    return (improvement / 8) * AI_WEIGHTS.victoryProgress;
  }
  
  return 0;
}

/**
 * タイプ相性評価
 * 攻撃対象に対してタイプ有利なら高スコア
 */
function evaluateTypeAdvantage(
  G: GameState,
  champion: ChampionInstance,
  action: ActionCandidate,
  team: Team
): number {
  if (!action.card.power || action.card.power <= 0) return 0;
  
  const enemyTeam = team === '0' ? '1' : '0';
  let targetType: ElementType | undefined;
  
  if (action.targetChampionId) {
    const target = G.players[enemyTeam].champions.find(c => c.id === action.targetChampionId);
    if (target) targetType = target.currentType;
  }
  
  if (!targetType) return 0;
  
  const effectiveness = getTypeEffectiveness(action.card.type, targetType);
  
  if (effectiveness >= TYPE_EFFECTIVENESS.SUPER_EFFECTIVE) {
    return AI_WEIGHTS.typeAdvantage;
  } else if (effectiveness === TYPE_EFFECTIVENESS.NO_EFFECT) {
    return -50; // 無効は大幅マイナス
  } else if (effectiveness <= TYPE_EFFECTIVENESS.NOT_VERY_EFFECTIVE) {
    return -20;
  }
  
  return 0;
}

/**
 * 撃破可能性評価
 * 敵を撃破できる場合は高スコア
 */
function evaluateKillPotential(
  G: GameState,
  champion: ChampionInstance,
  action: ActionCandidate,
  team: Team
): number {
  if (!action.card.power || action.card.power <= 0) return 0;
  if (!action.targetChampionId) return 0;
  
  const enemyTeam = team === '0' ? '1' : '0';
  const target = G.players[enemyTeam].champions.find(c => c.id === action.targetChampionId);
  if (!target) return 0;
  
  const { damage } = calculateDamage(
    action.card.power,
    action.card.type,
    champion.currentType,
    target.currentType
  );
  
  // 撃破確定
  if (target.currentHp <= damage) {
    return AI_WEIGHTS.killPotential;
  }
  
  // HPを半分以下にできる
  if (target.currentHp - damage <= target.maxHp / 2) {
    return AI_WEIGHTS.killPotential * 0.4;
  }
  
  // ダメージ量に応じた評価
  const damageRatio = damage / target.maxHp;
  return AI_WEIGHTS.killPotential * damageRatio * 0.3;
}

/**
 * 生存/防御評価
 * 自分が危険な状態ならガードや退避を評価
 */
function evaluateSurvival(
  G: GameState,
  champion: ChampionInstance,
  action: ActionCandidate,
  team: Team
): number {
  const hpRatio = champion.currentHp / champion.maxHp;
  
  // HPが低い時のガードは高評価
  if (hpRatio < 0.3 && action.isGuard) {
    return AI_WEIGHTS.survival;
  }
  
  // HPが半分以下でガード
  if (hpRatio < 0.5 && action.isGuard) {
    return AI_WEIGHTS.survival * 0.5;
  }
  
  // 反動技は危険な時は避ける
  if (action.card.effectFn === 'recoil' && hpRatio < 0.5) {
    return -30;
  }
  
  return 0;
}

/**
 * ポジショニング評価
 * 良い位置取りを評価
 */
function evaluatePositioning(
  G: GameState,
  champion: ChampionInstance,
  action: ActionCandidate,
  team: Team
): number {
  if (!action.targetPos) return 0;
  
  const enemyTeam = team === '0' ? '1' : '0';
  const enemies = G.players[enemyTeam].champions.filter(c => c.pos !== null);
  
  let score = 0;
  
  // 敵に隣接できる位置は攻撃チャンスがあるので加点
  for (const enemy of enemies) {
    if (!enemy.pos) continue;
    const dist = getDistance(action.targetPos, enemy.pos);
    if (dist <= 2) {
      score += 10; // 攻撃圏内
    }
  }
  
  // 敵陣に近づく動きを評価（左右配置）
  // 13x13 なのでターゲットも修正
  const enemyBase = team === '0' ? { x: 12, y: 6 } : { x: 0, y: 6 };
  const currentDist = champion.pos ? getDistance(champion.pos, enemyBase) : 20;
  const newDist = getDistance(action.targetPos, enemyBase);
  
  if (newDist < currentDist) {
    score += AI_WEIGHTS.positioning * 0.5;
  }
  
  return score;
}

/**
 * 総合評価
 */
function evaluateAction(
  G: GameState,
  champion: ChampionInstance,
  action: ActionCandidate,
  team: Team
): ScoredAction {
  const breakdown: Record<string, number> = {};
  
  breakdown.victoryProgress = evaluateVictoryProgress(G, champion, action, team);
  breakdown.typeAdvantage = evaluateTypeAdvantage(G, champion, action, team);
  breakdown.killPotential = evaluateKillPotential(G, champion, action, team);
  breakdown.survival = evaluateSurvival(G, champion, action, team);
  breakdown.positioning = evaluatePositioning(G, champion, action, team);
  
  // カード優先度ボーナス（高優先度カードは先手を取れる）
  breakdown.cardPriority = (action.card.priority / 120) * AI_WEIGHTS.cardPriority;
  
  const totalScore = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
  
  return {
    ...action,
    score: totalScore,
    scoreBreakdown: breakdown,
  };
}

// ============================================
// アクション候補生成
// ============================================

/**
 * チャンピオンが取りうる全てのアクション候補を生成
 */
function generateActionCandidates(
  G: GameState,
  champion: ChampionInstance,
  team: Team
): ActionCandidate[] {
  const candidates: ActionCandidate[] = [];
  const enemyTeam = team === '0' ? '1' : '0';
  
  if (!champion.pos) return candidates;
  
  // 各カードについてアクション候補を生成
  for (const card of champion.hand) {
    if (card.isSwap) continue; // 交代カードは一旦スキップ
    
    // 移動先候補
    const movePositions: (Position | undefined)[] = [undefined]; // 移動なし
    
    if (card.move > 0) {
      // 移動可能な全位置を探索
      for (let mx = -card.move; mx <= card.move; mx++) {
        for (let my = -card.move; my <= card.move; my++) {
          if (Math.abs(mx) + Math.abs(my) > card.move) continue;
          if (mx === 0 && my === 0) continue;
          
          const newPos = { x: champion.pos.x + mx, y: champion.pos.y + my };
          if (!isPositionValid(newPos)) continue;
          // 自軍でも敵軍でもユニットがいる場所には入れない（踏むのはNG）
          if (isPositionOccupied(G, newPos, champion.id)) continue;
          
          movePositions.push(newPos);
        }
      }
    }
    
    // 攻撃対象候補
    const enemies = G.players[enemyTeam].champions.filter(c => c.pos !== null);
    
    for (const movePos of movePositions) {
      const attackFrom = movePos || champion.pos;
      const attackRange = card.attackRange ?? (card.move > 0 ? 1 : 2);
      
      if (card.power > 0) {
        // 敵チャンピオンへの攻撃
        for (const enemy of enemies) {
          if (!enemy.pos) continue;
          if (getDistance(attackFrom, enemy.pos) <= attackRange) {
            candidates.push({
              championId: champion.id,
              card,
              isGuard: false,
              isAlternativeMove: false,
              targetPos: movePos,
              targetChampionId: enemy.id,
            });
          }
        }
      }
      
      // 移動のみ（攻撃対象なし）
      if (movePos) {
        candidates.push({
          championId: champion.id,
          card,
          isGuard: false,
          isAlternativeMove: false,
          targetPos: movePos,
        });
      }
    }
    
    // 移動なし・攻撃対象もなしの場合でも「その場で効果不発」として候補を追加
    // （ボルトチェンジなど、対象がいない場合でもカードを消費して進行する必要がある）
    if (card.move === 0 && card.power > 0) {
      const attackRange = card.attackRange ?? 2;
      const hasTarget = enemies.some(t => {
        if (!t.pos) return false;
        return getDistance(champion.pos!, t.pos) <= attackRange;
      });
      
      if (!hasTarget) {
        candidates.push({
          championId: champion.id,
          card,
          isGuard: false,
          isAlternativeMove: false,
          // ターゲットなし（効果不発として処理される）
        });
      }
    }
    
    // 代替アクション（1マス移動のみ）
    const orthogonalDirs = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    
    for (const dir of orthogonalDirs) {
      const newPos = { x: champion.pos.x + dir.dx, y: champion.pos.y + dir.dy };
      if (!isPositionValid(newPos)) continue;
      if (isPositionOccupied(G, newPos, champion.id)) continue;
      
      candidates.push({
        championId: champion.id,
        card,
        isGuard: false,
        isAlternativeMove: true,
        targetPos: newPos,
      });
    }
  }
  
  // ガードアクション（カードが2枚以上ある場合）
  if (champion.hand.length >= 2) {
    candidates.push({
      championId: champion.id,
      card: champion.hand[0], // ダミー
      isGuard: true,
      isAlternativeMove: false,
    });
  }
  
  return candidates;
}

// ============================================
// メインAPI
// ============================================

/**
 * CPUの行動を選択（計画フェーズ）
 */
export function selectCPUActions(G: GameState, cpuTeam: Team): (CardAction | GuardAction)[] {
  const playerState = G.players[cpuTeam];
  const availableChampions = playerState.champions.filter(
    c => c.pos !== null && c.hand.length > 0
  );
  
  if (availableChampions.length === 0) return [];
  
  // 全チャンピオンの全アクションを評価
  const allScoredActions: { champion: ChampionInstance; action: ScoredAction }[] = [];
  
  for (const champion of availableChampions) {
    const candidates = generateActionCandidates(G, champion, cpuTeam);
    for (const candidate of candidates) {
      const scored = evaluateAction(G, champion, candidate, cpuTeam);
      allScoredActions.push({ champion, action: scored });
    }
  }
  
  // スコア順にソート
  allScoredActions.sort((a, b) => b.action.score - a.action.score);
  
  // 上位2つを選択（異なるチャンピオン優先）
  const selectedActions: (CardAction | GuardAction)[] = [];
  const usedChampionIds = new Set<string>();
  
  for (const { champion, action } of allScoredActions) {
    if (usedChampionIds.has(champion.id)) continue;
    if (selectedActions.length >= 2) break;
    
    if (action.isGuard) {
      // ガードアクション
      if (champion.hand.length >= 2) {
        selectedActions.push({
          championId: champion.id,
          discardCardIds: [champion.hand[0].id, champion.hand[1].id] as [string, string],
        });
        usedChampionIds.add(champion.id);
      }
    } else {
      // カードアクション
      selectedActions.push({
        championId: champion.id,
        cardId: action.card.id,
        targetPos: action.targetPos,
        targetChampionId: action.targetChampionId,
        // targetTowerId は削除
        isAlternativeMove: action.isAlternativeMove,
      });
      usedChampionIds.add(champion.id);
    }
  }
  
  // 2つ選べなかった場合、残りのチャンピオンから適当に選ぶ
  if (selectedActions.length < 2) {
    for (const champion of availableChampions) {
      if (usedChampionIds.has(champion.id)) continue;
      if (selectedActions.length >= 2) break;
      if (champion.hand.length === 0) continue;
      
      const card = champion.hand[0];
      selectedActions.push({
        championId: champion.id,
        cardId: card.id,
      });
      usedChampionIds.add(champion.id);
    }
  }
  
  return selectedActions;
}

/**
 * CPUのターゲットを選択（解決フェーズ）
 */
export function selectCPUTarget(
  G: GameState,
  champion: ChampionInstance,
  card: Card,
  team: Team,
  isAlternativeMove: boolean = false
): { targetPos?: Position; targetChampionId?: string; targetTowerId?: string } {
  // 候補を生成して最良のものを選択
  const candidates = generateActionCandidates(G, champion, team)
    .filter(c => c.card.id === card.id && !c.isGuard && c.isAlternativeMove === isAlternativeMove);
  
  if (candidates.length === 0) {
    return {};
  }
  
  const scoredCandidates = candidates.map(c => evaluateAction(G, champion, c, team));
  scoredCandidates.sort((a, b) => b.score - a.score);
  
  const best = scoredCandidates[0];
  return {
    targetPos: best.targetPos,
    targetChampionId: best.targetChampionId,
    // targetTowerId は削除されたが型定義上残っている場合は undefined を返す
    targetTowerId: undefined,
  };
}

/**
 * CPUの配置位置を選択（配置フェーズ）
 */
export function selectCPUDeployPosition(
  G: GameState,
  champion: ChampionInstance,
  team: Team
): Position | null {
  const spawnPositions = getSpawnPositions();
  
  // 距離制約を満たす位置のみ抽出
  const availablePositions = spawnPositions.filter(pos => 
    isValidDeployPosition(G, pos)
  );
  
  if (availablePositions.length === 0) return null;
  
  // ポイントトークンと勝利ターゲットに近い位置を優先
  const victoryTargets = getVictoryTargets(team);
  const pointTokenPositions = [
    ...G.pointTokens.map(t => ({ x: t.x, y: t.y })),
    ...G.pendingPointTokens.map(t => ({ x: t.x, y: t.y }))
  ];
  
  availablePositions.sort((a, b) => {
    // ポイントトークンへの距離を優先
    let scoreA = 0, scoreB = 0;
    
    if (pointTokenPositions.length > 0) {
      const tokenDistA = Math.min(...pointTokenPositions.map(v => getDistance(a, v)));
      const tokenDistB = Math.min(...pointTokenPositions.map(v => getDistance(b, v)));
      scoreA += tokenDistA * 2;
      scoreB += tokenDistB * 2;
    }
    
    // 勝利ターゲットへの距離も考慮
    const distA = Math.min(...victoryTargets.map(v => getDistance(a, v)));
    const distB = Math.min(...victoryTargets.map(v => getDistance(b, v)));
    scoreA += distA;
    scoreB += distB;
    
    return scoreA - scoreB;
  });
  
  return availablePositions[0];
}
