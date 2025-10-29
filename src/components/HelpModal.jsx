import React from 'react';
import styles from './HelpModal.module.css';

export default function HelpModal({ isOpen, onClose, title, content }) {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h4>{title}</h4>
          <button onClick={onClose} className={styles.closeButton}>×</button>
        </div>
        <div className={styles.modalBody}>
          <p>{content}</p>
        </div>
      </div>
    </div>
  );
}