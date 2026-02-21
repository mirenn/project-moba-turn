import React from 'react';
import { GekogekogaIcon } from './GekogekogaIcon';
import { KidoubaIcon } from './KidoubaIcon';
import { EnshishiIcon } from './EnshishiIcon';
import { RaichouIcon } from './RaichouIcon';
import { ChampionInstance, Team } from '../../game/types';
import { Shield, Zap, Droplets, Flame, Bug, Moon, Cog, Target, Droplet } from 'lucide-react';

interface ChampionIconProps {
    championId: string;
    className?: string;
    isEnemy?: boolean;
}

export const ChampionIcon: React.FC<ChampionIconProps> = ({ championId, className = '', isEnemy = false }) => {
    // SVGコンポーネントのマッピング
    switch (championId) {
        case 'gekogekoga':
            return <GekogekogaIcon className={className} />;
        case 'kidouba':
            return <KidoubaIcon className={className} />;
        case 'enshishi':
            return <EnshishiIcon className={className} />;
        case 'raichou':
            return <RaichouIcon className={className} />;
        default:
            // フォールバック: 実装されていないチャンピオン用の汎用アイコン
            return (
                <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
                    <circle cx="50" cy="50" r="45" fill={isEnemy ? "#991B1B" : "#1E3A8A"} />
                    <text x="50" y="55" fontSize="40" fill="white" textAnchor="middle" dominantBaseline="middle" fontWeight="bold">
                        {championId.charAt(0).toUpperCase()}
                    </text>
                </svg>
            );
    }
};
