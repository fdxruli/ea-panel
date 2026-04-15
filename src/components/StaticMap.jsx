// src/components/StaticMap.jsx
import React from 'react';
import styles from './StaticMap.module.css'; // Crearemos este archivo a continuación

// Asegúrate de que esta variable de entorno esté disponible para el cliente (VITE_...)
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const StaticMap = ({ latitude, longitude, width = 400, height = 300 }) => {
  if (!latitude || !longitude) {
    return <div className={styles.mapContainer}>Ubicación no disponible.</div>;
  }

  // Construimos la URL para la API de mapas estáticos
  const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?
center=${latitude},${longitude}
&zoom=17
&size=${width}x${height}
&maptype=satellite
&markers=color:red%7C${latitude},${longitude}
&key=${GOOGLE_MAPS_API_KEY}`;

  // Eliminamos saltos de línea y espacios de la URL
  const cleanUrl = mapUrl.replace(/(\r\n|\n|\r|\s)/gm, "");

  return (
    <div className={styles.mapContainer}>
      <img
        src={cleanUrl}
        width={width}
        height={height}
        alt="Mapa de ubicación"
        loading="lazy" // Carga perezosa para la imagen
      />
    </div>
  );
};

export default React.memo(StaticMap); // Usamos memo para optimizar