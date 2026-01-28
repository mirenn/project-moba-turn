'use client';
import { Client } from 'boardgame.io/react';
import { LoLBoardGame } from '../game/Game';
import Board from './Board';

// シングルプレイヤーモード（CPUはGame.ts内で自動行動）
const LoLClient = Client({
  game: LoLBoardGame,
  board: Board,
  debug: false,
});

export default function GameClient() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black p-4">
      <h2 className="text-white text-center text-xl font-bold mb-4">Single Player Mode (vs CPU)</h2>
      <p className="text-slate-400 mb-4 text-center max-w-lg text-sm">
        あなたは青チーム（左側）です。CPUは赤チーム（右側）です。
        <br />
        チャンピオンを選択してカードを選ぶだけ！移動先・攻撃先は自動で決まります。
        <br />
        2体分の行動を選んだら「ターン確定」をクリックしてください。
      </p>
      <div className="flex justify-center w-full">
        <div className="border-2 border-blue-900 rounded-lg overflow-hidden shadow-lg shadow-blue-900/20">
          <div className="bg-blue-900 text-white text-center py-1 text-sm font-bold">プレイヤー (青チーム)</div>
          <LoLClient playerID="0" matchID="default" />
        </div>
      </div>
    </div>
  );
}
