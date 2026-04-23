import React from 'react';
import styles from './DashboardSkeleton.module.css';

const StatCardSkeleton = () => (
    <div className={styles.statCard}>
        <div className={styles.statInfo}>
            <div className={`${styles.skeletonLine} ${styles.titleLine}`} />
            <div className={`${styles.skeletonLine} ${styles.valueLine}`} />
            <div className={`${styles.skeletonLine} ${styles.subtitleLine}`} />
        </div>
        <div className={styles.iconPlaceholder} />
    </div>
);

const ChartCardSkeleton = ({ title = true, header = false }) => (
    <div className={styles.chartCard}>
        {title && <div className={`${styles.skeletonLine} ${styles.chartTitle}`} />}
        {header && (
            <div className={styles.chartHeader}>
                <div className={`${styles.skeletonLine} ${styles.headerTitle}`} />
                <div className={`${styles.skeletonLine} ${styles.exportButton}`} />
            </div>
        )}
        <div className={styles.chartPlaceholder} />
    </div>
);

const ProfitableItemSkeleton = () => (
    <div className={styles.profitableItem}>
        <div className={styles.productInfo}>
            <div className={`${styles.skeletonLine} ${styles.productName}`} />
            <div className={`${styles.skeletonLine} ${styles.productStats}`} />
            <div className={`${styles.skeletonLine} ${styles.productPricing}`} />
        </div>
        <div className={`${styles.skeletonLine} ${styles.productProfit}`} />
    </div>
);

const RecentOrderSkeleton = () => (
    <li className={styles.recentItem}>
        <div className={`${styles.skeletonLine} ${styles.customerName}`} />
        <div className={styles.orderInfo}>
            <div className={`${styles.skeletonLine} ${styles.orderAmount}`} />
            <div className={`${styles.skeletonLine} ${styles.statusBadge}`} />
        </div>
    </li>
);

const DashboardSkeleton = () => {
    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={`${styles.skeletonLine} ${styles.title}`} />
                <div className={`${styles.skeletonLine} ${styles.subtitle}`} />
            </div>

            <div className={styles.statsGrid}>
                {Array.from({ length: 8 }).map((_, i) => (
                    <StatCardSkeleton key={i} />
                ))}
            </div>

            <div className={styles.mainGrid}>
                <ChartCardSkeleton title header />
                <ChartCardSkeleton title header />
                <div className={`${styles.chartCard} ${styles.topProducts}`}>
                    <div className={`${styles.skeletonLine} ${styles.chartTitle}`} />
                    <div className={styles.profitableList}>
                        {Array.from({ length: 5 }).map((_, i) => (
                            <ProfitableItemSkeleton key={i} />
                        ))}
                    </div>
                </div>
                <div className={`${styles.chartCard} ${styles.recentOrders}`}>
                    <div className={`${styles.skeletonLine} ${styles.chartTitle}`} />
                    <ul className={styles.recentList}>
                        {Array.from({ length: 5 }).map((_, i) => (
                            <RecentOrderSkeleton key={i} />
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default DashboardSkeleton;
