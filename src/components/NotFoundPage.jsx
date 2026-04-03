import React from 'react';
import { Link } from 'react-router-dom';
import ServiceIcon from '../assets/icons/fuera-horario.svg?react';
import SEO from './SEO';
import styles from './NotFoundPage.module.css';

const NotFoundPage = () => {
  return (
    <>
      <SEO
        title="Página no encontrada | Entre Alas"
        description="La página que buscas no existe o fue movida."
        type="website"
        noindex
      />
      <div className={styles.container}>
        <ServiceIcon className={styles.icon} aria-label="Página no encontrada" />
        <h1>Página no encontrada</h1>
        <p>
          La página que buscas no existe o fue movida. Verifica el enlace o vuelve al inicio.
        </p>
        <Link to="/" className={styles.homeLink}>
          Volver al Inicio
        </Link>
      </div>
    </>
  );
};

export default NotFoundPage;
