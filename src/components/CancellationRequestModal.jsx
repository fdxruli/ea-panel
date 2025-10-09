import React, { useState } from 'react';
import styles from './CancellationRequestModal.module.css';

export default function CancellationRequestModal({ order, onClose }) {
  const [reason, setReason] = useState('');
  const businessPhoneNumber = import.meta.env.VITE_BUSINESS_PHONE; // Reemplaza con tu número de WhatsApp

  const handleSendRequest = () => {
    if (!reason.trim()) {
      alert('Por favor, escribe el motivo de la cancelación.');
      return;
    }
    const message = `¡Hola! 👋 Quisiera solicitar la cancelación de mi pedido *${order.order_code}*.\n\n*Motivo:* ${reason}`;
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${businessPhoneNumber}&text=${encodeURIComponent(message)}`;
    
    window.open(whatsappUrl, '_blank');
    onClose();
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modalContent}>
        <button onClick={onClose} className={styles.closeButton}>×</button>
        <h2>Solicitar Cancelación</h2>
        <p>
          Tu pedido ya está <strong>en proceso</strong> y no se puede cancelar automáticamente.
          Para solicitar la cancelación, por favor describe el motivo y envía un mensaje a nuestro chat.
        </p>
        <textarea
          rows="4"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Escribe aquí el motivo de la cancelación..."
          className={styles.reasonTextarea}
        />
        <button onClick={handleSendRequest} className={styles.sendButton}>
          Enviar Solicitud por WhatsApp
        </button>
      </div>
    </div>
  );
}