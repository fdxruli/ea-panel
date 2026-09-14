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

export default function LoyaltyBadge({ category }) {
    // Solo mostramos distintivo si es VIP
    if (category !== LOYALTY_CATEGORIES.VIP) return null;

    return (
        <div className={styles.vipBadge} role="status" aria-label="Cliente VIP">
            <CrownIcon size={14} />
            <span>Cliente VIP</span>
        </div>
    );
}
