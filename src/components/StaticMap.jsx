// Read-only mini-map using react-leaflet — no Google Maps API key required.
import React from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import styles from './StaticMap.module.css';
import { ADDRESS_MARKER_ICON } from './mapIcons';

// Satellite tile (Esri World Imagery) – free, no API key.
const SATELLITE_TILE = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Tiles &copy; Esri',
};

const StaticMap = ({ latitude, longitude }) => {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return (
      <div className={styles.mapContainer}>
        <span className={styles.unavailable}>Ubicación no disponible.</span>
      </div>
    );
  }

  const center = [lat, lng];

  return (
    <div className={styles.mapContainer}>
      <MapContainer
        center={center}
        zoom={17}
        className={styles.leafletMap}
        dragging={false}
        zoomControl={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        keyboard={false}
        attributionControl
      >
        <TileLayer url={SATELLITE_TILE.url} attribution={SATELLITE_TILE.attribution} />
        <Marker
          position={center}
          icon={ADDRESS_MARKER_ICON}
          zIndexOffset={1000}
          title="Ubicación guardada"
          alt="Ubicación guardada"
        />
      </MapContainer>
    </div>
  );
};

export default React.memo(StaticMap);
