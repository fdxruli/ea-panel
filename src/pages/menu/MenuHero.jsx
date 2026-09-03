import React from 'react';
import styles from '../Menu.module.css';

const MenuHero = ({
    selectedCategory,
    selectedCategoryLabel,
    heroDescription,
    isBusinessOpen,
    businessStatusMessage,
}) => (
    <section className={styles.menuHero}>
        <div className={styles.heroCopy}>
            <h1>{selectedCategory ? selectedCategoryLabel : '¿Qué se te antoja hoy?'}</h1>
            <p>{heroDescription}</p>
        </div>

        <div className={styles.heroStats}>
            <span className={`${styles.heroStatus} ${isBusinessOpen ? styles.heroStatusOpen : styles.heroStatusClosed}`}>
                <span className={styles.statusDot}></span>
                {isBusinessOpen ? 'Abierto • Recibe en minutos' : 'Cerrado por ahora'}
            </span>
            {businessStatusMessage && <span className={styles.heroMessage}>{businessStatusMessage}</span>}
        </div>
    </section>
);

export default MenuHero;
