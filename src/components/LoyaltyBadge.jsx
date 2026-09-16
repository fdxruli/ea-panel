import React from 'react';
import { LOYALTY_CATEGORIES } from '../lib/loyalty';
import styles from './LoyaltyBadge.module.css';

export const CrownIcon = ({ size = 15, className }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
    >
        <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" />
    </svg>
);

const BADGE_CONFIG = Object.freeze({
    [LOYALTY_CATEGORIES.VIP]: {
        label: 'Cliente VIP',
        emoji: '👑',
        styleClass: styles.vipBadge,
        benefitHint: 'Accedes a beneficios exclusivos.',
    },
    [LOYALTY_CATEGORIES.FRECUENTE]: {
        label: 'Cliente Frecuente',
        emoji: '⭐',
        styleClass: styles.frecuenteBadge,
        benefitHint: 'Obtienes beneficios por tu recurrencia.',
    },
    [LOYALTY_CATEGORIES.INICIAL]: {
        label: 'Cliente Inicial',
        emoji: '🌱',
        styleClass: styles.inicialBadge,
        benefitHint: 'Comienza a disfrutar beneficios.',
    },
});

export default function LoyaltyBadge({ category, showHint = false }) {
    const safeCategory = (category || '').toLowerCase();
    const config = BADGE_CONFIG[safeCategory] || BADGE_CONFIG[LOYALTY_CATEGORIES.INICIAL];

    return (
        <div
            className={`${styles.badge} ${config.styleClass}`}
            role="status"
            aria-label={`${config.label}: ${config.benefitHint}`}
            title={config.benefitHint}
        >
            <span className={styles.icon} aria-hidden="true">{config.emoji}</span>
            <span>{config.label}</span>
            {showHint && <span className={styles.hint}>— {config.benefitHint}</span>}
        </div>
    );
}
