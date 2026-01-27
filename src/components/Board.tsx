'use client';
import React, { useState } from 'react';
import { BoardProps } from 'boardgame.io/react';
import { GameState } from '../game/types';
import { TowerControl as TowerIcon, Swords, User, Bot, ArrowRight } from 'lucide-react';

type Props = BoardProps<GameState>;

const BOARD_ROWS = 5;
const BOARD_COLS = 5;

export default function Board({ G, ctx, moves, events, playerID }: Props) {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  
  const myPlayerID = playerID || '';

  const getCellContent = (x: number, y: number) => {
    const unit = G.units.find((u) => u.pos.x === x && u.pos.y === y);
    const tower = G.towers.find((t) => t.pos.x === x && t.pos.y === y);
    return { unit, tower };
  };

  const handleCellClick = (x: number, y: number) => {
    if (!myPlayerID) return;

    const { unit, tower } = getCellContent(x, y);
    const targetId = unit?.id || tower?.id;
    const targetTeam = unit?.team || tower?.team;

    if (selectedUnitId) {
      // If clicking the same unit, deselect
      if (unit && unit.id === selectedUnitId) {
        setSelectedUnitId(null);
        return;
      }

      // If clicking another own unit, select it
      if (unit && unit.team === myPlayerID) {
        setSelectedUnitId(unit.id);
        return;
      }

      // If clicking enemy unit/tower, attack
      if (targetId && targetTeam !== myPlayerID) {
        moves.planOrder(selectedUnitId, 'attack', targetId);
        setSelectedUnitId(null);
        return;
      }

      // If clicking empty cell, move
      if (!unit && !tower) {
        moves.planOrder(selectedUnitId, 'move', { x, y });
        setSelectedUnitId(null);
        return;
      }
    } else {
      // Select own unit
      if (unit && unit.team === myPlayerID && unit.type === 'champion') {
        setSelectedUnitId(unit.id);
      }
    }
  };

  const myOrders = G.orders[myPlayerID] || [];

  return (
    <div className="flex flex-col items-center gap-4 p-4 bg-slate-900 min-h-screen text-white font-sans">
      <h1 className="text-2xl font-bold mb-4">LoL Board Game MVP</h1>
      
      <div className="flex gap-8">
         <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-blue-400">Team Blue (Left)</h2>
         </div>
         <div className="grid gap-1 bg-slate-800 p-2 rounded-lg" 
              style={{ 
                  gridTemplateColumns: `repeat(${BOARD_COLS}, minmax(60px, 1fr))`,
                  gridTemplateRows: `repeat(${BOARD_ROWS}, minmax(60px, 1fr))`
              }}>
            {Array.from({ length: BOARD_ROWS }).map((_, y) => (
                Array.from({ length: BOARD_COLS }).map((_, x) => {
                    const { unit, tower } = getCellContent(x, y);
                    const isSelected = unit?.id === selectedUnitId;
                    
                    // Check for orders on this cell
                    const moveOrder = myOrders.find(o => o.type === 'move' && o.targetPos?.x === x && o.targetPos?.y === y);
                    // Check if this unit has an attack order
                    const attackOrder = unit ? myOrders.find(o => o.sourceUnitId === unit.id && o.type === 'attack') : null;
                    const isTargeted = myOrders.some(o => o.type === 'attack' && o.targetUnitId === (unit?.id || tower?.id));

                    let bgClass = "bg-slate-700 hover:bg-slate-600";
                    if (isSelected) bgClass = "bg-yellow-900 ring-2 ring-yellow-400";
                    if (moveOrder) bgClass = "bg-blue-900 ring-2 ring-blue-400"; // Destination of a move
                    if (isTargeted) bgClass = "bg-red-900 ring-2 ring-red-400";

                    return (
                        <div 
                            key={`${x}-${y}`} 
                            className={`w-16 h-16 flex items-center justify-center border border-slate-600 relative cursor-pointer ${bgClass}`}
                            onClick={() => handleCellClick(x, y)}
                        >
                            {/* Render Tower */}
                            {tower && (
                                <div className={`flex flex-col items-center ${tower.team === '0' ? 'text-blue-400' : 'text-red-400'}`}>
                                    <TowerIcon size={24} />
                                    <span className="text-xs">{tower.hp}</span>
                                </div>
                            )}

                            {/* Render Unit */}
                            {unit && (
                                <div className={`flex flex-col items-center z-10 ${unit.team === '0' ? 'text-blue-400' : 'text-red-400'}`}>
                                    {unit.type === 'champion' ? <User size={24} /> : <Bot size={20} />}
                                    <span className="text-xs font-bold">{unit.hp}</span>
                                    {/* Show planned action icon if any */}
                                    {attackOrder && <div className="absolute -top-2 -right-2 bg-red-600 rounded-full p-0.5"><Swords size={12} className="text-white"/></div>}
                                     {/* If moving, maybe show arrow? Hard to visualize source on grid without drawing lines. 
                                         For now, highlighting destination is enough.
                                         But if the unit itself is moving, maybe dim it? 
                                     */}
                                     {myOrders.find(o => o.sourceUnitId === unit.id && o.type === 'move') && (
                                         <div className="absolute -top-2 -right-2 bg-blue-600 rounded-full p-0.5"><ArrowRight size={12} className="text-white"/></div>
                                     )}
                                </div>
                            )}

                            {/* Coordinate (debug) */}
                            <span className="absolute bottom-0 right-1 text-[10px] text-slate-500">{x},{y}</span>
                        </div>
                    );
                })
            ))}
         </div>
         <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-red-400">Team Red (Right)</h2>
         </div>
      </div>

      <div className="flex gap-4 items-center mt-4">
        <div className="text-sm">
            Player: <span className={`font-bold ${myPlayerID === '0' ? 'text-blue-400' : 'text-red-400'}`}>{myPlayerID === '0' ? 'Blue' : 'Red'}</span>
        </div>
        <div className="text-sm text-slate-500">Turn: {ctx.turn}</div>
        <button 
            className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded shadow disabled:opacity-50"
            onClick={() => events?.endTurn?.()}
            disabled={!myPlayerID}
        >
            Commit Turn
        </button>
      </div>

      <div className="w-full max-w-2xl bg-slate-800 p-4 rounded mt-4 h-40 overflow-y-auto">
          <h3 className="text-slate-400 text-sm mb-2 uppercase tracking-wider">Battle Log</h3>
          {G.turnLog.slice().reverse().map((log, i) => (
              <div key={i} className="text-xs text-slate-300 border-b border-slate-700 py-1 last:border-0">
                  {log}
              </div>
          ))}
      </div>
    </div>
  );
}
