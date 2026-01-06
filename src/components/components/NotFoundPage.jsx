// src/components/NotFoundPage.jsx
import React from 'react';
import ServiceIcon from '../assets/icons/fuera-horario.svg?react'; // Importa el SVG como componente React
import styles from './NotFoundPage.module.css'; // Crearemos este archivo CSS
import { Link } from 'react-router-dom'; // Para añadir un enlace de regreso

const NotFoundPage = () => {
  return (
    <div className={styles.container}>
      <ServiceIcon className={styles.icon} aria-label="Página no encontrada" />
      <h1>¡Oops! Página No Encontrada</h1>
      <p>
        Parece que te has perdido. La página que buscas no existe o fue movida. Asegurate de revisar el link
      </p>
      <Link to="/" className={styles.homeLink}>
        Volver al Inicio
      </Link>
    </div>
  );
};

export default NotFoundPage;