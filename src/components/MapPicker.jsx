// src/components/MapPicker.jsx (Con mayor zoom)

import React, { useState, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker, Polygon } from '@react-google-maps/api';
import styles from './MapPicker.module.css';
import { useAlert } from '../context/AlertContext';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const libraries = ['geometry'];

// Zona de reparto con puntos reordenados
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

// Estilos para el polígono que representa la zona de entrega
const deliveryAreaOptions = {
  fillColor: "#00FF00",
  fillOpacity: 0.1,
  strokeColor: "#00FF00",
  strokeOpacity: 0.8,
  strokeWeight: 2,
};

// Estilos para el contenedor del mapa
const containerStyle = {
  width: '100%',
  height: '100%'
};

// Opciones para ocultar controles no deseados del mapa
const mapOptions = {
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: false,
  mapTypeId: 'satellite', // Mapa satelital
  tilt: 0
};

export default function MapPicker({ onLocationSelect }) {
  const { showAlert } = useAlert();
  // Punto de inicio actualizado
  const initialCenter = {
    lat: 15.852182,
    lng: -91.977533
  };
  
  const [markerPosition, setMarkerPosition] = useState(initialCenter);
  const [lastValidPosition, setLastValidPosition] = useState(initialCenter);
  const polygonRef = useRef(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: libraries,
  });

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
      google.maps.geometry.poly.containsLocation(event.latLng, polygonRef.current)
    ) {
      setMarkerPosition(newPosition);
      setLastValidPosition(newPosition);
      if (onLocationSelect) {
        onLocationSelect(newPosition);
      }
    } else {
      showAlert("Lo sentimos, solo hacemos entregas dentro de la zona marcada en verde. Por favor, mueve el pin a una ubicación válida.");
      setMarkerPosition(lastValidPosition);
    }
  }, [onLocationSelect, isLoaded, lastValidPosition]);

  React.useEffect(() => {
    if (onLocationSelect) {
        onLocationSelect(initialCenter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          center={initialCenter}
          zoom={17} // <-- Nivel de zoom aumentado
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