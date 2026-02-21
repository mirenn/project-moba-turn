import React from 'react';

export const PhysicalEffect: React.FC<{ className?: string }> = ({ className = '' }) => {
    return (
        <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="slashGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0" />
                    <stop offset="20%" stopColor="#fff" stopOpacity="1" />
                    <stop offset="50%" stopColor="#e2e8f0" stopOpacity="1" />
                    <stop offset="80%" stopColor="#94a3b8" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#475569" stopOpacity="0" />
                </linearGradient>
            </defs>

            {/* Primary Slash */}
            <path d="M 10 20 Q 50 60 90 80 L 85 85 Q 45 65 5 25 Z" fill="url(#slashGrad)">
                <animate attributeName="opacity" values="0; 1; 1; 0" dur="0.3s" />
                <animateTransform attributeName="transform" type="translate" values="-10 -10; 0 0; 0 0" dur="0.2s" />
            </path>

            {/* Secondary Slash (smaller, slightly offset) */}
            <path d="M 30 15 Q 60 45 95 65 L 92 68 Q 57 48 27 18 Z" fill="url(#slashGrad)" opacity="0.7">
                <animate attributeName="opacity" values="0; 0; 0.8; 0" dur="0.4s" />
            </path>

            {/* Impact star/burst in center */}
            <g stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round">
                <line x1="45" y1="45" x2="35" y2="35">
                    <animate attributeName="x2" values="45; 35" dur="0.2s" />
                    <animate attributeName="y2" values="45; 35" dur="0.2s" />
                </line>
                <line x1="55" y1="55" x2="65" y2="65">
                    <animate attributeName="x2" values="55; 65" dur="0.2s" />
                    <animate attributeName="y2" values="55; 65" dur="0.2s" />
                </line>
                <line x1="45" y1="55" x2="35" y2="65">
                    <animate attributeName="x2" values="45; 35" dur="0.2s" />
                    <animate attributeName="y2" values="55; 65" dur="0.2s" />
                </line>
                <line x1="55" y1="45" x2="65" y2="35">
                    <animate attributeName="x2" values="55; 65" dur="0.2s" />
                    <animate attributeName="y2" values="45; 35" dur="0.2s" />
                </line>
            </g>
        </svg>
    );
};
