'use client';
import React, { useState } from 'react';
import { BoardProps } from 'boardgame.io/react';
import { GameState, Team, ChampionInstance, Card, Position } from '../game/types';
import { getChampionById } from '../game/champions';
import { Shield, Swords, ArrowRight, Zap, Flame, Droplets, Bug, Moon, Cog } from 'lucide-react';

type Props = BoardProps<GameState>;

const BOARD_SIZE = 9;

// タイプに対応するアイコンと色
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

export default function Board({ G, ctx, moves, events, playerID }: Props) {
  const [selectedChampionId, setSelectedChampionId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<'none' | 'move' | 'attack' | 'guard'>('none');

  const myPlayerID = (playerID || '0') as Team;
  const myPlayerState = G.players[myPlayerID];

  // 場に出ているチャンピオン
  const myFieldChampions = myPlayerState.champions.filter(c => c.pos !== null);

  // ベンチにいるチャンピオン
  const myBenchChampions = myPlayerState.champions.filter(c => c.pos === null);

  // 選択中のチャンピオン
  const selectedChampion = selectedChampionId
    ? myPlayerState.champions.find(c => c.id === selectedChampionId)
    : null;

  // 選択中のカード
  const selectedCard = selectedChampion && selectedCardId
    ? selectedChampion.hand.find(c => c.id === selectedCardId)
    : null;

  // 現在のターンで既に行動選択済みのチャンピオン
  const actingChampionIds = G.turnActions[myPlayerID].actions.map(a => a.championId);

  const getCellContent = (x: number, y: number) => {
    const allChampions = [...G.players['0'].champions, ...G.players['1'].champions];
    const champion = allChampions.find(c => c.pos?.x === x && c.pos?.y === y);
    const tower = G.towers.find(t => t.pos.x === x && t.pos.y === y);
    return { champion, tower };
  };

  const handleCellClick = (x: number, y: number) => {
    const { champion, tower } = getCellContent(x, y);

    // カード選択中で移動先を選んでいる場合
    if (selectedCard && actionMode === 'move') {
      if (!champion && !tower) {
        moves.playCard(selectedChampionId, selectedCardId, { x, y });
        resetSelection();
        return;
      }
    }

    // カード選択中で攻撃対象を選んでいる場合
    if (selectedCard && actionMode === 'attack') {
      if (champion && champion.team !== myPlayerID) {
        moves.playCard(selectedChampionId, selectedCardId, undefined, champion.id);
        resetSelection();
        return;
      }
    }

    // 自分のチャンピオンをクリック
    if (champion && champion.team === myPlayerID) {
      if (champion.id === selectedChampionId) {
        resetSelection();
      } else {
        setSelectedChampionId(champion.id);
        setSelectedCardId(null);
        setActionMode('none');
      }
    }
  };

  const handleCardClick = (card: Card) => {
    if (!selectedChampion) return;

    setSelectedCardId(card.id);

    // カードのタイプに応じてアクションモードを設定
    if (card.isSwap) {
      // 交代カードは即実行
      moves.playCard(selectedChampionId, card.id);
      resetSelection();
    } else if (card.power > 0 && card.move > 0) {
      // 移動+攻撃カード: まず移動先を選ぶ
      setActionMode('move');
    } else if (card.power > 0) {
      // 攻撃のみ: 攻撃対象を選ぶ
      setActionMode('attack');
    } else if (card.move > 0) {
      // 移動のみ: 移動先を選ぶ
      setActionMode('move');
    }
  };

  const handleGuard = () => {
    if (!selectedChampion || selectedChampion.hand.length < 2) return;

    // 最初の2枚のカードを捨ててガード
    const cardIds: [string, string] = [
      selectedChampion.hand[0].id,
      selectedChampion.hand[1].id
    ];
    moves.guard(selectedChampionId, cardIds);
    resetSelection();
  };

  const resetSelection = () => {
    setSelectedChampionId(null);
    setSelectedCardId(null);
    setActionMode('none');
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
        <div className="text-slate-400">
          行動選択: {G.turnActions[myPlayerID].actions.length}/2
        </div>
      </div>

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
                    : 'border-slate-600 bg-slate-800 cursor-pointer hover:bg-slate-700'
                  }`}
                onClick={() => champion.knockoutTurnsRemaining === 0 && setSelectedChampionId(champion.id)}
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

              // 移動可能範囲のハイライト
              const isMoveTarget = actionMode === 'move' && selectedChampion && selectedCard &&
                !champion && !tower &&
                (Math.abs(x - (selectedChampion.pos?.x || 0)) + Math.abs(y - (selectedChampion.pos?.y || 0))) <= selectedCard.move;

              // 攻撃可能範囲のハイライト
              const attackRange = selectedCard ? (selectedCard.move > 0 ? 1 : 2) : 0;
              const isAttackTarget = actionMode === 'attack' && selectedChampion && champion &&
                champion.team !== myPlayerID &&
                (Math.abs(x - (selectedChampion.pos?.x || 0)) + Math.abs(y - (selectedChampion.pos?.y || 0))) <= attackRange;

              let bgClass = 'bg-slate-700 hover:bg-slate-600';
              if (isSelected) bgClass = 'bg-yellow-900 ring-2 ring-yellow-400';
              if (isMoveTarget) bgClass = 'bg-blue-900/50 ring-1 ring-blue-400 cursor-pointer';
              if (isAttackTarget) bgClass = 'bg-red-900/50 ring-1 ring-red-400 cursor-pointer';
              if (isActing) bgClass = 'bg-green-900 ring-1 ring-green-400';

              return (
                <div
                  key={`${x}-${y}`}
                  className={`w-12 h-12 flex items-center justify-center border border-slate-600/50 relative cursor-pointer ${bgClass}`}
                  onClick={() => handleCellClick(x, y)}
                >
                  {/* タワー */}
                  {tower && (
                    <div className={`flex flex-col items-center ${tower.team === '0' ? 'text-blue-400' : 'text-red-400'}`}>
                      <div className="text-lg">🏰</div>
                      <span className="text-[10px]">{tower.hp}</span>
                    </div>
                  )}

                  {/* チャンピオン */}
                  {champion && (
                    <div className={`flex flex-col items-center z-10 ${champion.team === '0' ? 'text-blue-400' : 'text-red-400'}`}>
                      <div className="relative">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${champion.team === '0' ? 'bg-blue-600' : 'bg-red-600'
                          }`}>
                          {getChampionDef(champion)?.nameJa.charAt(0) || '?'}
                        </div>
                        {/* タイプアイコン */}
                        <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center ${getTypeConfig(champion.currentType).bgColor}`}>
                          {getTypeConfig(champion.currentType).icon}
                        </div>
                        {/* ガード状態 */}
                        {champion.isGuarding && (
                          <div className="absolute -bottom-1 -right-1 text-yellow-400">
                            <Shield size={12} />
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-bold">{champion.currentHp}</span>
                    </div>
                  )}

                  {/* 座標 (デバッグ用) */}
                  <span className="absolute bottom-0 right-0.5 text-[8px] text-slate-500">{x},{y}</span>
                </div>
              );
            })
          ))}
        </div>

        {/* カード選択パネル */}
        <div className="flex flex-col gap-2 w-48">
          <h3 className="text-sm font-semibold text-slate-400">
            {selectedChampion ? `${getChampionDef(selectedChampion)?.nameJa} の手札` : 'チャンピオンを選択'}
          </h3>

          {selectedChampion && (
            <>
              {/* 行動済みチェック */}
              {actingChampionIds.includes(selectedChampion.id) ? (
                <div className="text-green-400 text-sm p-2 bg-green-900/30 rounded">
                  ✓ 行動選択済み
                </div>
              ) : (
                <>
                  {/* カード一覧 */}
                  {selectedChampion.hand.map(card => {
                    const typeConfig = getTypeConfig(card.type);
                    const isCardSelected = card.id === selectedCardId;
                    return (
                      <div
                        key={card.id}
                        className={`p-2 rounded border cursor-pointer transition-all ${isCardSelected
                            ? 'border-yellow-400 bg-yellow-900/50'
                            : 'border-slate-600 bg-slate-800 hover:bg-slate-700'
                          }`}
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
                        {card.effect && (
                          <div className="text-[9px] text-slate-500 mt-0.5">{card.effect}</div>
                        )}
                      </div>
                    );
                  })}

                  {/* ガードボタン */}
                  {selectedChampion.hand.length >= 2 && (
                    <button
                      className="p-2 rounded border border-yellow-600 bg-yellow-900/30 hover:bg-yellow-900/50 text-yellow-400 text-sm flex items-center justify-center gap-1"
                      onClick={handleGuard}
                    >
                      <Shield size={14} />
                      ガード (カード2枚消費)
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {/* アクションモード表示 */}
          {actionMode !== 'none' && (
            <div className={`p-2 rounded text-sm ${actionMode === 'move' ? 'bg-blue-900/50 text-blue-300' : 'bg-red-900/50 text-red-300'
              }`}>
              {actionMode === 'move' ? '移動先を選択' : '攻撃対象を選択'}
            </div>
          )}
        </div>
      </div>

      {/* コミットボタン */}
      <div className="flex gap-4 items-center mt-2">
        <button
          className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded shadow disabled:opacity-50"
          onClick={() => events?.endTurn?.()}
          disabled={G.turnActions[myPlayerID].actions.length < 2}
        >
          ターン確定 ({G.turnActions[myPlayerID].actions.length}/2)
        </button>
        <button
          className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded"
          onClick={resetSelection}
        >
          キャンセル
        </button>
      </div>

      {/* バトルログ */}
      <div className="w-full max-w-3xl bg-slate-800 p-4 rounded mt-2 h-32 overflow-y-auto">
        <h3 className="text-slate-400 text-sm mb-2 uppercase tracking-wider">バトルログ</h3>
        {G.turnLog.slice().reverse().slice(0, 20).map((log, i) => (
          <div key={i} className="text-xs text-slate-300 border-b border-slate-700 py-1 last:border-0">
            {log}
          </div>
        ))}
      </div>
    </div>
  );
}
