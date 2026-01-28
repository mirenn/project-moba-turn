import { ElementType } from './types';

// タイプ相性表
// 効果抜群: 2.0 (GAME_DESIGN.mdでは1.5とあるが、ポケモン風に2.0を採用。調整可能)
// いまひとつ: 0.5
// 無効: 0
// 通常: 1.0 (記載なし)

// GAME_DESIGN.mdの指定に合わせて倍率を調整
export const TYPE_EFFECTIVENESS = {
  SUPER_EFFECTIVE: 1.5,
  NOT_VERY_EFFECTIVE: 0.5,
  NO_EFFECT: 0,
  NORMAL: 1.0,
  STAB: 1.5, // タイプ一致ボーナス
};

// 攻撃タイプ -> 防御タイプ -> 効果
type EffectivenessChart = Partial<Record<ElementType, Partial<Record<ElementType, number>>>>;

// ポケモン第9世代ベースの簡略化相性表
const typeChart: EffectivenessChart = {
  normal: {
    rock: 0.5,
    ghost: 0,
    steel: 0.5,
  },
  fire: {
    fire: 0.5,
    water: 0.5,
    grass: 2.0,
    ice: 2.0,
    bug: 2.0,
    rock: 0.5,
    dragon: 0.5,
    steel: 2.0,
  },
  water: {
    fire: 2.0,
    water: 0.5,
    grass: 0.5,
    ground: 2.0,
    rock: 2.0,
    dragon: 0.5,
  },
  electric: {
    water: 2.0,
    electric: 0.5,
    grass: 0.5,
    ground: 0,
    flying: 2.0,
    dragon: 0.5,
  },
  grass: {
    fire: 0.5,
    water: 2.0,
    grass: 0.5,
    poison: 0.5,
    ground: 2.0,
    flying: 0.5,
    bug: 0.5,
    rock: 2.0,
    dragon: 0.5,
    steel: 0.5,
  },
  ice: {
    fire: 0.5,
    water: 0.5,
    grass: 2.0,
    ice: 0.5,
    ground: 2.0,
    flying: 2.0,
    dragon: 2.0,
    steel: 0.5,
  },
  fighting: {
    normal: 2.0,
    ice: 2.0,
    poison: 0.5,
    flying: 0.5,
    psychic: 0.5,
    bug: 0.5,
    rock: 2.0,
    ghost: 0,
    dark: 2.0,
    steel: 2.0,
    fairy: 0.5,
  },
  poison: {
    grass: 2.0,
    poison: 0.5,
    ground: 0.5,
    rock: 0.5,
    ghost: 0.5,
    steel: 0,
    fairy: 2.0,
  },
  ground: {
    fire: 2.0,
    electric: 2.0,
    grass: 0.5,
    poison: 2.0,
    flying: 0,
    bug: 0.5,
    rock: 2.0,
    steel: 2.0,
  },
  flying: {
    electric: 0.5,
    grass: 2.0,
    fighting: 2.0,
    bug: 2.0,
    rock: 0.5,
    steel: 0.5,
  },
  psychic: {
    fighting: 2.0,
    poison: 2.0,
    psychic: 0.5,
    dark: 0,
    steel: 0.5,
  },
  bug: {
    fire: 0.5,
    grass: 2.0,
    fighting: 0.5,
    poison: 0.5,
    flying: 0.5,
    psychic: 2.0,
    ghost: 0.5,
    dark: 2.0,
    steel: 0.5,
    fairy: 0.5,
  },
  rock: {
    fire: 2.0,
    ice: 2.0,
    fighting: 0.5,
    ground: 0.5,
    flying: 2.0,
    bug: 2.0,
    steel: 0.5,
  },
  ghost: {
    normal: 0,
    psychic: 2.0,
    ghost: 2.0,
    dark: 0.5,
  },
  dragon: {
    dragon: 2.0,
    steel: 0.5,
    fairy: 0,
  },
  dark: {
    fighting: 0.5,
    psychic: 2.0,
    ghost: 2.0,
    dark: 0.5,
    fairy: 0.5,
  },
  steel: {
    fire: 0.5,
    water: 0.5,
    electric: 0.5,
    ice: 2.0,
    rock: 2.0,
    steel: 0.5,
    fairy: 2.0,
  },
  fairy: {
    fire: 0.5,
    fighting: 2.0,
    poison: 0.5,
    dragon: 2.0,
    dark: 2.0,
    steel: 0.5,
  },
};

/**
 * タイプ相性による倍率を取得
 * @param attackType 攻撃技のタイプ
 * @param defenseType 防御側のタイプ
 * @returns 倍率（2.0, 1.0, 0.5, 0）
 */
export function getTypeEffectiveness(attackType: ElementType, defenseType: ElementType): number {
  const attackChart = typeChart[attackType];
  if (!attackChart) return TYPE_EFFECTIVENESS.NORMAL;
  
  const effectiveness = attackChart[defenseType];
  if (effectiveness === undefined) return TYPE_EFFECTIVENESS.NORMAL;
  
  // GAME_DESIGN.mdの倍率に変換
  if (effectiveness >= 2.0) return TYPE_EFFECTIVENESS.SUPER_EFFECTIVE;
  if (effectiveness <= 0) return TYPE_EFFECTIVENESS.NO_EFFECT;
  if (effectiveness < 1.0) return TYPE_EFFECTIVENESS.NOT_VERY_EFFECTIVE;
  
  return TYPE_EFFECTIVENESS.NORMAL;
}

/**
 * ダメージ計算（タイプ相性 + STAB適用）
 * @param basePower 技の基本威力
 * @param attackType 攻撃技のタイプ
 * @param attackerType 攻撃者のタイプ
 * @param defenderType 防御者のタイプ
 * @returns 最終ダメージ
 */
export function calculateDamage(
  basePower: number,
  attackType: ElementType,
  attackerType: ElementType,
  defenderType: ElementType
): { damage: number; effectiveness: string } {
  let multiplier = 1.0;
  let effectivenessText = '';
  
  // STAB (Same Type Attack Bonus)
  if (attackType === attackerType) {
    multiplier *= TYPE_EFFECTIVENESS.STAB;
  }
  
  // タイプ相性
  const typeMultiplier = getTypeEffectiveness(attackType, defenderType);
  multiplier *= typeMultiplier;
  
  // 効果テキスト
  if (typeMultiplier >= TYPE_EFFECTIVENESS.SUPER_EFFECTIVE) {
    effectivenessText = '効果抜群！';
  } else if (typeMultiplier === TYPE_EFFECTIVENESS.NO_EFFECT) {
    effectivenessText = '効果なし...';
  } else if (typeMultiplier <= TYPE_EFFECTIVENESS.NOT_VERY_EFFECTIVE) {
    effectivenessText = 'いまひとつ...';
  }
  
  const damage = Math.floor(basePower * multiplier);
  
  return { damage, effectiveness: effectivenessText };
}
