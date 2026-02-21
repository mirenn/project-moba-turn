import React from 'react';

export const ElectricEffect: React.FC<{ className?: string }> = ({ className = '' }) => {
    return (
        <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
            <defs>
                <filter id="glow">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                    <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {/* Central bright flash */}
            <circle cx="50" cy="50" r="20" fill="#fef08a" opacity="0.8">
                <animate attributeName="opacity" values="1; 0.2; 0.8; 0" dur="0.4s" repeatCount="1" />
            </circle>

            {/* Main lightning bolts */}
            <g stroke="#eab308" strokeWidth="4" fill="none" filter="url(#glow)" strokeLinecap="round" strokeLinejoin="round">
                <path d="M 50 10 L 40 40 L 60 45 L 30 90">
                    <animate attributeName="opacity" values="1; 0; 1; 0" dur="0.3s" repeatCount="1" />
                </path>
                <path d="M 20 30 L 45 50 L 35 70 L 80 80">
                    <animate attributeName="opacity" values="0; 1; 0; 1; 0" dur="0.4s" repeatCount="1" />
                </path>
            </g>

            {/* Inner whiter bolts */}
            <g stroke="#fefce8" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M 50 15 L 42 42 L 58 43 L 35 85">
                    <animate attributeName="opacity" values="1; 0; 1; 0" dur="0.3s" repeatCount="1" />
                </path>
            </g>

            {/* Sparks */}
            <circle cx="20" cy="20" r="3" fill="#fde047" />
            <circle cx="80" cy="30" r="4" fill="#fef08a" />
            <circle cx="70" cy="70" r="2" fill="#fde047" />
        </svg>
    );
};
