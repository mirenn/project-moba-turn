'use client';
import dynamic from 'next/dynamic';

// SSRを無効にしてクライアントサイドのみでレンダリング
// これによりboardgame.ioのランダム生成がサーバー/クライアント間で異なる問題を回避
const GameClient = dynamic(() => import('@/components/GameClient'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-screen bg-black text-white">
      <div className="text-xl">ゲームを読み込み中...</div>
    </div>
  ),
});

export default function Home() {
  return (
    <main>
      <GameClient />
    </main>
  );
}
