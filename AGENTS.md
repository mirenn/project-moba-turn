# lol-board-game

MOBAとターン制戦略ボードゲームを融合したゲーム。

## 主要ファイル

- `GAME_DESIGN.md`: ゲームの仕様書。ルールやバランス調整時に参照・更新すること
- `NOT_IMPLEMENTED.md`: 未実装機能の一覧。GAME_DESIGN.mdに記載があるが実装されていない機能はここに記録する
- `src/game/Game.ts`: ゲームロジック本体
- `src/game/champions.ts`: チャンピオン定義
- `src/game/types.ts`: 型定義

## 開発ガイドライン

- **開発時**: `npm run dev` を使用する（変更が即座に反映されます）
- **本番確認**: `npm run build` && `npm run start` を使用する
- 新しいルールや仕様追加時は `GAME_DESIGN.md` に反映する
- このファイル（AGENTS.md）自体も必要に応じて更新してよい
