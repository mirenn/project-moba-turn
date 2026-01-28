'use client';
import React, { useState, useEffect } from 'react';
import { BoardProps } from 'boardgame.io/react';
import { GameState, Team, ChampionInstance, Card, Position } from '../game/types';
import { getChampionById } from '../game/champions';
import { Shield, Zap, Flame, Droplets, Bug, Moon, Cog, Check, X, Target, Move } from 'lucide-react';

type Props = BoardProps<GameState>;

const BOARD_SIZE = 9;

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

export default function Board({ G, ctx, moves, playerID }: Props) {
  const [selectedChampionId, setSelectedChampionId] = useState<string | null>(null);

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
    ? resolvingChampion.hand.find(c => c.id === (currentAction.action as any).cardId)
    : null;

  // 移動可能なマスを計算
  const getValidMoveTargets = (): Position[] => {
    if (!resolvingChampion || !resolvingChampion.pos || !resolvingCard) return [];
    if (resolvingCard.move <= 0) return [];

    const positions: Position[] = [];
    const allChampions = [...G.players['0'].champions, ...G.players['1'].champions];

    for (let x = 0; x < BOARD_SIZE; x++) {
      for (let y = 0; y < BOARD_SIZE; y++) {
        const dist = getDistance(resolvingChampion.pos, { x, y });
        if (dist > 0 && dist <= resolvingCard.move) {
          const isOccupied = allChampions.some(c => c.pos?.x === x && c.pos?.y === y);
          const isTowerPos = G.towers.some(t => t.pos.x === x && t.pos.y === y);
          if (!isOccupied && !isTowerPos) {
            positions.push({ x, y });
          }
        }
      }
    }
    return positions;
  };

  // 攻撃可能な敵を計算
  const getValidAttackTargets = (): ChampionInstance[] => {
    if (!resolvingChampion || !resolvingChampion.pos || !resolvingCard) return [];
    if (resolvingCard.power <= 0) return [];

    const enemies = G.players[enemyTeam].champions.filter(c => c.pos !== null);
    const attackRange = resolvingCard.move > 0 ? 3 : 2; // 移動後を考慮して少し広めに

    return enemies.filter(enemy => {
      if (!enemy.pos || !resolvingChampion.pos) return false;
      return getDistance(resolvingChampion.pos, enemy.pos) <= attackRange;
    });
  };

  const validMoveTargets = isAwaitingTarget ? getValidMoveTargets() : [];
  const validAttackTargets = isAwaitingTarget ? getValidAttackTargets() : [];

  const getCellContent = (x: number, y: number) => {
    const allChampions = [...G.players['0'].champions, ...G.players['1'].champions];
    const champion = allChampions.find(c => c.pos?.x === x && c.pos?.y === y);
    const tower = G.towers.find(t => t.pos.x === x && t.pos.y === y);
    return { champion, tower };
  };

  const handleCellClick = (x: number, y: number) => {
    // 解決フェーズ: ターゲット選択
    if (isResolutionPhase && isAwaitingTarget) {
      const { champion } = getCellContent(x, y);

      // 移動先として選択
      const isMoveTarget = validMoveTargets.some(p => p.x === x && p.y === y);
      if (isMoveTarget) {
        // 敵がいれば攻撃対象も設定
        const targetEnemy = validAttackTargets.find(e => e.pos);
        moves.selectTarget({ x, y }, targetEnemy?.id);
        return;
      }

      // 攻撃対象として選択（移動なしカードの場合）
      if (champion && champion.team === enemyTeam && resolvingCard?.move === 0) {
        moves.selectTarget(undefined, champion.id);
        return;
      }
      return;
    }

    // 計画フェーズ: チャンピオン選択
    if (G.gamePhase === 'planning') {
      const { champion } = getCellContent(x, y);
      if (champion && champion.team === myPlayerID) {
        if (champion.id === selectedChampionId) {
          setSelectedChampionId(null);
        } else {
          setSelectedChampionId(champion.id);
        }
      }
    }
  };

  const handleCardClick = (card: Card) => {
    if (G.gamePhase !== 'planning') return;
    if (!selectedChampion) return;
    if (actingChampionIds.includes(selectedChampion.id)) return;

    moves.selectCard(selectedChampion.id, card.id);
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
    if (G.turnActions[myPlayerID].actions.length >= 2) {
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
    <div className="flex flex-col items-center gap-4 p-4 bg-slate-900 min-h-screen text-white font-sans">
      <h1 className="text-2xl font-bold mb-2">MOBAボードゲーム</h1>

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
      </div>

      {/* 解決フェーズ: ターゲット選択UI */}
      {isResolutionPhase && isAwaitingTarget && resolvingChampion && resolvingCard && (
        <div className="bg-orange-900/50 border border-orange-500 rounded-lg p-4 max-w-md text-center">
          <div className="text-orange-300 font-bold mb-2 flex items-center justify-center gap-2">
            <Target size={18} />
            ターゲットを選択してください
          </div>
          <div className="text-white text-sm mb-2">
            {getChampionDef(resolvingChampion)?.nameJa} の <span className="font-bold text-yellow-300">{resolvingCard.nameJa}</span>
          </div>
          <div className="flex gap-2 text-xs text-slate-300 justify-center mb-3">
            {resolvingCard.move > 0 && (
              <span className="flex items-center gap-1"><Move size={12} /> 移動: {resolvingCard.move}マス</span>
            )}
            {resolvingCard.power > 0 && (
              <span className="flex items-center gap-1"><Target size={12} /> 威力: {resolvingCard.power}</span>
            )}
          </div>
          <div className="text-xs text-slate-400 mb-2">
            {resolvingCard.move > 0
              ? '緑のマスをクリックして移動先を選択'
              : '赤い敵をクリックして攻撃対象を選択'}
          </div>
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
                    : 'border-slate-600 bg-slate-800'
                  }`}
              >
                <div className={`text-xs font-bold ${typeConfig.color}`}>
                  {def?.nameJa || champion.definitionId}
                </div>
                <div className="text-xs text-slate-400">
                  HP: {champion.currentHp}/{champion.maxHp}
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
                  const card = champion.hand.find(c => c.id === action.cardId);
                  actionText = card?.nameJa || 'カード';
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
            gridTemplateColumns: `repeat(${BOARD_SIZE}, 48px)`,
            gridTemplateRows: `repeat(${BOARD_SIZE}, 48px)`
          }}
        >
          {Array.from({ length: BOARD_SIZE }).map((_, y) => (
            Array.from({ length: BOARD_SIZE }).map((_, x) => {
              const { champion, tower } = getCellContent(x, y);
              const isSelected = champion?.id === selectedChampionId;
              const isActing = champion && actingChampionIds.includes(champion.id);

              // 解決フェーズのハイライト
              const isMoveTarget = validMoveTargets.some(p => p.x === x && p.y === y);
              const isAttackTarget = champion && validAttackTargets.some(e => e.id === champion.id);
              const isResolvingChamp = resolvingChampion?.id === champion?.id;

              let bgClass = 'bg-slate-700 hover:bg-slate-600';
              if (isSelected) bgClass = 'bg-yellow-900 ring-2 ring-yellow-400';
              if (isActing && champion?.team === myPlayerID && G.gamePhase === 'planning') bgClass = 'bg-green-900 ring-1 ring-green-400';
              if (isMoveTarget) bgClass = 'bg-green-700/50 ring-2 ring-green-400 cursor-pointer';
              if (isAttackTarget) bgClass = 'bg-red-700/50 ring-2 ring-red-400 cursor-pointer';
              if (isResolvingChamp) bgClass = 'bg-orange-800 ring-2 ring-orange-400';

              return (
                <div
                  key={`${x}-${y}`}
                  className={`w-12 h-12 flex items-center justify-center border border-slate-600/50 relative cursor-pointer ${bgClass}`}
                  onClick={() => handleCellClick(x, y)}
                >
                  {tower && (
                    <div className={`flex flex-col items-center ${tower.team === '0' ? 'text-blue-400' : 'text-red-400'}`}>
                      <div className="text-lg">🏰</div>
                      <span className="text-[10px]">{tower.hp}</span>
                    </div>
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
                            className="p-2 rounded border cursor-pointer transition-all border-slate-600 bg-slate-800 hover:bg-slate-700 hover:border-yellow-400"
                            onClick={() => handleCardClick(card)}
                          >
                            <div className="flex items-center gap-1">
                              <div className={`${typeConfig.bgColor} rounded px-1 py-0.5 flex items-center gap-0.5`}>
                                {typeConfig.icon}
                                <span className="text-[10px] text-white">{card.priority}</span>
                              </div>
                              <span className="text-xs font-bold">{card.nameJa}</span>
                            </div>
                            <div className="flex gap-2 text-[10px] text-slate-400 mt-1">
                              {card.power > 0 && <span>威力:{card.power}</span>}
                              {card.move > 0 && <span>移動:{card.move}</span>}
                            </div>
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
            <div className="text-orange-400 text-sm p-2 bg-orange-900/30 rounded">
              解決フェーズ中...
            </div>
          )}
        </div>
      </div>

      {/* コミットボタン */}
      {G.gamePhase === 'planning' && (
        <div className="flex gap-4 items-center mt-2">
          <button
            className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded shadow disabled:opacity-50"
            onClick={handleConfirmPlan}
            disabled={G.turnActions[myPlayerID].actions.length < 2}
          >
            計画確定 ({G.turnActions[myPlayerID].actions.length}/2)
          </button>
        </div>
      )}

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
