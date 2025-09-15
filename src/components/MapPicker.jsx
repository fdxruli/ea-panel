// src/components/MapPicker.jsx

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import styles from './MapPicker.module.css';

function MapEvents({ setPosition }) {
  const map = useMapEvents({
    click(e) {
      setPosition(e.latlng);
      map.flyTo(e.latlng, map.getZoom());
    },
    locationfound(e) {
      setPosition(e.latlng);
      map.flyTo(e.latlng, 16);
    },
  });
  return null;
}

export default function MapPicker({ onLocationSelect }) {
  const initialPosition = { lat: 16.2519, lng: -92.1364 };
  const [position, setPosition] = useState(initialPosition);
  const markerRef = useRef(null);
  const mapRef = useRef(null);
  
  useEffect(() => {
    onLocationSelect(initialPosition);
  }, [onLocationSelect]);

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const newPos = marker.getLatLng();
          setPosition(newPos);
          onLocationSelect(newPos);
        }
      },
    }),
    [onLocationSelect]
  );

  const handleGetMyLocation = useCallback(() => {
    const map = mapRef.current;
    if (map) {
      map.locate();
    }
  }, []);

  return (
    <div className={styles.mapContainer}>
      <p className={styles.instruction}>
        Mueve el mapa o el marcador hasta tu ubicación exacta.
      </p>
      
      <MapContainer
        center={initialPosition}
        zoom={15}
        scrollWheelZoom={true}
        className={styles.map}
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker
          draggable={true}
          eventHandlers={eventHandlers}
          position={position}
          ref={markerRef}
        />
        <MapEvents setPosition={setPosition} />
      </MapContainer>

      <button onClick={handleGetMyLocation} className={styles.locationButton}>
        📍 Usar mi ubicación actual
      </button>
    </div>
  );
}