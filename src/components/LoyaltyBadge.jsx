import React from 'react';
import { LOYALTY_CATEGORIES } from '../lib/loyalty';
import styles from './LoyaltyBadge.module.css';

const CONFIG = {
    [LOYALTY_CATEGORIES.VIP]: { icon: '👑', label: 'Cliente VIP' },
    [LOYALTY_CATEGORIES.FRECUENTE]: { icon: '⭐', label: 'Cliente Frecuente' },
    [LOYALTY_CATEGORIES.INICIAL]: { icon: '🌱', label: 'Cliente Inicial' },
};

export default function LoyaltyBadge({ category }) {
    const config = CONFIG[category];
    if (!config) return null;

    return (
        <div className={`${styles.badge} ${styles[category]}`} role="status" aria-label={config.label}>
            <span aria-hidden="true">{config.icon}</span>
            <span>{config.label}</span>
        </div>
    );
}
