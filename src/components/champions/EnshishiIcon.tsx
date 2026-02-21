import React from 'react';

interface ChampionIconProps {
    className?: string;
}

export const EnshishiIcon: React.FC<ChampionIconProps> = ({ className = '' }) => {
    return (
        <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
            {/* Background/Base */}
            <circle cx="50" cy="50" r="45" fill="#B91C1C" /> {/* Red */}

            {/* Flaming Mane */}
            <path d="M 50,10 Q 70,10 85,25 Q 75,40 90,50 Q 80,70 70,85 Q 50,95 30,85 Q 20,70 10,50 Q 25,40 15,25 Q 30,10 50,10 Z" fill="#F97316" /> {/* Orange */}
            <path d="M 50,15 Q 65,15 75,30 Q 65,42 80,50 Q 70,65 65,75 Q 50,85 35,75 Q 30,65 20,50 Q 35,42 25,30 Q 35,15 50,15 Z" fill="#FACC15" /> {/* Yellow */}

            {/* Lion Face Base */}
            <circle cx="50" cy="55" r="22" fill="#FCD34D" /> {/* Warm tan */}

            {/* Ears */}
            <circle cx="32" cy="40" r="8" fill="#FCD34D" />
            <circle cx="32" cy="40" r="4" fill="#B45309" />
            <circle cx="68" cy="40" r="8" fill="#FCD34D" />
            <circle cx="68" cy="40" r="4" fill="#B45309" />

            {/* Eyes - Fierce expression */}
            <path d="M 35,50 Q 40,46 45,50 Q 40,54 35,50 Z" fill="#111827" />
            <path d="M 65,50 Q 60,46 55,50 Q 60,54 65,50 Z" fill="#111827" />
            <circle cx="43" cy="50" r="1.5" fill="#EF4444" /> {/* Red glowing pupil */}
            <circle cx="57" cy="50" r="1.5" fill="#EF4444" />

            {/* Angry Eyebrows */}
            <path d="M 32,46 L 46,48" stroke="#78350F" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M 68,46 L 54,48" stroke="#78350F" strokeWidth="2.5" strokeLinecap="round" />

            {/* Nose & Snout */}
            <path d="M 45,60 L 55,60 L 50,65 Z" fill="#78350F" />
            <path d="M 50,65 Q 45,70 40,68" stroke="#78350F" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M 50,65 Q 55,70 60,68" stroke="#78350F" strokeWidth="2" fill="none" strokeLinecap="round" />

            {/* Whisker dots */}
            <circle cx="40" cy="62" r="1" fill="#B45309" />
            <circle cx="42" cy="64" r="1" fill="#B45309" />
            <circle cx="60" cy="62" r="1" fill="#B45309" />
            <circle cx="58" cy="64" r="1" fill="#B45309" />
        </svg>
    );
};
