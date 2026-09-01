// src/components/StaticMap.jsx
// Read-only mini-map using react-leaflet — no Google Maps API key required.
import React from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import styles from './StaticMap.module.css';

// Compact red SVG pin (same visual family as MapPicker)
const PIN_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
  <path d="M12 0C7.03 0 3 4.03 3 9c0 6.75 9 27 9 27S21 15.75 21 9C21 4.03 16.97 0 12 0z"
        fill="#e53e3e" stroke="#c53030" stroke-width="0.5"/>
  <circle cx="12" cy="9" r="3.5" fill="white"/>
</svg>`;

const createSmallPin = () =>
  L.divIcon({
    html:       PIN_SVG,
    className:  '',
    iconSize:   [24, 36],
    iconAnchor: [12, 36],
  });

// Satellite tile (Esri World Imagery) – free, no API key
const SATELLITE_TILE = {
  url:         'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Tiles &copy; Esri',
};

const StaticMap = ({ latitude, longitude }) => {
  if (!latitude || !longitude) {
    return (
      <div className={styles.mapContainer}>
        <span className={styles.unavailable}>Ubicación no disponible.</span>
      </div>
    );
  }

  const center   = [latitude, longitude];
  const smallPin = createSmallPin();

  return (
    <div className={styles.mapContainer}>
      <MapContainer
        center={center}
        zoom={17}
        style={{ width: '100%', height: '100%' }}
        dragging={false}
        zoomControl={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        keyboard={false}
        attributionControl={false}
      >
        <TileLayer url={SATELLITE_TILE.url} attribution={SATELLITE_TILE.attribution} />
        <Marker position={center} icon={smallPin} />
      </MapContainer>
    </div>
  );
};

export default React.memo(StaticMap);