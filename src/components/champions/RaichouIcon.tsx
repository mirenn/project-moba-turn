import React from 'react';

interface ChampionIconProps {
    className?: string;
}

export const RaichouIcon: React.FC<ChampionIconProps> = ({ className = '' }) => {
    return (
        <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
            {/* Background/Base */}
            <circle cx="50" cy="50" r="45" fill="#CA8A04" /> {/* Darker Yellow/Gold */}

            {/* Sharp Lightning Feathers Backing */}
            <polygon points="15,20 40,40 50,5 60,40 85,20 70,50 90,70 65,65 50,95 35,65 10,70 30,50" fill="#EAB308" />

            {/* Bird Body Core */}
            <circle cx="50" cy="55" r="24" fill="#FEF08A" />

            {/* Sharp Head Crest (Lightning shaped) */}
            <polygon points="50,45 40,20 50,30 60,15 55,35 65,25 50,50" fill="#FDE047" />

            {/* Wings / Shoulders */}
            <polygon points="26,55 10,50 20,65 5,75 30,70 26,55" fill="#FBBF24" />
            <polygon points="74,55 90,50 80,65 95,75 70,70 74,55" fill="#FBBF24" />

            {/* Eyes */}
            <path d="M 38,50 Q 42,46 45,52 Q 40,54 38,50 Z" fill="#000000" />
            <path d="M 62,50 Q 58,46 55,52 Q 60,54 62,50 Z" fill="#000000" />
            <circle cx="43" cy="50" r="1.5" fill="#FFFFFF" />
            <circle cx="57" cy="50" r="1.5" fill="#FFFFFF" />

            {/* Electric Eye Markings */}
            <polygon points="35,50 30,55 38,58" fill="#F59E0B" />
            <polygon points="65,50 70,55 62,58" fill="#F59E0B" />

            {/* Beak */}
            <polygon points="45,55 55,55 50,68" fill="#F97316" /> {/* Orange beak */}
            <line x1="47" y1="58" x2="53" y2="58" stroke="#C2410C" strokeWidth="1" />

            {/* Chest Pattern (Like static sparks) */}
            <polygon points="45,72 55,72 50,80" fill="#F59E0B" />
            <polygon points="40,68 45,72 40,76" fill="#F59E0B" />
            <polygon points="60,68 55,72 60,76" fill="#F59E0B" />
        </svg>
    );
};
