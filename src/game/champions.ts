import { ChampionDefinition, Card } from './types';

// ========================
// Priority（優先度）の体系について
// 数値が大きいほど先に行動する（例: 120 > 100 > 50）
// 交代カードは 40~55 程度、通常の攻撃は 60~100、先制技は 110~120
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
    priority: 100,
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
    priority: 90,
    power: 20,
    move: 0,
    attackRange: 1,
    effect: '隣接1体に20ダメージを2〜4回攻撃',
    effectFn: 'multiHit',
    cooldown: 2,
    currentCooldown: 0,
  },
  {
    id: 'gekogekoga-kageuchi',
    name: 'shadow-sneak',
    nameJa: 'かげうち',
    type: 'dark',
    priority: 120,
    power: 30,
    move: 3,
    attackRange: 1,
    effect: '3マス移動後、隣接1体に攻撃',
    cooldown: 2,
    currentCooldown: 0,
  },
];

export const GEKOGEKOGA: ChampionDefinition = {
  id: 'gekogekoga',
  name: 'Gekogekoga',
  nameJa: 'ゲコゲコガ',
  type: 'water',
  hp: 80,
  ability: 'protean',
  abilityDesc: 'へんげんじざい: 技を使用すると、その技のタイプに変化する',
  cards: gekogekogaCards,
  ultimateCard: {
    id: 'gekogekoga-ultimate',
    name: 'hydro-pump',
    nameJa: 'ハイドロポンプ',
    type: 'water',
    priority: 30, // 遅いが超高威力
    power: 150,
    move: 0,
    attackRange: 3,
    effect: '3マス以内の1体に絶大なダメージ',
    cooldown: 6,
    currentCooldown: 0,
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
    priority: 110,
    power: 0,
    move: 5,
    attackRange: 0,
    effect: '直線方向に5マスまで移動',
    effectFn: 'linearMove',
    cooldown: 1,
    currentCooldown: 0,
  },
  {
    id: 'kidouba-fumitsuke',
    name: 'stomp',
    nameJa: 'ふみつけ',
    type: 'ground',
    priority: 60,
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
    priority: 70,
    power: 80,
    move: 1,
    attackRange: 1,
    effect: '隣接1体に攻撃。30%で相手をひるませる',
    effectFn: 'flinch',
    cooldown: 2,
    currentCooldown: 0,
  },
];

export const KIDOUBA: ChampionDefinition = {
  id: 'kidouba',
  name: 'Kidouba',
  nameJa: '機動馬',
  type: 'steel',
  hp: 70,
  ability: 'steelArmor',
  abilityDesc: '装甲: 受けるダメージを常時10軽減する',
  cards: kidoubaCards,
  ultimateCard: {
    id: 'kidouba-ultimate',
    name: 'heavy-slam',
    nameJa: 'ヘビーボンバー',
    type: 'steel',
    priority: 40,
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
    priority: 65,
    power: 90,
    move: 0,
    attackRange: 2,
    isDirectional: true,
    lineRange: 2,
    effect: '指定方向に2マス範囲攻撃（ブロックを貫通しない）',
    cooldown: 3,
    currentCooldown: 0,
  },
  {
    id: 'enshishi-flaredrive',
    name: 'flare-blitz',
    nameJa: 'フレアドライブ',
    type: 'fire',
    priority: 80,
    power: 120,
    move: 2,
    attackRange: 1,
    effect: '2マス移動後、隣接1体に攻撃。自分も1/3ダメージを受ける',
    effectFn: 'recoil',
    cooldown: 3,
    currentCooldown: 0,
  },
  {
    id: 'enshishi-honoonokiba',
    name: 'fire-fang',
    nameJa: 'ほのおのキバ',
    type: 'fire',
    priority: 95,
    power: 65,
    move: 1,
    attackRange: 1,
    effect: '隣接1体に攻撃。10%で相手をやけど状態にする',
    effectFn: 'burn',
    cooldown: 2,
    currentCooldown: 0,
  },
];

export const ENSHISHI: ChampionDefinition = {
  id: 'enshishi',
  name: 'Enshishi',
  nameJa: '炎獅子',
  type: 'fire',
  hp: 85,
  ability: 'blaze',
  abilityDesc: 'もうか: HPが1/3以下のとき、ほのお技の威力が1.5倍',
  cards: enshishiCards,
  ultimateCard: {
    id: 'enshishi-ultimate',
    name: 'blast-burn',
    nameJa: 'ブラストバーン',
    type: 'fire',
    priority: 35,
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
    priority: 70,
    power: 90,
    move: 0,
    attackRange: 2,
    effect: '2マス以内の1体に攻撃。10%で相手をまひ状態にする',
    effectFn: 'paralyze',
    cooldown: 3,
    currentCooldown: 0,
  },
  {
    id: 'raichou-denkousekka',
    name: 'quick-attack',
    nameJa: 'でんこうせっか',
    type: 'normal',
    priority: 115,
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
    priority: 85,
    power: 70,
    move: 0,
    attackRange: 2,
    effect: '2マス以内の1体に攻撃。成功時、控えと交代',
    effectFn: 'uturn',
    cooldown: 2,
    currentCooldown: 0,
  },
];

export const RAICHOU: ChampionDefinition = {
  id: 'raichou',
  name: 'Raichou',
  nameJa: '雷鳥',
  type: 'electric',
  hp: 75,
  ability: 'static',
  abilityDesc: 'せいでんき: 接触攻撃を受けたとき、30%で相手をまひ状態にする',
  cards: raichouCards,
  ultimateCard: {
    id: 'raichou-ultimate',
    name: 'thunder',
    nameJa: 'かみなり',
    type: 'electric',
    priority: 130, // 非常に速い
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
