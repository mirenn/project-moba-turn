'use client';
import React, { useState, useEffect, useRef } from 'react';
import { BoardProps } from 'boardgame.io/react';
import { GameState, Team, ChampionInstance, Card, Position, DamageEvent, Block, PointEvent, ResourceEvent } from '../game/types';
import { getChampionById } from '../game/champions';
import { findReachablePositionsWithPath } from '../game/Game';
import { Shield, Zap, Flame, Droplets, Bug, Moon, Cog, Check, X, Target, Move, ShoppingCart } from 'lucide-react';
import { ChampionIcon } from './champions/ChampionIcon';
import { AttackEffect } from './effects/AttackEffect';

type Props = BoardProps<GameState>;

const BOARD_SIZE = 12;

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
  const [visiblePointEvents, setVisiblePointEvents] = useState<PointEvent[]>([]);
  const [visibleResourceEvents, setVisibleResourceEvents] = useState<ResourceEvent[]>([]);
  const [hoveredMovePos, setHoveredMovePos] = useState<Position | null>(null); // 経路プレビュー用
  const [selectedDeployChampionId, setSelectedDeployChampionId] = useState<string | null>(null); // 配置フェーズ用
  const processedEventIdsRef = useRef<Set<string>>(new Set());
  const processedPointEventIdsRef = useRef<Set<string>>(new Set());
  const processedResourceEventIdsRef = useRef<Set<string>>(new Set());

  const myPlayerID = (playerID || '0') as Team;
  const myPlayerState = G.players[myPlayerID];
  const enemyTeam = myPlayerID === '0' ? '1' : '0';

  const myFieldChampions = myPlayerState.champions.filter(c => c.pos !== null);
  const myBenchChampions = myPlayerState.champions.filter(c => c.pos === null);

  const selectedChampion = selectedChampionId
    ? myPlayerState.champions.find(c => c.id === selectedChampionId)
    : null;

  const actingChampionIds = G.turnActions[myPlayerID].actions.map(a => a.championId);


  // 解決フェーズ用の状態
  const isResolutionPhase = G.gamePhase === 'resolution';
  const isAwaitingTarget = G.awaitingTargetSelection;
  const currentAction = G.currentResolvingAction;

  // 現在解決中のチャンピオンとカード
  const resolvingChampion = currentAction
    ? G.players[currentAction.team].champions.find(c => c.id === currentAction.championId)
    : null;
  const resolvingCard = resolvingChampion && currentAction && !('discardCardIds' in currentAction.action)
    ? resolvingChampion.cards.find(c => c.id === (currentAction.action as any).cardId)
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

  // ポイントイベントの処理（アニメーション用）
  useEffect(() => {
    if (!G.pointEvents || G.pointEvents.length === 0) return;

    // 新しいポイントイベントを処理
    const newEvents: PointEvent[] = [];

    for (const event of G.pointEvents) {
      if (processedPointEventIdsRef.current.has(event.id)) continue;
      processedPointEventIdsRef.current.add(event.id);
      newEvents.push(event);
    }

    if (newEvents.length > 0) {
      setVisiblePointEvents(prev => [...prev, ...newEvents]);

      // 1.5秒後にイベントを削除
      const eventIds = newEvents.map(e => e.id);
      setTimeout(() => {
        setVisiblePointEvents(prev => prev.filter(e => !eventIds.includes(e.id)));
      }, 1500);
    }
  }, [G.pointEvents]);

  // 資源獲得イベントの処理（アニメーション用）
  useEffect(() => {
    // GameState.ts側で resourceEvents が追加された以降のデータ用
    if (!G.resourceEvents || G.resourceEvents.length === 0) return;

    // 新しい資源イベントを処理
    const newEvents: ResourceEvent[] = [];

    for (const event of G.resourceEvents) {
      if (processedResourceEventIdsRef.current.has(event.id)) continue;
      processedResourceEventIdsRef.current.add(event.id);
      newEvents.push(event);
    }

    if (newEvents.length > 0) {
      setVisibleResourceEvents(prev => [...prev, ...newEvents]);

      // 2秒後にイベントを削除 (少し長めに見せる)
      const eventIds = newEvents.map(e => e.id);
      setTimeout(() => {
        setVisibleResourceEvents(prev => prev.filter(e => !eventIds.includes(e.id)));
      }, 2000);
    }
  }, [G.resourceEvents]);

  // Antigravityモードの処理（状態のエクスポートと手番のロード）
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    // Antigravityの行動待ち状態に入ったとき
    if (G.aiMode === 'antigravity' && (G.antigravityState === 'waiting_for_move' || G.antigravityState === 'waiting_for_action_target')) {
      const exportState = async () => {
        try {
          const res = await fetch('/api/antigravity/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(G)
          });
          if (res.ok) {
            console.log(`[DEBUG] GameState exported for Antigravity (${G.antigravityState})`);
          }
        } catch (e) {
          console.error('Failed to export state:', e);
        }
      };

      const checkMove = async () => {
        try {
          const res = await fetch('/api/antigravity/move');
          const data = await res.json();
          if (data.status === 'success' && data.data) {
            console.log(`[DEBUG] Antigravity response received (${G.antigravityState}):`, data.data);
            if (G.antigravityState === 'waiting_for_move') {
              movesRef.current.submitAntigravityAction(data.data);
            } else if (G.antigravityState === 'waiting_for_action_target') {
              movesRef.current.submitAntigravityTarget(data.data);
            }
            return; // ポーリング終了
          }
        } catch (e) {
          console.error('Failed to check move/target:', e);
        }

        // まだ行動がない場合は1秒後に再チェック
        timeoutId = setTimeout(checkMove, 1000);
      };

      // 1. 状態をエクスポート
      exportState().then(() => {
        // 2. 0.5秒後から行動のポーリングを開始
        timeoutId = setTimeout(checkMove, 500);
      });
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [G.aiMode, G.antigravityState, G]);

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

  // 攻撃可能な敵（チャンピオン・ブロック）を計算
  const getValidAttackTargets = (): (ChampionInstance | Block)[] => {
    if (!resolvingChampion || !resolvingChampion.pos || !resolvingCard) return [];
    if (resolvingCard.power <= 0) return [];

    const pendingMovePos = (currentAction?.action as any)?.targetPos;
    const sourcePos = pendingMovePos || resolvingChampion.pos;

    let attackRange = resolvingCard.attackRange ?? (resolvingCard.move > 0 ? 1 : 2);
    if (resolvingCard.move > 0 && !resolvingCard.attackRange) {
      attackRange = pendingMovePos ? 1 : 3;
    }

    const targets: (ChampionInstance | Block)[] = [];

    // 敵チャンピオン
    const enemies = G.players[enemyTeam].champions.filter(c => c.pos !== null);
    enemies.forEach(enemy => {
      if (enemy.pos && sourcePos && getDistance(sourcePos, enemy.pos) <= attackRange) {
        targets.push(enemy);
      }
    });

    // ブロック（障害物）も攻撃対象に含める
    G.blocks.forEach(block => {
      if (sourcePos && getDistance(sourcePos, { x: block.x, y: block.y }) <= attackRange) {
        targets.push(block);
      }
    });

    return targets;
  };



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
      // Antigravity AIモードかつ、現在解決中のチャンピオンがAI側（チーム1）の場合は
      // プレイヤーのクリック操作を受け付けない
      if (G.aiMode === 'antigravity' && resolvingChampion?.team === '1') {
        return;
      }

      const { champion } = getCellContent(x, y);

      // 移動先として選択
      const isMoveTarget = validMoveTargetsMap.has(`${x},${y}`);
      if (isMoveTarget) {
        // 移動先を選択
        // 攻撃対象はここでは設定せず、サーバー側の待機ロジックとクライアントの2段階クリックに任せる
        moves.selectTarget({ x, y }, undefined, undefined);
        return;
      }

      // 攻撃対象として選択（チャンピオンまたはブロック）
      // 移動ありカードの場合でも、移動先決定後(=validAttackTargetsが更新された後)ならここで選択可能
      const targetEnemy = validAttackTargets.find(t => {
        if ('definitionId' in t) { // ChampionInstanceの場合
          return t.pos?.x === x && t.pos?.y === y;
        } else { // Blockの場合
          return t.x === x && t.y === y;
        }
      });

      if (targetEnemy) {
        if ('definitionId' in targetEnemy) {
          // チャンピオンをターゲット
          moves.selectTarget(undefined, targetEnemy.id, undefined);
        } else {
          // ブロックをターゲット（ChampionIdなしでattackTargetPosを渡す）
          // 引数順: targetPos, targetChampionId, skipAttack, attackDirection, attackTargetPos
          moves.selectTarget(undefined, undefined, undefined, undefined, { x, y });
        }
        return;
      }

      return;
    }

    // 配置フェーズ: マスをクリックしてチャンピオンを配置
    if (G.gamePhase === 'deploy') {
      if (selectedDeployChampionId) {
        moves.deployChampion(selectedDeployChampionId, { x, y });
        setSelectedDeployChampionId(null);
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
  };

  const handleCardClick = (card: Card, isAlternative = false, isAlternativePurchase = false) => {
    if (G.gamePhase !== 'planning') return;
    if (!selectedChampion) return;
    if (actingChampionIds.includes(selectedChampion.id)) return;

    moves.selectCard(selectedChampion.id, card.id, isAlternative, isAlternativePurchase);
    setSelectedChampionId(null);
  };

  const handleGuard = () => {
    if (G.gamePhase !== 'planning') return;
    const availableCards = selectedChampion?.cards.filter(c => c.currentCooldown === 0) || [];
    if (!selectedChampion || availableCards.length < 2) return;
    if (actingChampionIds.includes(selectedChampion.id)) return;

    const cardIds: [string, string] = [
      availableCards[0].id,
      availableCards[1].id
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
      <div className="flex gap-4 items-center justify-between w-full max-w-4xl px-4 py-2 bg-slate-800 rounded-lg shadow-md mb-2">
        <div className="flex gap-4 items-center text-sm">
          <div className={`font-bold ${myPlayerID === '0' ? 'text-blue-400' : 'text-red-400'}`}>
            {myPlayerID === '0' ? '青チーム' : '赤チーム'}
          </div>
          <div className="text-slate-400">
            フェイズ {G.currentPhase} / ターン {G.turnInPhase}
          </div>
          <div className={`px-2 py-1 rounded text-xs font-bold ${G.gamePhase === 'deploy' ? 'bg-green-600' : G.gamePhase === 'planning' ? 'bg-blue-600' : 'bg-orange-600'}`}>
            {G.gamePhase === 'deploy' ? '配置フェーズ' : G.gamePhase === 'planning' ? '計画フェーズ' : '解決フェーズ'}
          </div>
        </div>
        <div className="flex gap-3 font-bold items-center">
          <button
            className={`px-3 py-1 rounded text-xs font-bold flex items-center gap-2 transition-colors ${G.aiMode === 'antigravity' ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_10px_rgba(147,51,234,0.5)]' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
            onClick={() => moves.toggleAIMode()}
            title="AIモード設定の切り替え"
          >
            {G.aiMode === 'antigravity' ? '🌌 Antigravity Mode' : '🤖 CPU Mode'}
          </button>

          <div className="flex gap-2 bg-slate-900 px-2 py-1 rounded border border-slate-700 ml-2">
            <span className="text-green-400 text-xs flex items-center gap-1" title="木材">🌲 {myPlayerState.resources.wood}</span>
            <span className="text-stone-400 text-xs flex items-center gap-1" title="石材">⛰️ {myPlayerState.resources.stone}</span>
          </div>
          <span className="text-blue-400 ml-2">
            青: {G.scores['0']}pt
            {G.longestPaintBonusHolder === '0' && <span className="text-xs ml-1" title="ロンゲストペイントボーナス">🌟</span>}
          </span>
          <span className="text-red-400">
            赤: {G.scores['1']}pt
            {G.longestPaintBonusHolder === '1' && <span className="text-xs ml-1" title="ロンゲストペイントボーナス">🌟</span>}
          </span>
          <span className="text-slate-400 text-xs self-center">（50pt勝利）</span>
        </div>
      </div>

      {/* サイコロの出目表示 */}
      {G.resourceRollResult !== null && (
        <div className="text-sm font-bold bg-slate-800 border-2 border-slate-600 px-4 py-1 rounded-full text-yellow-300 flex items-center gap-2 shadow-lg mb-1 animate-pulse">
          <span>🎲 資源ダイス結果:</span>
          <span className="text-lg bg-slate-900 px-2 rounded">{G.resourceRollResult}</span>
        </div>
      )}

      {/* Antigravity 待機モード UI */}
      {G.aiMode === 'antigravity' && (G.antigravityState === 'waiting_for_move' || G.antigravityState === 'waiting_for_action_target') && (
        <div className="bg-purple-900/50 border-2 border-purple-500 rounded-lg p-6 max-w-md text-center shadow-[0_0_20px_rgba(147,51,234,0.3)] my-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-purple-400/20 to-purple-500/10 animate-pulse"></div>
          <div className="relative z-10 flex flex-col items-center gap-3">
            <h2 className="text-xl font-bold text-purple-300 flex items-center gap-2">
              <span className="animate-spin text-purple-400">⚛️</span> {G.antigravityState === 'waiting_for_action_target' ? 'Antigravity ターゲット選択中...' : 'Antigravity 思考中...'}
            </h2>
            <p className="text-sm text-purple-200/80">
              Antigravity AI モデルが次の手を計算しています。ファイルシステム経由でターンデータを同期します。
            </p>
            <div className="flex gap-4 mt-2">
              <div className="text-xs text-slate-400 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700 font-mono">
                antigravity_state.json
              </div>
              <span className="text-slate-500">→</span>
              <div className="text-xs text-slate-400 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700 font-mono">
                antigravity_move.json
              </div>
            </div>

            <div className="flex gap-3 mt-4 w-full">
              <button
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold rounded flex items-center justify-center gap-2 transition-colors"
                onClick={async () => {
                  try {
                    await fetch('/api/antigravity/state', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(G)
                    });
                    alert('State manually exported!');
                  } catch (e) {
                    alert('Failed to export state.');
                  }
                }}
              >
                状態を再エクスポート
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 配置フェーズUI */}
      {G.gamePhase === 'deploy' && (() => {
        const undeployedChampions = myPlayerState.champions.filter(c => c.pos === null).slice(0, 3 - myPlayerState.champions.filter(c => c.pos !== null).length + myPlayerState.champions.filter(c => c.pos === null).length).filter((_, i) => {
          // ベンチ(4体目)は配置不可なので最初の3体のみ表示
          return true;
        });
        const deployableChampions = myPlayerState.champions.filter((c, idx) => idx < 3); // 最初の3体が配置対象
        const deployedCount = myPlayerState.champions.filter(c => c.pos !== null).length;
        const isMyTurn = G.currentDeployTeam === myPlayerID;

        return (
          <div className={`p-4 max-w-lg text-center rounded-lg border ${isMyTurn ? 'bg-green-900/50 border-green-500' : 'bg-slate-800 border-slate-600'}`}>
            <div className={`font-bold mb-3 text-lg ${isMyTurn ? 'text-green-300' : 'text-slate-400'}`}>
              🏁 配置フェーズ {isMyTurn ? '- 🎯 あなたの番です' : '- ⏳ 相手の配置を待機中...'}
            </div>
            <div className={`text-sm mb-3 ${isMyTurn ? 'text-slate-300' : 'text-slate-500'}`}>
              {isMyTurn
                ? `チャンピオンを選んでボード上をクリックして配置してください（${deployedCount}/3体配置済み）`
                : '相手がチャンピオンを配置するのを待っています...'}
            </div>
            <div className={`flex gap-2 justify-center mb-3 flex-wrap ${!isMyTurn && 'opacity-50 pointer-events-none'}`}>
              {deployableChampions.map(champion => {
                const def = getChampionDef(champion);
                const isDeployed = champion.pos !== null;
                const isSelected = selectedDeployChampionId === champion.id;

                return (
                  <div
                    key={champion.id}
                    className={`p-2 rounded border cursor-pointer transition-all min-w-[100px] ${isDeployed
                        ? 'border-green-400 bg-green-900/70'
                        : isSelected
                          ? 'border-yellow-400 bg-yellow-900/50 ring-2 ring-yellow-400 scale-105'
                          : 'border-slate-600 bg-slate-800 hover:bg-slate-700 hover:border-slate-400'
                      }`}
                    onClick={() => {
                      if (isDeployed) {
                        moves.undeployChampion(champion.id);
                      } else {
                        setSelectedDeployChampionId(isSelected ? null : champion.id);
                      }
                    }}
                  >
                    <div className="flex items-center gap-1 justify-center">
                      <div className="w-6 h-6">
                        <ChampionIcon championId={champion.definitionId} isEnemy={false} />
                      </div>
                      <span className="text-xs font-bold">{def?.nameJa}</span>
                    </div>
                    <div className="text-[10px] mt-1">
                      {isDeployed ? (
                        <span className="text-green-400">✓ ({champion.pos!.x}, {champion.pos!.y}) <span className="text-red-400 hover:text-red-300">×取消</span></span>
                      ) : isSelected ? (
                        <span className="text-yellow-300">マスをクリック</span>
                      ) : (
                        <span className="text-slate-400">クリックで選択</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

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
          {resolvingCard && resolvingCard.isDirectional && !isAlternativeMove && !(G.aiMode === 'antigravity' && resolvingChampion.team === '1') && (
            <div className="flex flex-col items-center gap-1 mb-3">
              <button
                className="w-12 h-10 bg-orange-600 hover:bg-orange-500 text-white text-lg font-bold rounded"
                onClick={() => moves.selectTarget(undefined, undefined, undefined, { x: 0, y: -1 })}
                title="上方向"
              >↑</button>
              <div className="flex gap-1">
                <button
                  className="w-12 h-10 bg-orange-600 hover:bg-orange-500 text-white text-lg font-bold rounded"
                  onClick={() => moves.selectTarget(undefined, undefined, undefined, { x: -1, y: 0 })}
                  title="左方向"
                >←</button>
                <div className="w-12 h-10 flex items-center justify-center text-slate-400">●</div>
                <button
                  className="w-12 h-10 bg-orange-600 hover:bg-orange-500 text-white text-lg font-bold rounded"
                  onClick={() => moves.selectTarget(undefined, undefined, undefined, { x: 1, y: 0 })}
                  title="右方向"
                >→</button>
              </div>
              <button
                className="w-12 h-10 bg-orange-600 hover:bg-orange-500 text-white text-lg font-bold rounded"
                onClick={() => moves.selectTarget(undefined, undefined, undefined, { x: 0, y: 1 })}
                title="下方向"
              >↓</button>
            </div>
          )}

          {!(G.aiMode === 'antigravity' && resolvingChampion.team === '1') && (
            <button
              className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded"
              onClick={handleSkipAction}
            >
              スキップ
            </button>
          )}
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
                  // 解決フェーズ: 交代先の選択
                  if (isResolutionPhase && isAwaitingTarget && resolvingCard?.isSwap && champion.pos === null) {
                    moves.selectTarget(undefined, champion.id);
                  }
                }}
              >
                <div className={`text-xs font-bold flex items-center gap-1 ${typeConfig.color}`}>
                  <div className={`w-5 h-5 flex-shrink-0 ${champion.team === '1' ? 'scale-x-[-1]' : ''}`}>
                    <ChampionIcon championId={champion.definitionId} isEnemy={champion.team !== myPlayerID} />
                  </div>
                  {def?.nameJa || champion.definitionId}
                </div>
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <span>HP: {champion.currentHp}/{champion.maxHp}</span>
                  <span title="素早さ (行動順に影響)">速:{def?.speed}</span>
                </div>

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
                  const card = champion.cards.find(c => c.id === action.cardId);
                  if ('isAlternativePurchase' in action && action.isAlternativePurchase) {
                    actionText = `${card?.nameJa || 'カード'} (代替購入)`;
                  } else if (action.isAlternativeMove) {
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
          className="grid gap-0 bg-slate-800 p-2 rounded-lg"
          style={{
            gridTemplateColumns: `repeat(${BOARD_SIZE}, 44px)`,
            gridTemplateRows: `repeat(${BOARD_SIZE}, 44px)`
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
              const isAttackTarget = validAttackTargets.some(t => {
                if ('definitionId' in t) {
                  return t.pos && t.pos.x === x && t.pos.y === y;
                } else {
                  return t.x === x && t.y === y;
                }
              });
              const isResolvingChamp = resolvingChampion && champion && resolvingChampion.id === champion.id;

              // 経路プレビュー（ホバー中の経路上にあるか）
              const isOnHoveredPath = hoveredPath.some(p => p.x === x && p.y === y);
              const isHoveredTarget = hoveredMovePos?.x === x && hoveredMovePos?.y === y;


              let bgClass = 'bg-slate-700 hover:bg-slate-600';

              // 配置フェーズ: 配置可能マスをハイライト
              const isDeployTarget = G.gamePhase === 'deploy' && selectedDeployChampionId && !champion &&
                !(x >= 5 && x <= 7 && y >= 5 && y <= 7) && // Admin Domain除外
                !G.blocks.some(b => b.x === x && b.y === y); // ブロック除外
              if (isDeployTarget) bgClass = 'bg-green-700/30 ring-1 ring-green-500/50 cursor-pointer hover:bg-green-600/50';

              if (isSelected) bgClass = 'bg-yellow-900 ring-2 ring-yellow-400';
              if (isSelectedEnemy) bgClass = 'bg-red-900 ring-2 ring-red-400';
              if (isActing && champion?.team === myPlayerID && G.gamePhase === 'planning') bgClass = 'bg-green-900 ring-1 ring-green-400';

              // 移動先候補（緑の枠）
              if (isMoveTarget) bgClass = 'bg-green-700/50 ring-2 ring-green-400 cursor-pointer';
              if (isHoveredTarget) bgClass = 'bg-green-500/70 ring-2 ring-green-300 cursor-pointer';
              if (isAttackTarget) bgClass = 'bg-red-700/50 ring-2 ring-red-400 cursor-pointer';
              if (isResolvingChamp) bgClass = 'bg-orange-800 ring-2 ring-orange-400';

              return (
                <div
                  key={`${x}-${y}`}
                  className={`w-10 h-10 flex items-center justify-center relative cursor-pointer ${bgClass}`}
                  onClick={() => handleCellClick(x, y)}
                  onMouseEnter={() => isMoveTarget ? setHoveredMovePos({ x, y }) : null}
                  onMouseLeave={() => setHoveredMovePos(null)}
                >
                  {/* 陣地カラー表示 */}
                  {territoryOwner === '0' && <div className="absolute inset-0 bg-blue-700/70 pointer-events-none"></div>}
                  {territoryOwner === '1' && <div className="absolute inset-0 bg-red-700/70 pointer-events-none"></div>}

                  {/* 経路プレビュー表示（ホバー中の移動先への経路を白い枠で表示） */}
                  {isOnHoveredPath && !isHoveredTarget && (
                    <div className="absolute inset-0 border-2 border-white z-30 pointer-events-none"></div>
                  )}

                  {/* Admin Domain (中央3x3) ハイライト */}
                  {x >= 5 && x <= 7 && y >= 5 && y <= 7 && (
                    <div className="absolute inset-0 border border-yellow-500/30 pointer-events-none"></div>
                  )}

                  {champion && (() => {
                    const isTakingDamage = visibleDamageEvents.some(e => e.x === x && e.y === y);
                    const isCurrentlyAttacking = isResolvingChamp && G.currentResolvingAction &&
                      (('cardId' in G.currentResolvingAction.action && G.currentResolvingAction.action.cardId) ||
                        ('isAlternativeMove' in G.currentResolvingAction.action));

                    let animationClass = 'animate-champion-idle';
                    if (isTakingDamage) {
                      animationClass = 'animate-champion-hurt';
                    } else if (isCurrentlyAttacking) {
                      animationClass = 'animate-champion-attack';
                    }

                    return (
                      <div className={`flex flex-col items-center z-10 ${champion.team === '0' ? 'text-blue-400' : 'text-red-400'} ${animationClass}`}>
                        <div className="relative">
                          <div className={`w-9 h-9 ${champion.team === '1' ? 'scale-x-[-1]' : ''}`}>
                            <ChampionIcon championId={champion.definitionId} isEnemy={champion.team !== myPlayerID} />
                          </div>
                          {champion.isAwakened && (
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[20px] drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] z-20 animate-bounce" title="賞金首 (覚醒)">
                              👑
                            </div>
                          )}
                          <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center ${getTypeConfig(champion.currentType).bgColor} shadow-sm border border-slate-700`}>
                            {getTypeConfig(champion.currentType).icon}
                          </div>
                          {champion.isGuarding && (
                            <div className="absolute -bottom-1 -right-1 text-yellow-400 drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]">
                              <Shield size={12} fill="currentColor" />
                            </div>
                          )}
                          {isActing && champion.team === myPlayerID && G.gamePhase === 'planning' && (
                            <div className="absolute -bottom-1 -left-1 bg-green-500 rounded-full p-0.5 drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]">
                              <Check size={8} className="text-white" />
                            </div>
                          )}
                          {(!isActing) && G.gamePhase === 'planning' && champion.defaultMoveDir && (
                            <div
                              className={`absolute text-white font-bold text-lg drop-shadow-[0_0_3px_rgba(0,0,0,1)] z-30 ${champion.defaultMoveDir.y === -1 ? '-top-4 left-1/2 -translate-x-1/2' :
                                  champion.defaultMoveDir.y === 1 ? '-bottom-4 left-1/2 -translate-x-1/2' :
                                    champion.defaultMoveDir.x === -1 ? 'top-1/2 -left-4 -translate-y-1/2' :
                                      'top-1/2 -right-4 -translate-y-1/2'
                                }`}
                              title="ランダム移動予定方向"
                            >
                              {champion.defaultMoveDir.y === -1 ? '↑' :
                                champion.defaultMoveDir.y === 1 ? '↓' :
                                  champion.defaultMoveDir.x === -1 ? '←' : '→'}
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] font-bold mt-[-2px] drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] text-white">{champion.currentHp}</span>
                      </div>
                    );
                  })()}

                  <span className="absolute bottom-0 right-0.5 text-[8px] text-slate-500">{x},{y}</span>

                  {/* 資源ノード表示 */}
                  {G.resourceNodes
                    ?.filter(n => n.x === x && n.y === y)
                    .map((node, idx) => {
                      // アニメーション中の資源ノードかどうか
                      const isGettingResource = visibleResourceEvents.some(e => e.x === x && e.y === y && e.type === node.type);
                      return (
                        <div
                          key={`resource-${idx}`}
                          className={`absolute inset-0.5 rounded-full flex flex-col items-center justify-center z-10 opacity-70 pointer-events-none border-2 transition-all duration-300
                            ${node.type === 'wood' ? 'bg-green-900 border-green-500 text-green-300'
                              : 'bg-stone-800 border-stone-500 text-stone-300'}
                            ${isGettingResource ? 'animate-pulse ring-4 ring-yellow-400 scale-110 opacity-100 shadow-[0_0_15px_rgba(250,204,21,0.8)]' : ''}`}
                          title={`${node.type} 産出 (出目: ${node.triggerNumber})`}
                        >
                          <span className="text-[10px]">
                            {node.type === 'wood' ? '🌲' : '⛰️'}
                          </span>
                          <span className="text-[12px] font-bold leading-none">{node.triggerNumber}</span>

                          {/* ポップアップテキスト（+1） */}
                          {isGettingResource && (
                            <span className="absolute -top-6 text-yellow-300 font-bold text-sm animate-bounce drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
                              +1
                            </span>
                          )}
                        </div>
                      );
                    })
                  }

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

                  {/* 商人表示 */}
                  {G.merchant && G.merchant.x === x && G.merchant.y === y && (
                    <div
                      key={`merchant-${G.merchant.id}`}
                      className={`absolute inset-0.5 rounded-sm flex items-center justify-center z-15 bg-indigo-700/80 border-2 border-indigo-400 shadow-lg`}
                      title={`商人: 代替購入で資源を10ptに交換`}
                    >
                      <ShoppingCart size={20} className="text-yellow-300 animate-bounce" />
                    </div>
                  )}

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
                        {event.element && (
                          <div className="absolute inset-0 z-40 animate-effect-pop">
                            <AttackEffect element={event.element} />
                          </div>
                        )}
                        <span className="text-lg font-bold text-red-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] z-50">
                          -{event.amount}
                        </span>
                        {event.effectiveness && (
                          <span className="text-[10px] text-yellow-300 font-bold z-50 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                            {event.effectiveness}
                          </span>
                        )}
                      </div>
                    ))}

                  {/* ポイントポップアップ */}
                  {visiblePointEvents
                    .filter(e => e.x === x && e.y === y)
                    .map(event => (
                      <div
                        key={event.id}
                        className="point-popup absolute inset-0 flex flex-col items-center justify-center z-50 pointer-events-none"
                      >
                        <span className={`text-lg font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] z-50 ${event.team === '0' ? 'text-blue-400' : 'text-red-400'}`}>
                          +{event.amount}
                        </span>
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
                      {(() => {
                        const isNearMerchant = G.merchant && selectedChampion?.pos &&
                          (Math.abs(G.merchant.x - selectedChampion.pos.x) + Math.abs(G.merchant.y - selectedChampion.pos.y) <= 1);

                        return selectedChampion.cards.map(card => {
                          const typeConfig = getTypeConfig(card.type);
                          const onCooldown = card.currentCooldown > 0;
                          return (
                            <div
                              key={card.id}
                              className="flex items-stretch gap-1 mb-2"
                            >
                              {/* 通常使用ボタン（カード本体） */}
                              <div
                                className={`flex-1 p-2 rounded border transition-all group ${onCooldown
                                  ? 'border-slate-700 bg-slate-900 opacity-50 cursor-not-allowed'
                                  : 'border-slate-600 bg-slate-800 hover:bg-slate-700 hover:border-yellow-400 cursor-pointer'
                                  }`}
                                onClick={() => !onCooldown && handleCardClick(card, false)}
                              >
                                <div className="flex items-center gap-1">
                                  <div className={`${typeConfig.bgColor} rounded px-1 py-0.5 flex items-center gap-0.5 ${onCooldown ? 'opacity-50' : ''}`}>
                                    {typeConfig.icon}
                                    <span className="text-[10px] text-white">{card.priority > 0 ? `+${card.priority}` : card.priority}</span>
                                  </div>
                                  <span className={`text-xs font-bold ${onCooldown ? 'text-slate-500' : 'group-hover:text-yellow-200'}`}>{card.nameJa}</span>
                                  {onCooldown && (
                                    <span className="ml-auto text-[10px] text-red-400 font-bold">CD: {card.currentCooldown}</span>
                                  )}
                                </div>
                                <div className="flex gap-2 text-[10px] text-slate-400 mt-1">
                                  {card.power > 0 && <span>威力:{card.power}</span>}
                                  {card.move > 0 && <span>移動:{card.move}</span>}
                                  {card.power > 0 && <span className="text-orange-300">範囲:{card.attackRange ?? (card.move > 0 ? 1 : 2)}</span>}
                                </div>
                                {/* 資源コスト表示 */}
                                {card.resourceCost && (
                                  <div className="flex gap-1 text-[10px] mt-1 p-1 bg-slate-900/50 rounded flex-wrap">
                                    <span className="text-slate-300 font-bold">コスト: </span>
                                    {!selectedChampion?.usedSkillIds.includes(card.id) ? (
                                      <span className="text-yellow-400 font-bold animate-pulse">初回無料！</span>
                                    ) : (
                                      <>
                                        {card.resourceCost.wood ? <span className="text-green-400">🌲{card.resourceCost.wood}</span> : null}
                                        {card.resourceCost.stone ? <span className="text-stone-400">⛰️{card.resourceCost.stone}</span> : null}
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* 代替アクション（移動）ボタン */}
                              <button
                                className={`w-10 flex items-center justify-center rounded border transition-all shadow-sm ${onCooldown
                                  ? 'border-slate-700 bg-slate-900 text-slate-600 cursor-not-allowed opacity-50'
                                  : 'border-slate-600 bg-slate-700 text-green-500 hover:bg-green-700 hover:border-green-400 hover:text-white'
                                  }`}
                                disabled={onCooldown}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!onCooldown) handleCardClick(card, true, false);
                                }}
                                title="代替アクション: 上下左右に1マス移動"
                              >
                                <Move size={20} />
                              </button>

                              {/* 代替購入（商人）ボタン */}
                              {isNearMerchant && (
                                <button
                                  className={`w-10 flex items-center justify-center rounded border transition-all shadow-sm ${onCooldown
                                    ? 'border-slate-700 bg-slate-900 text-slate-600 cursor-not-allowed opacity-50'
                                    : 'border-indigo-600 bg-indigo-900 shadow-[0_0_10px_rgba(79,70,229,0.5)] text-yellow-300 hover:bg-indigo-700 hover:border-indigo-400 hover:text-white'
                                    }`}
                                  disabled={onCooldown}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!onCooldown) handleCardClick(card, false, true);
                                  }}
                                  title={`代替購入: 木1,石1 を消費して 10pt獲得`}
                                >
                                  <ShoppingCart size={18} />
                                </button>
                              )}
                            </div>
                          );
                        })
                      })()}

                      {/* ガード機能は一時的にオフ
                      {selectedChampion.cards.filter(c => c.currentCooldown === 0).length >= 2 && (
                        <button
                          className="p-2 rounded border border-yellow-600 bg-yellow-900/30 hover:bg-yellow-900/50 text-yellow-400 text-sm flex items-center justify-center gap-1"
                          onClick={handleGuard}
                        >
                          <Shield size={14} />
                          ガード
                        </button>
                      )}
                      */}
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
                    const card = !isGuard ? champ.cards.find(c => c.id === (action.action as any).cardId) : null;
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
                              <span className="text-[10px] text-white">{card.priority > 0 ? `+${card.priority}` : card.priority}</span>
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
                    const card = !isGuard ? champ.cards.find(c => c.id === (pending.action as any).cardId) : null;
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
                              <span className="text-[10px] text-white">{card.priority > 0 ? `+${card.priority}` : card.priority}</span>
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
                  {enemyChamp.cards.map(card => {
                    const typeConfig = getTypeConfig(card.type);
                    return (
                      <div key={card.id} className="p-2 rounded border border-red-800/50 bg-red-950/30">
                        <div className="flex items-center gap-1">
                          <div className={`${typeConfig.bgColor} rounded px-1 py-0.5 flex items-center gap-0.5`}>
                            {typeConfig.icon}
                            <span className="text-[10px] text-white">{card.priority > 0 ? `+${card.priority}` : card.priority}</span>
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

      {/* ゲームオーバー画面 */}
      {ctx.gameover && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-8 text-center shadow-2xl border-4 border-slate-600 max-w-md">
            {ctx.gameover.winner === myPlayerID ? (
              <>
                <div className="text-6xl mb-4">🏆</div>
                <h2 className="text-4xl font-bold text-yellow-400 mb-4">勝利！</h2>
                <p className="text-xl text-green-400">おめでとうございます！</p>
              </>
            ) : (
              <>
                <div className="text-6xl mb-4">💔</div>
                <h2 className="text-4xl font-bold text-red-400 mb-4">敗北...</h2>
                <p className="text-xl text-slate-400">また挑戦してください</p>
              </>
            )}
            <div className="mt-6 pt-4 border-t border-slate-600">
              <div className="text-lg text-slate-300 mb-2">最終スコア</div>
              <div className="flex justify-center gap-8 text-xl font-bold">
                <span className="text-blue-400">青: {G.scores['0']}pt</span>
                <span className="text-red-400">赤: {G.scores['1']}pt</span>
              </div>
            </div>
            <button
              className="mt-6 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors"
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set('r', Date.now().toString());
                window.location.href = url.toString();
              }}
            >
              もう一度プレイ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
