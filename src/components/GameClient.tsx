'use client';
import { Client } from 'boardgame.io/react';
import { LoLBoardGame } from '../game/Game';
import Board from './Board';
import { Local } from 'boardgame.io/multiplayer';
import { SimpleBot } from '../game/Bot';

const LoLClient = Client({
  game: LoLBoardGame,
  board: Board,
  multiplayer: Local({
    bots: {
      '1': SimpleBot,
    },
  }),
  debug: false,
});

export default function GameClient() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black p-4">
      <h2 className="text-white text-center text-xl font-bold mb-8">Single Player Mode (vs CPU)</h2>
      <p className="text-slate-400 mb-4 text-center max-w-lg">
          You are Blue Team (Left). The CPU is Red Team (Right).
          <br/>
          Plan your moves and click &quot;Commit Turn&quot;. The CPU will act simultaneously.
      </p>
      <div className="flex justify-center w-full">
        <div className="border-2 border-blue-900 rounded-lg overflow-hidden shadow-lg shadow-blue-900/20">
            <div className="bg-blue-900 text-white text-center py-1 text-sm font-bold">Player 0 (Blue) View</div>
            <LoLClient playerID="0" matchID="default" />
        </div>
      </div>
    </div>
  );
}
