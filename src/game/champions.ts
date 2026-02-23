import { ChampionDefinition, Card } from './types';

// ========================
// Priority（優先度）の体系について
// 数値が大きいほど先に行動する（+2 > +1 > 0 > -1）
// +2: 超先制技（アルティメット等）
// +1: 先制技（かげうち、でんこうせっか等）
//  0: 通常の攻撃技
// -1: 交代、一部の大技
// Priorityが同じ場合は、チャンピオンの素早さ(Speed)が高い方が先制する
// ========================

// ========================
// ゲコゲコガ (Gekogekoga) - 水タイプ
// 特性: へんげんじざい（技を使用すると、その技のタイプに変化する）
// ========================
const gekogekogaCards: Card[] = [
  {
    id: 'gekogekoga-tonbogaeri',
    name: 'u-turn',
    nameJa: 'とんぼがえり',
    type: 'bug',
    priority: 0,
    power: 20,
    move: 1,
    attackRange: 1,
    effect: '隣接1体に攻撃。成功時、控えと交代',
    effectFn: 'uturn',
    cooldown: 2,
    currentCooldown: 0,
  },
  {
    id: 'gekogekoga-mizushuriken',
    name: 'water-shuriken',
    nameJa: 'みずしゅりけん',
    type: 'water',
    priority: 0,
    power: 20,
    move: 0,
    attackRange: 1,
    effect: '隣接1体に20ダメージを2〜4回攻撃',
    effectFn: 'multiHit',
    cooldown: 2,
    currentCooldown: 0,
  },
  {
    id: 'gekogekoga-akunohadou',
    name: 'dark-pulse',
    nameJa: 'あくのはどう',
    type: 'dark',
    priority: 0,
    power: 80,
    move: 0,
    attackRange: 1,
    effect: '隣接1体に攻撃。20%で相手のこのターンの行動を無効化',
    effectFn: 'flinch',
    cooldown: 3,
    currentCooldown: 0,
  },
  {
    id: 'gekogekoga-kageuchi',
    name: 'shadow-sneak',
    nameJa: 'かげうち',
    type: 'dark',
    priority: 1,
    power: 30,
    move: 3,
    attackRange: 1,
    effect: '3マス移動後、隣接1体に攻撃',
    cooldown: 2,
    currentCooldown: 0,
  },
  {
    id: 'gekogekoga-swap',
    name: 'swap',
    nameJa: '交代',
    type: 'normal',
    priority: -1,
    power: 0,
    move: 0,
    isSwap: true,
    effect: '控えのチャンピオンと交代する',
    cooldown: 1,
    currentCooldown: 0,
  },
];

export const GEKOGEKOGA: ChampionDefinition = {
  id: 'gekogekoga',
  name: 'Gekogekoga',
  nameJa: 'ゲコゲコガ',
  type: 'water',
  hp: 80,
  speed: 122,
  ability: 'protean',
  abilityDesc: 'へんげんじざい: 技を使用すると、その技のタイプに変化する',
  cards: gekogekogaCards,
  ultimateCard: {
    id: 'gekogekoga-hydro-pump',
    name: 'hydro-pump',
    nameJa: 'ハイドロポンプ',
    type: 'water',
    priority: 0,
    power: 110,
    move: 0,
    attackRange: 3,
    effect: '3マス以内の1体に大ダメージ',
    cooldown: 4,
    currentCooldown: 0,
    resourceCost: { wood: 1, stone: 1 },
  },
};

// ========================
// 機動馬 (Kidouba) - はがねタイプ
// ========================
const kidoubaCards: Card[] = [
  {
    id: 'kidouba-shissou',
    name: 'gallop',
    nameJa: 'しっそう',
    type: 'normal',
    priority: 1,
    power: 0,
    move: 5,
    attackRange: 0,
    effect: '直線方向に5マスまで移動',
    effectFn: 'linearMove',
    cooldown: 1,
    currentCooldown: 0,
    resourceCost: { wood: 1 },
  },
  {
    id: 'kidouba-fumitsuke',
    name: 'stomp',
    nameJa: 'ふみつけ',
    type: 'ground',
    priority: 0,
    power: 50,
    move: 1,
    attackRange: 1,
    isSurroundingAoE: true,
    effect: '周囲1マス全体に攻撃（発動時に自動発生）',
    cooldown: 3,
    currentCooldown: 0,
  },
  {
    id: 'kidouba-ironhead',
    name: 'iron-head',
    nameJa: 'アイアンヘッド',
    type: 'steel',
    priority: 0,
    power: 80,
    move: 1,
    attackRange: 1,
    effect: '隣接1体に攻撃。30%で相手をひるませる',
    effectFn: 'flinch',
    cooldown: 2,
    currentCooldown: 0,
  },
  {
    id: 'kidouba-tetsutei-kousen',
    name: 'steel-beam',
    nameJa: 'てっていこうせん',
    type: 'steel',
    priority: 0,
    power: 140,
    move: 0,
    attackRange: 3,
    effect: '使用時、自身も最大HPの1/4のダメージを受ける',
    effectFn: 'recoil',
    cooldown: 5,
    currentCooldown: 0,
    resourceCost: { stone: 2 },
  },
  {
    id: 'kidouba-swap',
    name: 'swap',
    nameJa: '交代',
    type: 'normal',
    priority: -1,
    power: 0,
    move: 0,
    isSwap: true,
    effect: '控えのチャンピオンと交代する',
    cooldown: 1,
    currentCooldown: 0,
  },
];

export const KIDOUBA: ChampionDefinition = {
  id: 'kidouba',
  name: 'Kidouba',
  nameJa: '機動馬',
  type: 'steel',
  hp: 70,
  speed: 50,
  ability: 'steelArmor',
  abilityDesc: '装甲: 受けるダメージを常時10軽減する',
  cards: kidoubaCards,
  ultimateCard: {
    id: 'kidouba-ultimate',
    name: 'heavy-slam',
    nameJa: 'ヘビーボンバー',
    type: 'steel',
    priority: -1,
    power: 120,
    move: 2,
    attackRange: 1,
    isSurroundingAoE: true,
    effect: '2マス移動後、周囲1マスに絶大な全体ダメージ',
    cooldown: 6,
    currentCooldown: 0,
  },
};

// ========================
// 炎獅子 (Enshishi) - ほのおタイプ
// 新規作成チャンピオン
// ========================
const enshishiCards: Card[] = [
  {
    id: 'enshishi-kaenhosha',
    name: 'flamethrower',
    nameJa: 'かえんほうしゃ',
    type: 'fire',
    priority: 0,
    power: 90,
    move: 0,
    attackRange: 8,
    isDirectional: true,
    lineRange: 8,
    effect: '指定方向に8マスの直線攻撃',
    cooldown: 3,
    currentCooldown: 0,
    resourceCost: { wood: 1 },
  },
  {
    id: 'enshishi-flaredrive',
    name: 'flare-blitz',
    nameJa: 'フレアドライブ',
    type: 'fire',
    priority: 0,
    power: 120,
    move: 1,
    attackRange: 1,
    effect: '1マス移動後攻撃。自身も与ダメージの1/3を受ける',
    effectFn: 'recoil',
    cooldown: 4,
    currentCooldown: 0,
    resourceCost: { wood: 2 },
  },
  {
    id: 'enshishi-honoonokiba',
    name: 'fire-fang',
    nameJa: 'ほのおのキバ',
    type: 'fire',
    priority: 0,
    power: 65,
    move: 1,
    attackRange: 1,
    effect: '隣接1体に攻撃。10%で相手をやけど状態にする',
    effectFn: 'burn',
    cooldown: 2,
    currentCooldown: 0,
  },
  {
    id: 'enshishi-swap',
    name: 'swap',
    nameJa: '交代',
    type: 'normal',
    priority: -1,
    power: 0,
    move: 0,
    isSwap: true,
    effect: '控えのチャンピオンと交代する',
    cooldown: 1,
    currentCooldown: 0,
  },
];

export const ENSHISHI: ChampionDefinition = {
  id: 'enshishi',
  name: 'Enshishi',
  nameJa: '炎獅子',
  type: 'fire',
  hp: 85,
  speed: 81,
  ability: 'blaze',
  abilityDesc: 'もうか: HPが1/3以下のとき、ほのお技の威力が1.5倍',
  cards: enshishiCards,
  ultimateCard: {
    id: 'enshishi-ultimate',
    name: 'blast-burn',
    nameJa: 'ブラストバーン',
    type: 'fire',
    priority: -1,
    power: 140,
    move: 0,
    attackRange: 3,
    isDirectional: true,
    lineRange: 3,
    effect: '指定方向に3マスの直線絶大ダメージ',
    cooldown: 6,
    currentCooldown: 0,
  },
};

// ========================
// 雷鳥 (Raichou) - でんきタイプ
// 新規作成チャンピオン
// ========================
const raichouCards: Card[] = [
  {
    id: 'raichou-10manvolt',
    name: 'thunderbolt',
    nameJa: '10まんボルト',
    type: 'electric',
    priority: 0,
    power: 90,
    move: 0,
    attackRange: 2,
    effect: '2マス以内の1体にダメージ',
    cooldown: 2,
    currentCooldown: 0,
    resourceCost: { stone: 1 },
  },
  {
    id: 'raichou-denkousekka',
    name: 'quick-attack',
    nameJa: 'でんこうせっか',
    type: 'normal',
    priority: 1,
    power: 40,
    move: 2,
    attackRange: 1,
    effect: '2マス移動後、隣接1体に攻撃',
    cooldown: 1,
    currentCooldown: 0,
  },
  {
    id: 'raichou-voltchange',
    name: 'volt-switch',
    nameJa: 'ボルトチェンジ',
    type: 'electric',
    priority: 0,
    power: 70,
    move: 0,
    attackRange: 2,
    effect: '2マス以内の1体に攻撃。成功時、控えと交代',
    effectFn: 'uturn',
    cooldown: 2,
    currentCooldown: 0,
  },
  {
    id: 'raichou-kaminari',
    name: 'thunder',
    nameJa: 'かみなり',
    type: 'electric',
    priority: 0,
    power: 110,
    move: 0,
    attackRange: 3,
    effect: '3マス以内の1体に大ダメージ。必中',
    effectFn: 'guaranteed-hit',
    cooldown: 4,
    currentCooldown: 0,
    resourceCost: { wood: 1, stone: 1 },
  },
  {
    id: 'raichou-swap',
    name: 'swap',
    nameJa: '交代',
    type: 'normal',
    priority: -1,
    power: 0,
    move: 0,
    isSwap: true,
    effect: '控えのチャンピオンと交代する',
    cooldown: 1,
    currentCooldown: 0,
  },
];

export const RAICHOU: ChampionDefinition = {
  id: 'raichou',
  name: 'Raichou',
  nameJa: '雷鳥',
  type: 'electric',
  hp: 75,
  speed: 100,
  ability: 'static',
  abilityDesc: 'せいでんき: 接触攻撃を受けたとき、30%で相手をまひ状態にする',
  cards: raichouCards,
  ultimateCard: {
    id: 'raichou-ultimate',
    name: 'thunder',
    nameJa: 'かみなり',
    type: 'electric',
    priority: 2, // 非常に速い
    power: 110,
    move: 0,
    attackRange: 4, // 長射程
    effect: '4マス以内の1体に先制の雷撃。30%でまひ',
    effectFn: 'paralyze',
    cooldown: 6,
    currentCooldown: 0,
  },
};

// ========================
// すべてのチャンピオン一覧
// ========================
export const ALL_CHAMPIONS: ChampionDefinition[] = [
  GEKOGEKOGA,
  KIDOUBA,
  ENSHISHI,
  RAICHOU,
];

/**
 * チャンピオンIDから定義を取得
 */
export function getChampionById(id: string): ChampionDefinition | undefined {
  return ALL_CHAMPIONS.find(c => c.id === id);
}
