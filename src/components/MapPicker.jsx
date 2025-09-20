// src/components/MapPicker.jsx (CORREGIDO Y SIMPLIFICADO)

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleMap, useJsApiLoader, Marker, Polygon } from '@react-google-maps/api';
import styles from './MapPicker.module.css';
import { useAlert } from '../context/AlertContext';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const libraries = ['geometry'];

const deliveryAreaCoordinates = [
  { lat: 15.888856, lng: -92.003376 },
  { lat: 15.859375, lng: -91.966981 },
  { lat: 15.850525, lng: -91.961287 },
  { lat: 15.847137, lng: -91.966816 },
  { lat: 15.845281, lng: -91.971451 },
  { lat: 15.846072, lng: -92.007089 },
  { lat: 15.849822, lng: -92.015858 },
  { lat: 15.884673, lng: -92.004707 },
];

const deliveryAreaOptions = {
  fillColor: "#00FF00",
  fillOpacity: 0.1,
  strokeColor: "#00FF00",
  strokeOpacity: 0.8,
  strokeWeight: 2,
};

const containerStyle = {
  width: '100%',
  height: '100%'
};

const mapOptions = {
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: false,
  mapTypeId: 'satellite',
  tilt: 0
};

export default function MapPicker({ onLocationSelect, initialPosition }) {
  const { showAlert } = useAlert();
  const defaultCenter = { lat: 15.852182, lng: -91.977533 };
  
  const [markerPosition, setMarkerPosition] = useState(initialPosition || defaultCenter);
  const [mapCenter, setMapCenter] = useState(initialPosition || defaultCenter);
  const [lastValidPosition, setLastValidPosition] = useState(initialPosition || defaultCenter);

  const polygonRef = useRef(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: libraries,
  });

  // Comunica la posición inicial al componente padre solo una vez.
  useEffect(() => {
    if (onLocationSelect) {
      onLocationSelect(initialPosition || defaultCenter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  useEffect(() => {
    if (initialPosition) {
        setMarkerPosition(initialPosition);
        setMapCenter(initialPosition);
        setLastValidPosition(initialPosition);
    }
  }, [JSON.stringify(initialPosition)]); // La dependencia es un string, no un objeto
  // --- 👆 FIN DE LA CORRECCIÓN ---


  const onPolygonLoad = useCallback(polygon => {
    polygonRef.current = polygon;
  }, []);
  
  const onMarkerDragEnd = useCallback(event => {
    const newPosition = {
      lat: event.latLng.lat(),
      lng: event.latLng.lng()
    };
    
    if (
      isLoaded &&
      polygonRef.current &&
      window.google.maps.geometry.poly.containsLocation(event.latLng, polygonRef.current)
    ) {
      // Si la posición es válida, actualiza el estado interno y notifica al padre.
      setMarkerPosition(newPosition);
      setLastValidPosition(newPosition);
      setMapCenter(newPosition);
      if (onLocationSelect) {
        onLocationSelect(newPosition);
      }
    } else {
      // Si no es válida, revierte el marcador a la última posición buena.
      showAlert("Lo sentimos, solo hacemos entregas dentro de la zona marcada en verde. Por favor, mueve el pin a una ubicación válida.");
      setMarkerPosition(lastValidPosition);
      setMapCenter(lastValidPosition);
    }
  }, [onLocationSelect, isLoaded, lastValidPosition, showAlert]);

  if (loadError) {
    return (
        <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>
          <strong>Error al cargar el mapa:</strong> Por favor, verifica tu clave de API de Google Maps.
        </div>
      );
  }

  return (
    <div className={styles.mapContainer}>
       <p className={styles.instruction}>
        Mueve el pin rojo hasta tu ubicación exacta.
      </p>

      {isLoaded ? (
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={mapCenter}
          zoom={17}
          options={mapOptions}
        >
          <Marker
            position={markerPosition}
            draggable={true}
            onDragEnd={onMarkerDragEnd}
          />
          
          <Polygon
            paths={deliveryAreaCoordinates}
            options={deliveryAreaOptions}
            onLoad={onPolygonLoad}
          />

        </GoogleMap>
      ) : (
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%'}}>Cargando mapa...</div>
      )}
    </div>
  );
}