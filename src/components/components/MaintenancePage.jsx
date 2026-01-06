// src/components/MaintenancePage.jsx
import React from 'react';
import ServiceDownIcon from '../assets/icons/service.svg?react';
import styles from './MaintenancePage.module.css'; // Asegúrate de tener este archivo CSS

const MaintenancePage = ({ message }) => {
  // Obtenemos el número de teléfono desde las variables de entorno
  const businessPhoneNumber = import.meta.env.VITE_BUSINESS_PHONE;

  // Creamos la URL de WhatsApp (asumiendo que VITE_BUSINESS_PHONE es el número de 10 dígitos y añadimos el código de país 52 para México)
  // Limpiamos cualquier carácter no numérico por si acaso
  const whatsappUrl = businessPhoneNumber
    ? `https://wa.me/52${businessPhoneNumber.replace(/\D/g, '')}`
    : null;

  // Mensaje base sin el número de teléfono
  const defaultMessageBase = 'Estamos realizando mejoras. Por favor, inténtalo de nuevo más tarde.';

  return (
    <div className={styles.container}>
      <ServiceDownIcon className={styles.icon} aria-label="Sitio en mantenimiento" />
      <h1>¡Volvemos enseguida!</h1>

      {/* Muestra el mensaje personalizado O el mensaje base por defecto */}
      <p>{message || defaultMessageBase}</p>

      {/* Añade un párrafo separado con el enlace si el número existe */}
      {whatsappUrl && (
        <p className={styles.contactInfo}> {/* Puedes añadir estilos específicos si quieres */}
          O da click aqui: <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">{businessPhoneNumber}</a>
        </p>
      )}
    </div>
  );
};

export default MaintenancePage;