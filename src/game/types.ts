export type Team = '0' | '1';
export type TerritoryOwner = Team | null; // 陣地の所有者（nullは未塗り）
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

// 資源のタイプ (カタン風)
export type ResourceType = 'wood' | 'stone';

// 資源コスト
export interface ResourceCost {
  wood?: number;
  stone?: number;
}

// 資源ノード（盤面に配置される資源産出マス）
export interface ResourceNode {
  x: number;
  y: number;
  type: ResourceType; // 産出する資源の種類
  triggerNumber: number; // 資源を産出するフラグとなる数字 (1-6)
}

export interface Position {
  x: number;
  y: number;
}

// ブロック障害物
export interface Block {
  x: number;
  y: number;
  hp: number;      // 現在HP (1=脆い, 2=硬い)
  maxHp: number;   // 最大HP
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
  isDirectional?: boolean; // 方向指定攻撃かどうか
  lineRange?: number;      // 直線範囲（方向指定攻撃用）
  isSurroundingAoE?: boolean; // 周囲1マス全体攻撃かどうか
  bonusPower?: number;     // アップグレードによるパワーボーナス（累積）
  bonusMove?: number;      // アップグレードによる移動距離ボーナス（累積）
  cooldown: number;        // 基本クールダウン（使用後に設定されるターン数）
  currentCooldown: number; // 残りクールダウン（0なら使用可能）
  resourceCost?: ResourceCost; // 資源コスト（設定されている場合は、資源を消費する。ただし初回の使用はコスト0となる）
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
  ultimateCard?: Card;     // 覚醒時に追加される強力なカード
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
  cards: Card[];           // 全カード（cooldownで使用可否を管理）
  isGuarding: boolean;     // ガード状態かどうか
  knockoutTurnsRemaining: number; // 撃破後の復活待ちターン数（0なら行動可能）
  isAwakened: boolean;     // 覚醒状態かどうか（賞金首）
  usedSkillIds: string[];  // これまでに使用したスキルのID（初回コスト0判定用）
}



// カードプレイによる行動指示
export interface CardAction {
  championId: string;      // 行動するチャンピオンのインスタンスID
  cardId: string;          // 使用するカードのID
  targetPos?: Position;    // 移動先または攻撃対象位置
  targetChampionId?: string; // 攻撃対象のチャンピオンID
  attackTargetPos?: Position; // 指定された攻撃対象の位置（ブロックなど、ユニット以外のターゲット用）
  isAlternativeMove?: boolean; // 代替アクション（2マス移動のみ）として使用
  attackDirection?: Position;  // 方向指定攻撃の方向ベクトル（例: {x:1, y:0}=右）
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
  gold: number;                  // 現在の所持ゴールド
  resources: Record<ResourceType, number>; // 所持している資材（木材、石材）
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
  element?: ElementType; // 攻撃の属性（エフェクト用）
  timestamp: number;    // 発生時刻
}

// ポイントトークン（ランダムに発生し、陣地上にあればターン終了時に獲得）
export interface PointToken {
  x: number;
  y: number;
  value: number;        // 1 = 通常, 5 = 高価値（赤ポイント）
}

// 予告ポイントトークン（次ターンで実体化する）
export interface PendingPointToken {
  x: number;
  y: number;
  value: number;        // 1 = 通常, 5 = 高価値（赤ポイント）
}

// ポイント獲得イベント（アニメーション用）
export interface PointEvent {
  id: string;
  x: number;
  y: number;
  amount: number;
  team: Team;
  timestamp: number;
}

export interface GameState {
  players: Record<Team, PlayerState>;
  currentPhase: number;    // 現在のフェイズ（4ターンで1フェイズ）
  turnInPhase: number;     // フェイズ内のターン数（1-4）
  turnActions: Record<Team, TurnAction>;
  turnLog: string[];
  gamePhase: 'deploy' | 'planning' | 'resolution' | 'upgrade'; // ゲームフェーズ
  winner: Team | null;
  
  // 陣取り用
  territory: TerritoryOwner[][]; // 13x13の陣地マップ
  scores: Record<Team, number>;   // 各チームのスコア（累積獲得ポイント）
  
  // ポイントトークン用
  pointTokens: PointToken[];      // ボード上のポイントトークン
  pendingPointTokens: PendingPointToken[];  // 予告トークン（次ターンで実体化）
  
  // 解決フェーズ用
  pendingActions: PendingAction[];  // 解決待ち行動キュー（優先度順）
  currentResolvingAction: PendingAction | null; // 現在解決中の行動
  awaitingTargetSelection: boolean; // プレイヤーのターゲット選択待ちかどうか
  
  // 資源システム用
  resourceNodes: ResourceNode[]; // 盤面に配置された資源ノード
  resourceRollResult: number | null; // ターン終了時のサイコロ(1-6)の出目。UI表示用
  
  // 配置フェーズ用
  deployTurn?: Team; // 現在配置をおこなうチーム
  
  // アニメーション用
  damageEvents: DamageEvent[];  // ダメージイベントのキュー
  pointEvents: PointEvent[];    // ポイント獲得イベントのキュー
  cpuActionDelay: number;       // CPUアクション実行中のディレイトークン（0=無効、>0=ディレイ中）
  
  // ホームマス（最初のチャンピオン配置マス、永続的に保護される）
  homeSquares: Record<Team, Position[]>;
  
  // 障害物ブロック
  blocks: Block[];
  
  // アップグレードフェーズ用
  upgradeConfirmed: Record<Team, boolean>; // 各チームがアップグレード確定済みか
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
