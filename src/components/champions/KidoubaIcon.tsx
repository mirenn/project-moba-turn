import React from 'react';

interface ChampionIconProps {
    className?: string;
}

export const KidoubaIcon: React.FC<ChampionIconProps> = ({ className = '' }) => {
    return (
        <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
            {/* Background/Base */}
            <circle cx="50" cy="50" r="45" fill="#4B5563" /> {/* Steel Gray */}

            {/* Mechanical Mane */}
            <polygon points="20,80 30,30 45,45 55,25 70,45 80,30 80,80" fill="#9CA3AF" />

            {/* Horse Head Base */}
            <path d="M 25,60 L 35,25 L 75,35 L 85,75 Q 85,85 50,85 Q 20,80 25,60 Z" fill="#6B7280" stroke="#374151" strokeWidth="2" />

            {/* Mechanical Armor Plates */}
            <path d="M 35,25 L 75,35 L 65,55 L 45,55 Z" fill="#D1D5DB" stroke="#4B5563" strokeWidth="2" />
            <path d="M 28,60 L 45,55 L 65,55 L 82,75 Q 70,82 50,82 Z" fill="#9CA3AF" stroke="#374151" strokeWidth="2" />

            {/* Robotic Eye */}
            <circle cx="60" cy="45" r="6" fill="#1F2937" />
            <circle cx="60" cy="45" r="3" fill="#EF4444" /> {/* Glowing Red Eye */}
            <circle cx="61" cy="44" r="1.5" fill="#FCA5A5" /> {/* Glint */}

            {/* Snout/Muzzle Grill */}
            <line x1="72" y1="65" x2="80" y2="60" stroke="#374151" strokeWidth="2" strokeLinecap="round" />
            <line x1="75" y1="70" x2="82" y2="65" stroke="#374151" strokeWidth="2" strokeLinecap="round" />

            {/* Ear / Antenna */}
            <polygon points="35,25 40,10 48,25" fill="#D1D5DB" stroke="#374151" strokeWidth="2" />

            {/* Highlight for metallic feel */}
            <path d="M 30,35 Q 50,28 70,36" fill="none" stroke="#F3F4F6" strokeWidth="3" opacity="0.6" strokeLinecap="round" />
        </svg>
    );
};
