import React from 'react';

export const FireEffect: React.FC<{ className?: string }> = ({ className = '' }) => {
    return (
        <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="fireGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#fff" stopOpacity="1" />
                    <stop offset="40%" stopColor="#fca5a5" stopOpacity="0.9" />
                    <stop offset="70%" stopColor="#ef4444" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#7f1d1d" stopOpacity="0" />
                </radialGradient>
            </defs>

            {/* Central explosion */}
            <circle cx="50" cy="50" r="30" fill="url(#fireGrad)" className="animate-ping" style={{ animationDuration: '0.5s' }} />

            {/* Flames */}
            <path d="M50 80 Q 20 50 50 10 Q 80 50 50 80" fill="#ef4444" opacity="0.8">
                <animate attributeName="d" values="M50 80 Q 20 50 50 10 Q 80 50 50 80; M50 85 Q 10 50 50 5 Q 90 50 50 85; M50 80 Q 20 50 50 10 Q 80 50 50 80" dur="0.4s" repeatCount="1" />
            </path>

            {/* Inner Flame */}
            <path d="M50 70 Q 30 50 50 20 Q 70 50 50 70" fill="#fca5a5" opacity="0.9">
                <animate attributeName="d" values="M50 70 Q 30 50 50 20 Q 70 50 50 70; M50 75 Q 25 50 50 15 Q 75 50 50 75; M50 70 Q 30 50 50 20 Q 70 50 50 70" dur="0.4s" repeatCount="1" />
            </path>

            {/* Sparks */}
            <circle cx="30" cy="30" r="4" fill="#fb923c" />
            <circle cx="70" cy="40" r="5" fill="#facc15" />
            <circle cx="40" cy="70" r="3" fill="#fbbf24" />
            <circle cx="60" cy="20" r="4" fill="#f97316" />
        </svg>
    );
};
