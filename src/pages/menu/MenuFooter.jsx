import React from 'react';
import styles from '../Menu.module.css';

const MenuFooter = () => (
    <footer className={styles.seoFooter}>
        <div className={styles.footerContent}>
            <div className={styles.socialProof}>
                <span className={styles.socialProofText}>¿Aún no te decides?</span>
                <a
                    href="https://www.facebook.com/EntreAlasDarkitchen"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.socialProofLink}
                >
                    Conocenos más en Facebook
                </a>
            </div>
            <div className={styles.footerBottom}>
                <p>&copy; {new Date().getFullYear()} Entre Alas. Todos los derechos reservados.</p>
            </div>
        </div>
    </footer>
);

export default MenuFooter;
