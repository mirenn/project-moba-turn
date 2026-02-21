import React from 'react';

interface ChampionIconProps {
    className?: string;
}

export const GekogekogaIcon: React.FC<ChampionIconProps> = ({ className = '' }) => {
    return (
        <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
            {/* Background/Base */}
            <circle cx="50" cy="50" r="45" fill="#1E3A8A" /> {/* Dark Blue */}

            {/* Ninja Scarf (Pink) wrapping around */}
            <path d="M 5,50 Q 50,30 95,50 Q 80,75 50,75 Q 20,75 5,50 Z" fill="#EC4899" />
            <path d="M 85,55 C 95,70 90,90 75,95 C 60,65 75,50 85,55 Z" fill="#DB2777" />

            {/* Frog Head/Face */}
            <path d="M 25,55 Q 50,20 75,55 Q 50,90 25,55 Z" fill="#3B82F6" /> {/* Main Blue */}

            {/* Eyes */}
            <circle cx="35" cy="45" r="8" fill="#FFFFFF" />
            <circle cx="65" cy="45" r="8" fill="#FFFFFF" />

            {/* Pupils (narrowed/sharp like a ninja) */}
            <rect x="33" y="41" width="4" height="8" fill="#111827" transform="rotate(20 35 45)" />
            <rect x="63" y="41" width="4" height="8" fill="#111827" transform="rotate(-20 65 45)" />

            {/* White face markings */}
            <circle cx="50" cy="65" r="3" fill="#FFFFFF" opacity="0.8" />
            <path d="M 40,60 Q 50,68 60,60" fill="none" stroke="#FFFFFF" strokeWidth="2" opacity="0.6" strokeLinecap="round" />

            {/* Minimal highlight for depth */}
            <path d="M 20,40 A 35,35 0 0,1 80,40" fill="none" stroke="#93C5FD" strokeWidth="3" opacity="0.4" strokeLinecap="round" />
        </svg>
    );
};
