<<<<<<< HEAD
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleMap, useJsApiLoader, Marker, Polygon } from '@react-google-maps/api';
import styles from './MapPicker.module.css';
import { useAlert } from '../context/AlertContext';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const libraries = ['geometry'];

const LocationIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>
    </svg>
);

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

export default function MapPicker({ onLocationSelect, initialPosition, isDraggable = true }) {
  const { showAlert } = useAlert();
  const defaultCenter = { lat: 15.852182, lng: -91.977533 };
  
  const [markerPosition, setMarkerPosition] = useState(initialPosition || defaultCenter);
  const [mapCenter, setMapCenter] = useState(initialPosition || defaultCenter);
  const [lastValidPosition, setLastValidPosition] = useState(initialPosition || defaultCenter);
  const polygonRef = useRef(null);

  const [instructionText, setInstructionText] = useState('Mueve el pin rojo hasta tu ubicación exacta.');


  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: libraries,
  });

  // --- 👇 LA CORRECCIÓN ESTÁ AQUÍ ---
  // Se inicializa la posición una sola vez, pero no se fuerza un reseteo
  // cada vez que el componente padre se actualiza.
  useEffect(() => {
    if (onLocationSelect && !initialPosition) {
      onLocationSelect(defaultCenter);
    }
  }, []);
  // --- 👆 FIN DE LA CORRECCIÓN ---
  
  const onPolygonLoad = useCallback(polygon => {
    polygonRef.current = polygon;
  }, []);
  
  const onMarkerDragEnd = useCallback(event => {
    const newPosition = {
      lat: event.latLng.lat(),
      lng: event.latLng.lng()
    };
    
    if ( isLoaded && polygonRef.current && window.google.maps.geometry.poly.containsLocation(event.latLng, polygonRef.current) ) {
      setMarkerPosition(newPosition);
      setLastValidPosition(newPosition);
      setMapCenter(newPosition);
      if (onLocationSelect) {
        onLocationSelect(newPosition);
      }
    } else {
      showAlert("Lo sentimos, solo hacemos entregas dentro de la zona marcada en verde.");
      setMarkerPosition(lastValidPosition);
      setMapCenter(lastValidPosition);
    }
  }, [onLocationSelect, isLoaded, lastValidPosition, showAlert]);

  const handleAutomaticLocation = () => {
    setInstructionText('Verifica que el pin esté en tu ubicación exacta. Si no es así, arrástralo para corregirlo.');
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newPosition = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          const newLatLng = new window.google.maps.LatLng(newPosition.lat, newPosition.lng);

          if (isLoaded && polygonRef.current && window.google.maps.geometry.poly.containsLocation(newLatLng, polygonRef.current)) {
            setMarkerPosition(newPosition);
            setLastValidPosition(newPosition);
            setMapCenter(newPosition);
            if (onLocationSelect) {
              onLocationSelect(newPosition);
            }
            showAlert('¡Ubicación encontrada!');
          } else {
             showAlert("Estás fuera de la zona de reparto, pero hemos colocado el pin en una ubicación válida para ti.");
             setMarkerPosition(defaultCenter);
             setMapCenter(defaultCenter);
          }
        },
        (error) => {
          let errorMessage = 'No se pudo obtener la ubicación. ';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage += 'Necesitamos tu permiso para acceder a tu ubicación.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage += 'La información de ubicación no está disponible.';
              break;
            case error.TIMEOUT:
              errorMessage += 'La solicitud de ubicación tardó demasiado.';
              break;
            default:
              errorMessage += 'Ocurrió un error desconocido.';
          }
          showAlert(errorMessage);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    } else {
      showAlert('La geolocalización no es compatible con tu navegador.');
    }
  };


  if (loadError) {
    return (
        <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>
          <strong>Error al cargar el mapa.</strong>
        </div>
      );
  }

  return (
    <div className={styles.wrapper}>
      {isDraggable && (
        <p className={styles.instruction}>
          {instructionText}
        </p>
      )}
      
      <div className={styles.mapContainer}>
        {isLoaded ? (
          <>
            {isDraggable && (
                <button 
                  type="button"
                  onClick={handleAutomaticLocation} 
                  className={styles.locationButton}
                  title="Ubicarme automáticamente"
                >
                    <LocationIcon />
                </button>
            )}
            <GoogleMap
              mapContainerStyle={containerStyle}
              center={mapCenter}
              zoom={18}
              options={mapOptions}
            >
              <Marker
                position={markerPosition}
                draggable={isDraggable}
                onDragEnd={onMarkerDragEnd}
              />
              <Polygon
                paths={deliveryAreaCoordinates}
                options={deliveryAreaOptions}
                onLoad={onPolygonLoad}
              />
            </GoogleMap>
          </>
        ) : (
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%'}}>Cargando mapa...</div>
        )}
      </div>
    </div>
  );
=======
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleMap, useJsApiLoader, Marker, Polygon } from '@react-google-maps/api';
import styles from './MapPicker.module.css';
import { useAlert } from '../context/AlertContext';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const libraries = ['geometry'];

const LocationIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>
    </svg>
);

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

export default function MapPicker({ onLocationSelect, initialPosition, isDraggable = true }) {
  const { showAlert } = useAlert();
  const defaultCenter = { lat: 15.852182, lng: -91.977533 };
  
  const [markerPosition, setMarkerPosition] = useState(initialPosition || defaultCenter);
  const [mapCenter, setMapCenter] = useState(initialPosition || defaultCenter);
  const [lastValidPosition, setLastValidPosition] = useState(initialPosition || defaultCenter);
  const polygonRef = useRef(null);

  const [instructionText, setInstructionText] = useState('Mueve el pin rojo hasta tu ubicación exacta.');


  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: libraries,
  });

  // --- 👇 LA CORRECCIÓN ESTÁ AQUÍ ---
  // Se inicializa la posición una sola vez, pero no se fuerza un reseteo
  // cada vez que el componente padre se actualiza.
  useEffect(() => {
    if (onLocationSelect && !initialPosition) {
      onLocationSelect(defaultCenter);
    }
  }, []);
  // --- 👆 FIN DE LA CORRECCIÓN ---
  
  const onPolygonLoad = useCallback(polygon => {
    polygonRef.current = polygon;
  }, []);
  
  const onMarkerDragEnd = useCallback(event => {
    const newPosition = {
      lat: event.latLng.lat(),
      lng: event.latLng.lng()
    };
    
    if ( isLoaded && polygonRef.current && window.google.maps.geometry.poly.containsLocation(event.latLng, polygonRef.current) ) {
      setMarkerPosition(newPosition);
      setLastValidPosition(newPosition);
      setMapCenter(newPosition);
      if (onLocationSelect) {
        onLocationSelect(newPosition);
      }
    } else {
      showAlert("Lo sentimos, solo hacemos entregas dentro de la zona marcada en verde.");
      setMarkerPosition(lastValidPosition);
      setMapCenter(lastValidPosition);
    }
  }, [onLocationSelect, isLoaded, lastValidPosition, showAlert]);

  const handleAutomaticLocation = () => {
    setInstructionText('Verifica que el pin esté en tu ubicación exacta. Si no es así, arrástralo para corregirlo.');
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newPosition = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          const newLatLng = new window.google.maps.LatLng(newPosition.lat, newPosition.lng);

          if (isLoaded && polygonRef.current && window.google.maps.geometry.poly.containsLocation(newLatLng, polygonRef.current)) {
            setMarkerPosition(newPosition);
            setLastValidPosition(newPosition);
            setMapCenter(newPosition);
            if (onLocationSelect) {
              onLocationSelect(newPosition);
            }
            showAlert('¡Ubicación encontrada!');
          } else {
             showAlert("Estás fuera de la zona de reparto, pero hemos colocado el pin en una ubicación válida para ti.");
             setMarkerPosition(defaultCenter);
             setMapCenter(defaultCenter);
          }
        },
        (error) => {
          let errorMessage = 'No se pudo obtener la ubicación. ';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage += 'Necesitamos tu permiso para acceder a tu ubicación.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage += 'La información de ubicación no está disponible.';
              break;
            case error.TIMEOUT:
              errorMessage += 'La solicitud de ubicación tardó demasiado.';
              break;
            default:
              errorMessage += 'Ocurrió un error desconocido.';
          }
          showAlert(errorMessage);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    } else {
      showAlert('La geolocalización no es compatible con tu navegador.');
    }
  };


  if (loadError) {
    return (
        <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>
          <strong>Error al cargar el mapa.</strong>
        </div>
      );
  }

  return (
    <div className={styles.wrapper}>
      {isDraggable && (
        <p className={styles.instruction}>
          {instructionText}
        </p>
      )}
      
      <div className={styles.mapContainer}>
        {isLoaded ? (
          <>
            {isDraggable && (
                <button 
                  type="button"
                  onClick={handleAutomaticLocation} 
                  className={styles.locationButton}
                  title="Ubicarme automáticamente"
                >
                    <LocationIcon />
                </button>
            )}
            <GoogleMap
              mapContainerStyle={containerStyle}
              center={mapCenter}
              zoom={18}
              options={mapOptions}
            >
              <Marker
                position={markerPosition}
                draggable={isDraggable}
                onDragEnd={onMarkerDragEnd}
              />
              <Polygon
                paths={deliveryAreaCoordinates}
                options={deliveryAreaOptions}
                onLoad={onPolygonLoad}
              />
            </GoogleMap>
          </>
        ) : (
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%'}}>Cargando mapa...</div>
        )}
      </div>
    </div>
  );
>>>>>>> 901f8aa95ca640c871ec1f2bf6437b2b2a625efc
}