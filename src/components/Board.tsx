'use client';
import React, { useState, useEffect, useRef } from 'react';
import { BoardProps } from 'boardgame.io/react';
import { GameState, Team, ChampionInstance, Card, Position, Tower, DamageEvent, Block } from '../game/types';
import { getChampionById } from '../game/champions';
import { getSpawnPositions, isValidDeployPosition, findReachablePositionsWithPath } from '../game/Game';
import { Shield, Zap, Flame, Droplets, Bug, Moon, Cog, Check, X, Target, Move } from 'lucide-react';

type Props = BoardProps<GameState>;

const BOARD_SIZE = 13;

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string; bgColor: string }> = {
  water: { icon: <Droplets size={12} />, color: 'text-blue-400', bgColor: 'bg-blue-600' },
  fire: { icon: <Flame size={12} />, color: 'text-orange-400', bgColor: 'bg-orange-600' },
  electric: { icon: <Zap size={12} />, color: 'text-yellow-400', bgColor: 'bg-yellow-600' },
  bug: { icon: <Bug size={12} />, color: 'text-green-400', bgColor: 'bg-green-600' },
  dark: { icon: <Moon size={12} />, color: 'text-purple-400', bgColor: 'bg-purple-600' },
  steel: { icon: <Cog size={12} />, color: 'text-gray-400', bgColor: 'bg-gray-600' },
  ground: { icon: <span className="text-xs">地</span>, color: 'text-amber-400', bgColor: 'bg-amber-700' },
  normal: { icon: <span className="text-xs">N</span>, color: 'text-gray-300', bgColor: 'bg-gray-500' },
};

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] || TYPE_CONFIG.normal;
}

function getDistance(p1: Position, p2: Position): number {
  return Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
}

// ダメージポップアップ用の型
interface VisibleDamageEvent extends DamageEvent {
  x: number;
  y: number;
}

export default function Board({ G, ctx, moves, playerID }: Props) {
  const [selectedChampionId, setSelectedChampionId] = useState<string | null>(null);
  const [selectedEnemyChampionId, setSelectedEnemyChampionId] = useState<string | null>(null);
  const [visibleDamageEvents, setVisibleDamageEvents] = useState<VisibleDamageEvent[]>([]);
  const [hoveredMovePos, setHoveredMovePos] = useState<Position | null>(null); // 経路プレビュー用
  const processedEventIdsRef = useRef<Set<string>>(new Set());

  const myPlayerID = (playerID || '0') as Team;
  const myPlayerState = G.players[myPlayerID];
  const enemyTeam = myPlayerID === '0' ? '1' : '0';

  const myFieldChampions = myPlayerState.champions.filter(c => c.pos !== null);
  const myBenchChampions = myPlayerState.champions.filter(c => c.pos === null);

  const selectedChampion = selectedChampionId
    ? myPlayerState.champions.find(c => c.id === selectedChampionId)
    : null;

  const actingChampionIds = G.turnActions[myPlayerID].actions.map(a => a.championId);
  const isDeployPhase = G.gamePhase === 'deploy';
  const isMyDeployTurn = isDeployPhase && G.deployTurn === myPlayerID;

  // 解決フェーズ用の状態
  const isResolutionPhase = G.gamePhase === 'resolution';
  const isAwaitingTarget = G.awaitingTargetSelection;
  const currentAction = G.currentResolvingAction;

  // 現在解決中のチャンピオンとカード
  const resolvingChampion = currentAction
    ? G.players[currentAction.team].champions.find(c => c.id === currentAction.championId)
    : null;
  const resolvingCard = resolvingChampion && currentAction && !('discardCardIds' in currentAction.action)
    ? resolvingChampion.hand.find(c => c.id === (currentAction.action as any).cardId)
    : null;

  // 代替アクションかどうかを取得
  const isAlternativeMove = currentAction && !('discardCardIds' in currentAction.action)
    ? (currentAction.action as any).isAlternativeMove
    : false;

  // ダメージイベントの処理（アニメーション用）
  useEffect(() => {
    if (!G.damageEvents || G.damageEvents.length === 0) return;

    // 新しいダメージイベントを処理
    const newEvents: VisibleDamageEvent[] = [];

    for (const event of G.damageEvents) {
      // 既に処理済みのイベントはスキップ
      if (processedEventIdsRef.current.has(event.id)) continue;
      processedEventIdsRef.current.add(event.id);

      // ターゲットの位置を取得
      let targetPos: Position | null = null;

      // チャンピオンを検索
      const allChampions = [...G.players['0'].champions, ...G.players['1'].champions];
      const champion = allChampions.find(c => c.id === event.targetId);
      if (champion?.pos) {
        targetPos = champion.pos;
      }



      if (targetPos) {
        newEvents.push({
          ...event,
          x: targetPos.x,
          y: targetPos.y,
        });
      }
    }

    if (newEvents.length > 0) {
      setVisibleDamageEvents(prev => [...prev, ...newEvents]);

      // 1秒後にイベントを削除
      const eventIds = newEvents.map(e => e.id);
      setTimeout(() => {
        setVisibleDamageEvents(prev => prev.filter(e => !eventIds.includes(e.id)));
      }, 1000);
    }
  }, [G.damageEvents, G.players]);

  // movesをrefで保持（useEffect内でstaleにならないように）
  const movesRef = useRef(moves);
  useEffect(() => {
    movesRef.current = moves;
  }, [moves]);

  // CPUアクションディレイの処理
  useEffect(() => {
    console.log('[DEBUG] cpuActionDelay effect triggered, value:', G.cpuActionDelay);
    if (G.cpuActionDelay === 0) return;

    console.log('[DEBUG] Setting timer for continueCPUAction');
    // 1秒後にCPUアクションを続行
    const timer = setTimeout(() => {
      console.log('[DEBUG] Timer fired, calling continueCPUAction');
      movesRef.current.continueCPUAction();
    }, 1000);

    return () => {
      console.log('[DEBUG] Cleaning up timer');
      clearTimeout(timer);
    };
  }, [G.cpuActionDelay]);

  // 移動可能なマスを計算（BFSベース、障害物考慮）
  const getValidMoveTargets = (): Map<string, { cost: number; path: Position[] }> => {
    if (!resolvingChampion || !resolvingChampion.pos) return new Map();

    const team = currentAction?.team || myPlayerID;

    // 代替アクションの場合: 2マス移動（BFSで障害物考慮）
    if (isAlternativeMove) {
      return findReachablePositionsWithPath(
        G,
        resolvingChampion.pos,
        2, // 代替アクションは2マス
        team,
        resolvingChampion.id
      );
    }

    // 通常のカード移動
    if (!resolvingCard || resolvingCard.move <= 0) return new Map();

    return findReachablePositionsWithPath(
      G,
      resolvingChampion.pos,
      resolvingCard.move,
      team,
      resolvingChampion.id
    );
  };

  // 攻撃可能な敵（チャンピオン・タワー）を計算
  const getValidAttackTargets = (): (ChampionInstance | Tower)[] => {
    if (!resolvingChampion || !resolvingChampion.pos || !resolvingCard) return [];
    if (resolvingCard.power <= 0) return [];

    const pendingMovePos = (currentAction?.action as any)?.targetPos;
    const sourcePos = pendingMovePos || resolvingChampion.pos;

    // 攻撃範囲の決定: 
    // - カードにattackRangeが設定されていればそれを使用
    // - 未設定の場合: 移動ありカードは移動後は隣接(1)、移動前は予測範囲(3)
    // - 未設定の場合: 移動なしカードは範囲(2)
    let attackRange = resolvingCard.attackRange ?? (resolvingCard.move > 0 ? 1 : 2);
    if (resolvingCard.move > 0 && !resolvingCard.attackRange) {
      attackRange = pendingMovePos ? 1 : 3;
    }

    const targets: (ChampionInstance | Tower)[] = [];

    // 敵チャンピオン
    const enemies = G.players[enemyTeam].champions.filter(c => c.pos !== null);
    enemies.forEach(enemy => {
      if (enemy.pos && sourcePos && getDistance(sourcePos, enemy.pos) <= attackRange) {
        targets.push(enemy);
      }
    });

    // 攻撃可能な床（ユーザー要望：攻撃で床を塗る）
    // 一旦ターゲット選択時は敵ユニットのみを選択可能とするが、
    // 任意地点攻撃を可能にするならここを修正する必要がある。
    // 今回は「敵ユニットがいるマス」または「移動先」を塗る仕様としたため、
    // 明示的な「空のマスへの攻撃」ターゲット選択は実装しない（仕様確認待ちだが、簡易化のため）
    // もし空マス攻撃が必要なら、Board全体がターゲット候補になる。

    return targets;
  };

  // 距離制約を満たす配置可能位置を計算
  const spawnablePositions = (isDeployPhase && isMyDeployTurn)
    ? getSpawnPositions().filter(pos => isValidDeployPosition(G, pos))
    : [];

  const validMoveTargetsMap = isAwaitingTarget ? getValidMoveTargets() : new Map<string, { cost: number; path: Position[] }>();
  const validAttackTargets = isAwaitingTarget ? getValidAttackTargets() : [];

  // ホバー中の経路
  const hoveredPath = hoveredMovePos ? validMoveTargetsMap.get(`${hoveredMovePos.x},${hoveredMovePos.y}`)?.path || [] : [];

  const getCellContent = (x: number, y: number) => {
    const allChampions = [...G.players['0'].champions, ...G.players['1'].champions];
    const champion = allChampions.find(c => c.pos?.x === x && c.pos?.y === y);
    const territoryOwner = G.territory[y][x];
    return { champion, territoryOwner };
  };

  const handleCellClick = (x: number, y: number) => {
    // 解決フェーズ: ターゲット選択
    if (isResolutionPhase && isAwaitingTarget) {
      const { champion } = getCellContent(x, y);

      // 移動先として選択
      const isMoveTarget = validMoveTargetsMap.has(`${x},${y}`);
      if (isMoveTarget) {
        // 移動先を選択
        // 攻撃対象はここでは設定せず、サーバー側の待機ロジックとクライアントの2段階クリックに任せる
        moves.selectTarget({ x, y }, undefined, undefined);
        return;
      }

      // 攻撃対象として選択
      // 移動ありカードの場合でも、移動先決定後(=validAttackTargetsが更新された後)ならここで選択可能
      const targetEnemy = validAttackTargets.find(t =>
        'definitionId' in t && t.pos?.x === x && t.pos?.y === y
      ) as ChampionInstance | undefined;

      if (targetEnemy) {
        moves.selectTarget(undefined, targetEnemy.id, undefined);
        return;
      }

      return;
    }

    // 配置フェーズ: チャンピオン配置
    if (isDeployPhase) {
      if (!selectedChampionId) return;
      if (!isMyDeployTurn) return;

      // 配置可能かチェック
      const isSpawnable = spawnablePositions.some(p => p.x === x && p.y === y);
      const { champion } = getCellContent(x, y); // 既に何かいればNG

      if (isSpawnable && !champion) {
        moves.deployChampion(selectedChampionId, x, y);
        setSelectedChampionId(null);
      }
      return;
    }

    // 計画フェーズ: チャンピオン選択
    if (G.gamePhase === 'planning') {
      const { champion } = getCellContent(x, y);
      if (champion) {
        if (champion.team === myPlayerID) {
          // 自チームのチャンピオンを選択
          setSelectedEnemyChampionId(null);
          if (champion.id === selectedChampionId) {
            setSelectedChampionId(null);
          } else {
            setSelectedChampionId(champion.id);
          }
        } else {
          // 敵チームのチャンピオンを選択（カード確認用）
          setSelectedChampionId(null);
          if (champion.id === selectedEnemyChampionId) {
            setSelectedEnemyChampionId(null);
          } else {
            setSelectedEnemyChampionId(champion.id);
          }
        }
      }
    }

    // 配置フェーズ: 配置するチャンピオンをベンチから選択
    if (isDeployPhase) {
      // ベンチのチャンピオンをクリックした場合
      const { champion } = getCellContent(x, y);
      // ボード上にはいないはずだが、もしクリックできたら...いや、ベンチは別コンポーネント
      // ここはボード上のセルクリックなので、配置フェーズでは配置以外なにもしない
    }
  };

  const handleCardClick = (card: Card, isAlternative = false) => {
    if (G.gamePhase !== 'planning') return;
    if (!selectedChampion) return;
    if (actingChampionIds.includes(selectedChampion.id)) return;

    moves.selectCard(selectedChampion.id, card.id, isAlternative);
    setSelectedChampionId(null);
  };

  const handleGuard = () => {
    if (G.gamePhase !== 'planning') return;
    if (!selectedChampion || selectedChampion.hand.length < 2) return;
    if (actingChampionIds.includes(selectedChampion.id)) return;

    const cardIds: [string, string] = [
      selectedChampion.hand[0].id,
      selectedChampion.hand[1].id
    ];
    moves.guard(selectedChampion.id, cardIds);
    setSelectedChampionId(null);
  };

  const handleCancelAction = (championId: string) => {
    moves.cancelAction(championId);
  };

  const handleConfirmPlan = () => {
    // フィールド上のチャンピオン数に応じて必要なアクション数を計算
    const activeChampionsCount = myPlayerState.champions.filter(c => c.pos !== null).length;
    const requiredActions = Math.min(2, activeChampionsCount);

    if (G.turnActions[myPlayerID].actions.length >= requiredActions) {
      moves.confirmPlan();
    }
  };

  const handleSkipAction = () => {
    moves.skipAction();
  };

  const getChampionDef = (champion: ChampionInstance) => {
    return getChampionById(champion.definitionId);
  };

  return (
    <div className="flex flex-col items-center gap-2 p-2 bg-slate-900 min-h-screen text-white font-sans">
      <h1 className="text-sm font-bold">MOBAボードゲーム</h1>

      {/* ステータスバー */}
      <div className="flex gap-4 items-center text-sm">
        <div className={`font-bold ${myPlayerID === '0' ? 'text-blue-400' : 'text-red-400'}`}>
          {myPlayerID === '0' ? '青チーム' : '赤チーム'}
        </div>
        <div className="text-slate-400">
          フェイズ {G.currentPhase} / ターン {G.turnInPhase}
        </div>
        <div className={`px-2 py-1 rounded text-xs font-bold ${G.gamePhase === 'planning' ? 'bg-blue-600' :
          G.gamePhase === 'resolution' ? 'bg-orange-600' : 'bg-green-600'
          }`}>
          {G.gamePhase === 'planning' ? '計画フェーズ' :
            G.gamePhase === 'resolution' ? '解決フェーズ' : '配置フェーズ'}
        </div>
        {isDeployPhase && (
          <div className="text-yellow-400 font-bold ml-2">
            {isMyDeployTurn ? 'あなたの配置番です' : '相手の配置番です'}
          </div>
        )}
        <div className="ml-auto flex gap-4 font-bold">
          <span className="text-blue-400">青: {G.scores['0']}pt</span>
          <span className="text-red-400">赤: {G.scores['1']}pt</span>
          <span className="text-slate-400 text-xs self-center">（50ptで勝利）</span>
        </div>
      </div>

      {/* 解決フェーズ: ターゲット選択UI */}
      {isResolutionPhase && isAwaitingTarget && resolvingChampion && (resolvingCard || isAlternativeMove) && (
        <div className="bg-orange-900/50 border border-orange-500 rounded-lg p-4 max-w-md text-center">
          <div className="text-orange-300 font-bold mb-2 flex items-center justify-center gap-2">
            <Target size={18} />
            ターゲットを選択してください
          </div>
          <div className="text-white text-sm mb-2">
            {isAlternativeMove ? (
              <>
                {getChampionDef(resolvingChampion)?.nameJa} の <span className="font-bold text-green-300">汎用移動</span>
              </>
            ) : (
              <>
                {getChampionDef(resolvingChampion)?.nameJa} の <span className="font-bold text-yellow-300">{resolvingCard?.nameJa}</span>
              </>
            )}
          </div>
          <div className="flex gap-2 text-xs text-slate-300 justify-center mb-3">
            {isAlternativeMove ? (
              <span className="flex items-center gap-1"><Move size={12} /> 移動: 2マス</span>
            ) : (
              <>
                {resolvingCard && resolvingCard.move > 0 && (
                  <span className="flex items-center gap-1"><Move size={12} /> 移動: {resolvingCard.move}マス</span>
                )}
                {resolvingCard && resolvingCard.power > 0 && (
                  <span className="flex items-center gap-1"><Target size={12} /> 威力: {resolvingCard.power}</span>
                )}
              </>
            )}
          </div>
          <div className="text-xs text-slate-400 mb-2">
            {isAlternativeMove
              ? '緑のマスをクリックして移動先を選択（2マス以内）'
              : (resolvingCard && resolvingCard.isDirectional
                ? '攻撃する方向を選択してください'
                : (resolvingCard && resolvingCard.isSwap
                  ? 'ベンチのチャンピオンをクリックして交代対象を選択'
                  : (resolvingCard && resolvingCard.move > 0
                    ? '緑のマスをクリックして移動先を選択'
                    : '赤い敵をクリックして攻撃対象を選択')))}
          </div>

          {/* 方向指定攻撃の場合: 4方向ボタン */}
          {resolvingCard && resolvingCard.isDirectional && (
            <div className="flex flex-col items-center gap-1 mb-3">
              <button
                className="w-12 h-10 bg-orange-600 hover:bg-orange-500 text-white text-lg font-bold rounded"
                onClick={() => moves.selectTarget(undefined, undefined, undefined, false, { x: 0, y: -1 })}
                title="上方向"
              >↑</button>
              <div className="flex gap-1">
                <button
                  className="w-12 h-10 bg-orange-600 hover:bg-orange-500 text-white text-lg font-bold rounded"
                  onClick={() => moves.selectTarget(undefined, undefined, undefined, false, { x: -1, y: 0 })}
                  title="左方向"
                >←</button>
                <div className="w-12 h-10 flex items-center justify-center text-slate-400">●</div>
                <button
                  className="w-12 h-10 bg-orange-600 hover:bg-orange-500 text-white text-lg font-bold rounded"
                  onClick={() => moves.selectTarget(undefined, undefined, undefined, false, { x: 1, y: 0 })}
                  title="右方向"
                >→</button>
              </div>
              <button
                className="w-12 h-10 bg-orange-600 hover:bg-orange-500 text-white text-lg font-bold rounded"
                onClick={() => moves.selectTarget(undefined, undefined, undefined, false, { x: 0, y: 1 })}
                title="下方向"
              >↓</button>
            </div>
          )}

          <button
            className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded"
            onClick={handleSkipAction}
          >
            スキップ
          </button>
        </div>
      )}

      <div className="flex gap-6">
        {/* ベンチ (味方) */}
        <div className="flex flex-col gap-2 w-32">
          <h3 className="text-sm font-semibold text-slate-400">ベンチ</h3>
          {myBenchChampions.map(champion => {
            const def = getChampionDef(champion);
            const typeConfig = getTypeConfig(champion.currentType);
            return (
              <div
                key={champion.id}
                className={`p-2 rounded border ${champion.knockoutTurnsRemaining > 0
                  ? 'border-red-800 bg-red-950 opacity-50'
                  : selectedChampionId === champion.id
                    ? 'border-yellow-400 bg-yellow-900/50 cursor-pointer ring-2 ring-yellow-400'
                    : isResolutionPhase && isAwaitingTarget && resolvingCard?.isSwap && champion.knockoutTurnsRemaining === 0
                      ? 'border-green-400 bg-green-900/50 cursor-pointer ring-2 ring-green-400 animate-pulse'
                      : 'border-slate-600 bg-slate-800 cursor-pointer hover:bg-slate-700'
                  }`}
                onClick={() => {
                  if (isDeployPhase && isMyDeployTurn && champion.pos === null) {
                    setSelectedChampionId(champion.id);
                  }
                  // 解決フェーズ: 交代先の選択
                  if (isResolutionPhase && isAwaitingTarget && resolvingCard?.isSwap && champion.pos === null) {
                    moves.selectTarget(undefined, champion.id);
                  }
                }}
              >
                <div className={`text-xs font-bold ${typeConfig.color}`}>
                  {def?.nameJa || champion.definitionId}
                </div>
                <div className="text-xs text-slate-400">
                  HP: {champion.currentHp}/{champion.maxHp}
                </div>
                {isDeployPhase && isMyDeployTurn && champion.pos === null && (
                  <div className="text-xs text-yellow-400 font-bold mt-1">選択して配置</div>
                )}
                {champion.knockoutTurnsRemaining > 0 && (
                  <div className="text-xs text-red-400">
                    復活まで {champion.knockoutTurnsRemaining} ターン
                  </div>
                )}
              </div>
            );
          })}

          {/* 選択済み行動一覧 */}
          {G.gamePhase === 'planning' && (
            <>
              <h3 className="text-sm font-semibold text-slate-400 mt-4">選択済み行動</h3>
              {G.turnActions[myPlayerID].actions.map((action, idx) => {
                const champion = myPlayerState.champions.find(c => c.id === action.championId);
                if (!champion) return null;
                const def = getChampionDef(champion);

                let actionText = '';
                if ('discardCardIds' in action) {
                  actionText = 'ガード';
                } else {
                  const card = champion.hand.find(c => c.id === action.cardId);
                  if (action.isAlternativeMove) {
                    actionText = `${card?.nameJa || 'カード'} (1マス移動)`;
                  } else {
                    actionText = card?.nameJa || 'カード';
                  }
                }

                return (
                  <div key={idx} className="flex items-center gap-1 text-xs bg-green-900/30 rounded p-1">
                    <Check size={12} className="text-green-400" />
                    <span className="text-green-300">{def?.nameJa}: {actionText}</span>
                    <button
                      className="ml-auto text-red-400 hover:text-red-300"
                      onClick={() => handleCancelAction(action.championId)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* ゲームボード */}
        <div
          className="grid gap-0.5 bg-slate-800 p-2 rounded-lg"
          style={{
            gridTemplateColumns: `repeat(${BOARD_SIZE}, 56px)`,
            gridTemplateRows: `repeat(${BOARD_SIZE}, 56px)`
          }}
        >
          {Array.from({ length: BOARD_SIZE }).map((_, y) => (
            Array.from({ length: BOARD_SIZE }).map((_, x) => {
              const { champion, territoryOwner } = getCellContent(x, y);
              const isSelected = champion?.id === selectedChampionId;
              const isSelectedEnemy = champion?.id === selectedEnemyChampionId;
              const isActing = champion && actingChampionIds.includes(champion.id);

              // 解決フェーズのハイライト
              const isMoveTarget = validMoveTargetsMap.has(`${x},${y}`);
              const isAttackTarget = validAttackTargets.some(t => t.pos && t.pos.x === x && t.pos.y === y);
              const isResolvingChamp = resolvingChampion && champion && resolvingChampion.id === champion.id;

              // 経路プレビュー（ホバー中の経路上にあるか）
              const isOnHoveredPath = hoveredPath.some(p => p.x === x && p.y === y);
              const isHoveredTarget = hoveredMovePos?.x === x && hoveredMovePos?.y === y;

              // 配置フェーズのハイライト
              const isSpawnable = spawnablePositions.some(p => p.x === x && p.y === y);

              let bgClass = 'bg-slate-700 hover:bg-slate-600';
              if (isSelected) bgClass = 'bg-yellow-900 ring-2 ring-yellow-400';
              if (isSelectedEnemy) bgClass = 'bg-red-900 ring-2 ring-red-400';
              if (isActing && champion?.team === myPlayerID && G.gamePhase === 'planning') bgClass = 'bg-green-900 ring-1 ring-green-400';

              // 経路プレビュー表示（ホバー中の移動先への経路をハイライト）
              if (isOnHoveredPath && !isHoveredTarget) bgClass = 'bg-cyan-600/60 ring-1 ring-cyan-400';
              if (isMoveTarget) bgClass = 'bg-green-700/50 ring-2 ring-green-400 cursor-pointer';
              if (isHoveredTarget) bgClass = 'bg-green-500/70 ring-2 ring-green-300 cursor-pointer';
              if (isAttackTarget) bgClass = 'bg-red-700/50 ring-2 ring-red-400 cursor-pointer';
              if (isResolvingChamp) bgClass = 'bg-orange-800 ring-2 ring-orange-400';

              if (isSpawnable && selectedChampionId) bgClass = 'bg-blue-700/50 ring-2 ring-blue-400 cursor-pointer';

              return (
                <div
                  key={`${x}-${y}`}
                  className={`w-10 h-10 flex items-center justify-center border border-slate-600/30 relative cursor-pointer ${bgClass}`}
                  onClick={() => handleCellClick(x, y)}
                  onMouseEnter={() => isMoveTarget ? setHoveredMovePos({ x, y }) : null}
                  onMouseLeave={() => setHoveredMovePos(null)}
                >
                  {/* 陣地カラー表示 */}
                  {territoryOwner === '0' && <div className="absolute inset-0 bg-blue-700/70 pointer-events-none"></div>}
                  {territoryOwner === '1' && <div className="absolute inset-0 bg-red-700/70 pointer-events-none"></div>}

                  {/* Admin Domain (中央3x3) ハイライト */}
                  {x >= 5 && x <= 7 && y >= 5 && y <= 7 && (
                    <div className="absolute inset-0 border border-yellow-500/30 pointer-events-none"></div>
                  )}

                  {champion && (
                    <div className={`flex flex-col items-center z-10 ${champion.team === '0' ? 'text-blue-400' : 'text-red-400'}`}>
                      <div className="relative">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${champion.team === '0' ? 'bg-blue-600' : 'bg-red-600'
                          }`}>
                          {getChampionDef(champion)?.nameJa.charAt(0) || '?'}
                        </div>
                        <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center ${getTypeConfig(champion.currentType).bgColor}`}>
                          {getTypeConfig(champion.currentType).icon}
                        </div>
                        {champion.isGuarding && (
                          <div className="absolute -bottom-1 -right-1 text-yellow-400">
                            <Shield size={12} />
                          </div>
                        )}
                        {isActing && champion.team === myPlayerID && G.gamePhase === 'planning' && (
                          <div className="absolute -bottom-1 -left-1 bg-green-500 rounded-full p-0.5">
                            <Check size={8} className="text-white" />
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-bold">{champion.currentHp}</span>
                    </div>
                  )}

                  <span className="absolute bottom-0 right-0.5 text-[8px] text-slate-500">{x},{y}</span>

                  {/* ブロック障害物表示 */}
                  {G.blocks
                    ?.filter(b => b.x === x && b.y === y)
                    .map((block, idx) => (
                      <div
                        key={`block-${idx}`}
                        className={`absolute inset-1 rounded flex items-center justify-center z-15
                          ${block.maxHp === 1 ? 'bg-amber-600 border-amber-400' : 'bg-stone-500 border-stone-400'}
                          border-2 shadow-lg`}
                        title={`ブロック HP: ${block.hp}/${block.maxHp}`}
                      >
                        <span className="text-white text-sm font-bold">{block.hp}</span>
                      </div>
                    ))
                  }
                  {G.pointTokens
                    ?.filter(t => t.x === x && t.y === y)
                    .map((token, idx) => (
                      <div
                        key={`point-${idx}`}
                        className={`absolute z-20 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shadow-lg ${token.value >= 5
                          ? 'bg-red-500 text-white animate-pulse ring-2 ring-red-300'
                          : 'bg-yellow-400 text-black'
                          }`}
                        style={{ top: '2px', left: '2px' }}
                        title={`${token.value}pt`}
                      >
                        {token.value}
                      </div>
                    ))
                  }

                  {/* 予告ポイントトークン表示（次ターンで出現予定） */}
                  {G.pendingPointTokens
                    ?.filter(t => t.x === x && t.y === y)
                    .map((token, idx) => (
                      <div
                        key={`pending-point-${idx}`}
                        className={`absolute z-20 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shadow-lg opacity-50 animate-pulse border-2 border-dashed ${token.value >= 5
                          ? 'bg-red-500/50 text-white border-red-300'
                          : 'bg-yellow-400/50 text-black border-yellow-600'
                          }`}
                        style={{ top: '2px', left: '2px' }}
                        title={`次ターン: ${token.value}pt 出現予定`}
                      >
                        ?
                      </div>
                    ))
                  }

                  {/* ダメージポップアップ */}
                  {visibleDamageEvents
                    .filter(e => e.x === x && e.y === y)
                    .map(event => (
                      <div
                        key={event.id}
                        className="damage-popup absolute inset-0 flex flex-col items-center justify-center z-50 pointer-events-none"
                      >
                        <span className="text-lg font-bold text-red-400 drop-shadow-lg">
                          -{event.amount}
                        </span>
                        {event.effectiveness && (
                          <span className="text-[10px] text-yellow-300 font-bold">
                            {event.effectiveness}
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              );
            })
          ))}
        </div>

        {/* カード選択パネル */}
        <div className="flex flex-col gap-2 w-48">
          {G.gamePhase === 'planning' && (
            <>
              <h3 className="text-sm font-semibold text-slate-400">
                {selectedChampion ? `${getChampionDef(selectedChampion)?.nameJa} の手札` : 'チャンピオンを選択'}
              </h3>

              {selectedChampion && (
                <>
                  {actingChampionIds.includes(selectedChampion.id) ? (
                    <div className="text-green-400 text-sm p-2 bg-green-900/30 rounded flex items-center gap-2">
                      <Check size={14} />
                      行動選択済み
                    </div>
                  ) : (
                    <>
                      {selectedChampion.hand.map(card => {
                        const typeConfig = getTypeConfig(card.type);
                        return (
                          <div
                            key={card.id}
                            className="flex items-stretch gap-1 mb-2"
                          >
                            {/* 通常使用ボタン（カード本体） */}
                            <div
                              className="flex-1 p-2 rounded border cursor-pointer transition-all border-slate-600 bg-slate-800 hover:bg-slate-700 hover:border-yellow-400 group"
                              onClick={() => handleCardClick(card, false)}
                            >
                              <div className="flex items-center gap-1">
                                <div className={`${typeConfig.bgColor} rounded px-1 py-0.5 flex items-center gap-0.5`}>
                                  {typeConfig.icon}
                                  <span className="text-[10px] text-white">{card.priority}</span>
                                </div>
                                <span className="text-xs font-bold group-hover:text-yellow-200">{card.nameJa}</span>
                              </div>
                              <div className="flex gap-2 text-[10px] text-slate-400 mt-1">
                                {card.power > 0 && <span>威力:{card.power}</span>}
                                {card.move > 0 && <span>移動:{card.move}</span>}
                                {card.power > 0 && <span className="text-orange-300">範囲:{card.attackRange ?? (card.move > 0 ? 1 : 2)}</span>}
                              </div>
                            </div>

                            {/* 代替アクション（移動）ボタン */}
                            <button
                              className="w-10 flex items-center justify-center rounded border border-slate-600 bg-slate-700 text-green-500 hover:bg-green-700 hover:border-green-400 hover:text-white transition-all shadow-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCardClick(card, true);
                              }}
                              title="代替アクション: 上下左右に1マス移動"
                            >
                              <Move size={20} />
                            </button>
                          </div>
                        );
                      })}

                      {selectedChampion.hand.length >= 2 && (
                        <button
                          className="p-2 rounded border border-yellow-600 bg-yellow-900/30 hover:bg-yellow-900/50 text-yellow-400 text-sm flex items-center justify-center gap-1"
                          onClick={handleGuard}
                        >
                          <Shield size={14} />
                          ガード
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}

          {G.gamePhase === 'resolution' && (
            <>
              <h3 className="text-sm font-semibold text-orange-400">選択された行動（優先度順）</h3>
              {G.pendingActions.length > 0 || G.currentResolvingAction ? (
                <div className="space-y-2">
                  {/* 現在解決中のアクション */}
                  {G.currentResolvingAction && (() => {
                    const action = G.currentResolvingAction;
                    const champ = G.players[action.team].champions.find(c => c.id === action.championId);
                    if (!champ) return null;
                    const isGuard = 'discardCardIds' in action.action;
                    const card = !isGuard ? champ.hand.find(c => c.id === (action.action as any).cardId) : null;
                    const isAltMove = !isGuard && (action.action as any).isAlternativeMove;
                    const isMyTeam = action.team === myPlayerID;
                    const champDef = getChampionDef(champ);
                    const typeConfig = card ? getTypeConfig(card.type) : null;
                    return (
                      <div className={`p-2 rounded border ${isMyTeam ? 'border-blue-500 bg-blue-900/30' : 'border-red-500 bg-red-900/30'} ring-2 ring-orange-400`}>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${isMyTeam ? 'text-blue-300' : 'text-red-300'}`}>
                            {champDef?.nameJa || champ.definitionId}
                          </span>
                          <span className="text-[10px] text-orange-300">▶ 実行中</span>
                        </div>
                        {isGuard ? (
                          <div className="text-xs text-yellow-400 flex items-center gap-1 mt-1">
                            <Shield size={12} /> ガード
                          </div>
                        ) : isAltMove ? (
                          <div className="flex items-center gap-1 mt-1">
                            <Move size={12} className="text-green-400" />
                            <span className="text-xs text-green-300">汎用移動（2マス）</span>
                          </div>
                        ) : card && (
                          <div className="flex items-center gap-1 mt-1">
                            <div className={`${typeConfig?.bgColor} rounded px-1 py-0.5 flex items-center gap-0.5`}>
                              {typeConfig?.icon}
                              <span className="text-[10px] text-white">{card.priority}</span>
                            </div>
                            <span className="text-xs text-white">{card.nameJa}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {/* 待機中のアクション */}
                  {G.pendingActions.map((pending, idx) => {
                    const champ = G.players[pending.team].champions.find(c => c.id === pending.championId);
                    if (!champ) return null;
                    const isGuard = 'discardCardIds' in pending.action;
                    const card = !isGuard ? champ.hand.find(c => c.id === (pending.action as any).cardId) : null;
                    const isAltMove = !isGuard && (pending.action as any).isAlternativeMove;
                    const isMyTeam = pending.team === myPlayerID;
                    const champDef = getChampionDef(champ);
                    const typeConfig = card ? getTypeConfig(card.type) : null;
                    return (
                      <div key={idx} className={`p-2 rounded border ${isMyTeam ? 'border-blue-500 bg-blue-900/30' : 'border-red-500 bg-red-900/30'}`}>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${isMyTeam ? 'text-blue-300' : 'text-red-300'}`}>
                            {champDef?.nameJa || champ.definitionId}
                          </span>
                        </div>
                        {isGuard ? (
                          <div className="text-xs text-yellow-400 flex items-center gap-1 mt-1">
                            <Shield size={12} /> ガード
                          </div>
                        ) : isAltMove ? (
                          <div className="flex items-center gap-1 mt-1">
                            <Move size={12} className="text-green-400" />
                            <span className="text-xs text-green-300">汎用移動（2マス）</span>
                          </div>
                        ) : card && (
                          <div className="flex items-center gap-1 mt-1">
                            <div className={`${typeConfig?.bgColor} rounded px-1 py-0.5 flex items-center gap-0.5`}>
                              {typeConfig?.icon}
                              <span className="text-[10px] text-white">{card.priority}</span>
                            </div>
                            <span className="text-xs text-white">{card.nameJa}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-slate-400 text-sm p-2 bg-slate-800 rounded">
                  すべての行動が完了しました
                </div>
              )}
            </>
          )}

          {/* 計画フェーズ: 敵チャンピオンのカード表示 */}
          {G.gamePhase === 'planning' && selectedEnemyChampionId && (() => {
            const enemyChamp = G.players[enemyTeam].champions.find(c => c.id === selectedEnemyChampionId);
            if (!enemyChamp) return null;
            const champDef = getChampionDef(enemyChamp);
            return (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-red-400">
                  {champDef?.nameJa || enemyChamp.definitionId} の手札（敵）
                </h3>
                <div className="space-y-1 mt-2">
                  {enemyChamp.hand.map(card => {
                    const typeConfig = getTypeConfig(card.type);
                    return (
                      <div key={card.id} className="p-2 rounded border border-red-800/50 bg-red-950/30">
                        <div className="flex items-center gap-1">
                          <div className={`${typeConfig.bgColor} rounded px-1 py-0.5 flex items-center gap-0.5`}>
                            {typeConfig.icon}
                            <span className="text-[10px] text-white">{card.priority}</span>
                          </div>
                          <span className="text-xs text-red-200 font-bold">{card.nameJa}</span>
                        </div>
                        <div className="flex gap-2 text-[10px] text-red-400/80 mt-1">
                          {card.power > 0 && <span>威力:{card.power}</span>}
                          {card.move > 0 && <span>移動:{card.move}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* コミットボタン */}
      {G.gamePhase === 'planning' && (() => {
        const activeChampionsCount = myPlayerState.champions.filter(c => c.pos !== null).length;
        const requiredActions = Math.min(2, activeChampionsCount);
        return (
          <div className="flex gap-4 items-center mt-2">
            <button
              className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded shadow disabled:opacity-50"
              onClick={handleConfirmPlan}
              disabled={G.turnActions[myPlayerID].actions.length < requiredActions}
            >
              計画確定 ({G.turnActions[myPlayerID].actions.length}/{requiredActions})
            </button>
          </div>
        );
      })()}

      {/* バトルログ */}
      <div className="w-full max-w-3xl bg-slate-800 p-4 rounded mt-2 h-40 overflow-y-auto">
        <h3 className="text-slate-400 text-sm mb-2 uppercase tracking-wider">バトルログ</h3>
        {G.turnLog.slice().reverse().slice(0, 30).map((log, i) => (
          <div key={i} className={`text-xs border-b border-slate-700 py-1 last:border-0 ${log.includes('[あなたの番]') ? 'text-orange-300 font-bold' : 'text-slate-300'
            }`}>
            {log}
          </div>
        ))}
      </div>
    </div>
  );
}
