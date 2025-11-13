// src/components/PasswordResetModal.jsx
import React from 'react';
import styles from './PasswordResetModal.module.css';

// Icono de WhatsApp
const WhatsAppIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 12c0 1.77.46 3.45 1.26 4.96L2 22l5.3-1.38c1.44.75 3.06 1.18 4.74 1.18h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zM17.6 15.96c-.22-.11-.76-.38-1.02-.49-.26-.11-.45-.16-.64.16-.19.32-.72.9-.88 1.09-.16.19-.32.22-.59.08-.27-.14-1.15-.42-2.18-1.34-.8-.72-1.34-1.61-1.5-1.88-.16-.27-.02-.42.1-.56.11-.13.24-.32.36-.48.12-.16.16-.27.24-.45.08-.19.04-.35-.02-.48s-.64-1.53-.87-2.1-.47-.48-.64-.48-.35-.01-.54-.01c-.19 0-.48.07-.72.35-.24.27-.92 1-.92 2.42s.94 2.8 1.07 3s1.86 2.86 4.5 3.97c.61.26 1.09.42 1.47.53.6.19 1.14.16 1.56.1.47-.07 1.48-.6 1.69-1.18.21-.58.21-1.07.15-1.18-.07-.11-.26-.16-.48-.27z"/>
  </svg>
);

export default function PasswordResetModal({ onClose }) {
  // Obtener el número de teléfono desde las variables de entorno
  const businessPhoneNumber = import.meta.env.VITE_BUSINESS_PHONE;
  
  // Mensaje predeterminado
  const defaultMessage = "¡Hola! He olvidado mi contraseña del panel de administrador, ¿me podrían ayudar a recuperarla?";
  
  // Construir la URL de WhatsApp
  const whatsappUrl = `https://api.whatsapp.com/send?phone=${businessPhoneNumber}&text=${encodeURIComponent(defaultMessage)}`;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className={styles.closeButton}>×</button>
        
        <h2>Recuperar Contraseña</h2>
        <p>
          Para restablecer tu contraseña, por favor contacta a Entre Alas
          directamente a través de WhatsApp.
        </p>
        <p className={styles.note}>
          Un administrador verificará tu identidad y te ayudará a crear una nueva contraseña.
        </p>
        
        <a 
          href={whatsappUrl} 
          target="_blank" 
          rel="noopener noreferrer" 
          className={styles.whatsappButton}
        >
          <WhatsAppIcon className={styles.icon} />
          Contactar por WhatsApp
        </a>
      </div>
    </div>
  );
}