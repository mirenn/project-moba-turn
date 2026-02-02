export type Team = '0' | '1';
export type UnitType = 'champion';

// ポケモン風の属性タイプ
export type ElementType = 
  | 'normal'   // ノーマル
  | 'fire'     // ほのお
  | 'water'    // みず
  | 'electric' // でんき
  | 'grass'    // くさ
  | 'ice'      // こおり
  | 'fighting' // かくとう
  | 'poison'   // どく
  | 'ground'   // じめん
  | 'flying'   // ひこう
  | 'psychic'  // エスパー
  | 'bug'      // むし
  | 'rock'     // いわ
  | 'ghost'    // ゴースト
  | 'dragon'   // ドラゴン
  | 'dark'     // あく
  | 'steel'    // はがね
  | 'fairy';   // フェアリー

export interface Position {
  x: number;
  y: number;
}

// カード定義
export interface Card {
  id: string;
  name: string;
  nameJa: string;          // 日本語名
  type: ElementType;       // 技のタイプ
  priority: number;        // 優先度（ユニーク値）
  power: number;           // 攻撃力（0の場合は非攻撃技）
  move: number;            // 移動距離
  attackRange?: number;    // 攻撃範囲（省略時は移動ありなら1、なしなら2）
  effect?: string;         // 特殊効果の説明
  effectFn?: string;       // 効果処理の識別子
  isSwap?: boolean;        // 交代カードかどうか
}

// チャンピオン定義（テンプレート）
export interface ChampionDefinition {
  id: string;
  name: string;
  nameJa: string;
  type: ElementType;       // チャンピオンの属性
  hp: number;
  ability?: string;        // 特性名
  abilityDesc?: string;    // 特性の説明
  cards: Card[];           // 所持カード（4枚 + 交代カード）
}

// ゲーム内のチャンピオンインスタンス
export interface ChampionInstance {
  id: string;              // ユニークなインスタンスID
  definitionId: string;    // ChampionDefinitionへの参照
  team: Team;
  currentHp: number;
  maxHp: number;
  currentType: ElementType; // 現在の属性（へんげんじざい等で変化）
  pos: Position | null;    // nullの場合はベンチ
  hand: Card[];            // 現在の手札
  usedCards: Card[];       // 使用済みカード
  isGuarding: boolean;     // ガード状態かどうか
  knockoutTurnsRemaining: number; // 撃破後の復活待ちターン数（0なら行動可能）
}

export interface Tower {
  id: string;
  hp: number;
  maxHp: number;
  pos: Position;
  team: Team;
  type: ElementType; // タワーの属性タイプ
}

// カードプレイによる行動指示
export interface CardAction {
  championId: string;      // 行動するチャンピオンのインスタンスID
  cardId: string;          // 使用するカードのID
  targetPos?: Position;    // 移動先または攻撃対象位置
  targetChampionId?: string; // 攻撃対象のチャンピオンID
  targetTowerId?: string;    // 攻撃対象のタワーID
  isAlternativeMove?: boolean; // 代替アクション（1マス移動のみ）として使用
}

// ガード行動指示
export interface GuardAction {
  championId: string;
  discardCardIds: [string, string]; // 捨てる2枚のカードID
}

// プレイヤーの行動指示（1ターンに2体分）
export interface TurnAction {
  actions: (CardAction | GuardAction)[];
}

// プレイヤー状態
export interface PlayerState {
  team: Team;
  selectedChampionIds: string[]; // 選択した4体のチャンピオンdefinitionId
  champions: ChampionInstance[]; // ゲーム内のチャンピオンインスタンス
}

// 解決待ちの行動
export interface PendingAction {
  action: CardAction | GuardAction;
  team: Team;
  priority: number;
  championId: string;
}

// ダメージイベント（アニメーション用）
export interface DamageEvent {
  id: string;           // ユニークID
  targetId: string;     // ダメージを受けたユニットのID
  amount: number;       // ダメージ量
  effectiveness?: string; // 効果（ばつぐん等）
  timestamp: number;    // 発生時刻
}

export interface GameState {
  players: Record<Team, PlayerState>;
  towers: Tower[];
  currentPhase: number;    // 現在のフェイズ（4ターンで1フェイズ）
  turnInPhase: number;     // フェイズ内のターン数（1-4）
  turnActions: Record<Team, TurnAction>;
  turnLog: string[];
  gamePhase: 'deploy' | 'planning' | 'resolution'; // ゲームフェーズ
  winner: Team | null;
  
  // 解決フェーズ用
  pendingActions: PendingAction[];  // 解決待ち行動キュー（優先度順）
  currentResolvingAction: PendingAction | null; // 現在解決中の行動
  awaitingTargetSelection: boolean; // プレイヤーのターゲット選択待ちかどうか
  
  // 配置フェーズ用
  deployTurn?: Team; // 現在配置をおこなうチーム
  
  // アニメーション用
  damageEvents: DamageEvent[];  // ダメージイベントのキュー
  cpuActionDelay: boolean;      // CPUアクション実行中のディレイ表示
}

// 旧型との互換性のため（移行期間中）
export type OrderType = 'move' | 'attack';

export interface Order {
  sourceUnitId: string;
  type: OrderType;
  targetPos?: Position;
  targetUnitId?: string;
}

// Unit型は ChampionInstance に置き換え
export interface Unit {
  id: string;
  type: UnitType;
  hp: number;
  maxHp: number;
  attack: number;
  range: number;
  pos: Position;
  team: Team;
}
