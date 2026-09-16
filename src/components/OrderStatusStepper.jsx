import React from 'react';
import styles from './OrderStatusStepper.module.css';

const STEPS = [
    {
        key: 'pendiente',
        label: 'Recibido',
        description: 'Pedido registrado',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
            </svg>
        ),
    },
    {
        key: 'en_proceso',
        label: 'En cocina',
        description: 'Preparando tus alas',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 13.8V4a2 2 0 0 1 4 0v9.8" />
                <path d="M10 9H6" />
                <path d="M14 4v10" />
                <path d="M14 9h4" />
                <path d="M18 4v10" />
                <rect x="3" y="14" width="18" height="6" rx="2" />
            </svg>
        ),
    },
    {
        key: 'en_envio',
        label: 'En camino',
        description: 'Repartidor en ruta',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18.5" cy="17.5" r="3.5" />
                <circle cx="5.5" cy="17.5" r="3.5" />
                <circle cx="15" cy="5" r="1" />
                <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
            </svg>
        ),
    },
    {
        key: 'completado',
        label: 'Entregado',
        description: '¡Buen provecho!',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
        ),
    },
];

const STATUS_INDEX = {
    pendiente: 0,
    en_proceso: 1,
    en_envio: 2,
    completado: 3,
};

export default function OrderStatusStepper({ status, cancellationReason, compact = false }) {
    if (status === 'cancelado') {
        return (
            <div className={styles.cancelledContainer}>
                <div className={styles.cancelledHeader}>
                    <div className={styles.cancelledIcon}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                    </div>
                    <div>
                        <div className={styles.cancelledTitle}>Pedido Cancelado</div>
                        {cancellationReason && (
                            <div className={styles.cancelledReason}>{cancellationReason}</div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    const currentStepIndex = STATUS_INDEX[status] ?? 0;
    const progressPercent = Math.min(100, Math.max(0, (currentStepIndex / (STEPS.length - 1)) * 100));

    return (
        <div className={`${styles.stepperWrapper} ${compact ? styles.compact : ''}`}>
            <div className={styles.progressTrack}>
                <div
                    className={styles.progressBar}
                    style={{ width: `${progressPercent}%` }}
                />
            </div>

            <div className={styles.stepsContainer}>
                {STEPS.map((step, idx) => {
                    const isCompleted = idx < currentStepIndex;
                    const isCurrent = idx === currentStepIndex;

                    let stepClass = styles.stepUpcoming;
                    if (isCompleted) stepClass = styles.stepCompleted;
                    else if (isCurrent) stepClass = styles.stepCurrent;

                    return (
                        <div key={step.key} className={`${styles.stepItem} ${stepClass}`}>
                            <div className={styles.stepCircle}>
                                {isCompleted ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                ) : (
                                    step.icon
                                )}
                            </div>
                            <div className={styles.stepContent}>
                                <span className={styles.stepLabel}>{step.label}</span>
                                {!compact && (
                                    <span className={styles.stepDesc}>{step.description}</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
