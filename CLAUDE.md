# lol-board-game

MOBAとターン制戦略ボードゲームを融合したゲーム。

## 主要ファイル

- `GAME_DESIGN.md`: ゲームの仕様書。ルールやバランス調整時に参照・更新すること
- `src/game/Game.ts`: ゲームロジック本体
- `src/game/champions.ts`: チャンピオン定義
- `src/game/types.ts`: 型定義

## 開発ガイドライン

- ゲームルール変更時は `GAME_DESIGN.md` も同時に更新する
- 新しいルールや仕様追加時は `GAME_DESIGN.md` に反映する
- このファイル（CLAUDE.md）自体も必要に応じて更新してよい
