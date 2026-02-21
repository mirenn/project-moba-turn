import React from 'react';
import { ElementType } from '../../game/types';
import { FireEffect } from './FireEffect';
import { WaterEffect } from './WaterEffect';
import { ElectricEffect } from './ElectricEffect';
import { PhysicalEffect } from './PhysicalEffect';

interface AttackEffectProps {
    element?: ElementType | string;
    className?: string; // used for animation classes
}

export const AttackEffect: React.FC<AttackEffectProps> = ({ element, className = '' }) => {
    // Combine custom positioning/animations passed from parent with full sizing
    const combinedClass = `absolute inset-0 w-full h-full z-30 pointer-events-none ${className}`;

    switch (element) {
        case 'fire':
            return <FireEffect className={combinedClass} />;
        case 'water':
        case 'ice':
            return <WaterEffect className={combinedClass} />;
        case 'electric':
            return <ElectricEffect className={combinedClass} />;
        case 'normal':
        case 'fighting':
        case 'steel':
        case 'rock':
        case 'ground':
        case 'flying':
            return <PhysicalEffect className={combinedClass} />;
        default:
            // Fallback to physical if no specific effect is defined yet for 'bug', 'dark', 'fairy', etc.
            // Alternatively, we could create more generic magic effects.
            return <PhysicalEffect className={combinedClass} />;
    }
};
