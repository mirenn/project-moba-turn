import React from 'react';

export const WaterEffect: React.FC<{ className?: string }> = ({ className = '' }) => {
    return (
        <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="waterGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#eff6ff" stopOpacity="1" />
                    <stop offset="40%" stopColor="#93c5fd" stopOpacity="0.9" />
                    <stop offset="70%" stopColor="#3b82f6" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0" />
                </radialGradient>
            </defs>

            {/* Central splash */}
            <circle cx="50" cy="50" r="25" fill="url(#waterGrad)" />

            {/* Droplets radiating outward */}
            <g fill="#60a5fa">
                <circle cx="50" cy="15" r="6" />
                <circle cx="85" cy="50" r="7" />
                <circle cx="50" cy="85" r="5" />
                <circle cx="15" cy="50" r="8" />

                <circle cx="25" cy="25" r="4" />
                <circle cx="75" cy="25" r="5" />
                <circle cx="75" cy="75" r="4" />
                <circle cx="25" cy="75" r="6" />
            </g>

            {/* Water impact rings */}
            <circle cx="50" cy="50" r="35" fill="none" stroke="#bfdbfe" strokeWidth="4" opacity="0.6">
                <animate attributeName="r" values="10; 45" dur="0.4s" />
                <animate attributeName="opacity" values="0.8; 0" dur="0.4s" />
            </circle>
            <circle cx="50" cy="50" r="20" fill="none" stroke="#93c5fd" strokeWidth="3" opacity="0.8">
                <animate attributeName="r" values="5; 30" dur="0.3s" />
                <animate attributeName="opacity" values="1; 0" dur="0.3s" />
            </circle>
        </svg>
    );
};
