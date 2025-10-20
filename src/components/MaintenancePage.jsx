// src/components/MaintenancePage.jsx
import React from 'react';
// Asegúrate de que la ruta al SVG sea correcta. Si usas vite-plugin-svgr, la importación es así:
import ServiceDownIcon from '../assets/icons/service.svg?react';
import styles from './MaintenancePage.module.css'; // Crearemos este archivo CSS a continuación

const MaintenancePage = ({ message }) => {
  return (
    <div className={styles.container}>
      {/* Importa y usa el SVG */}
      <ServiceDownIcon className={styles.icon} aria-label="Sitio en mantenimiento" />
      <h1>¡Volvemos enseguida!</h1>
      <p>{message || 'Estamos realizando mejoras. Por favor, inténtalo de nuevo más tarde.'}</p>
    </div>
  );
};

export default MaintenancePage;