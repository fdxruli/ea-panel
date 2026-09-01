import React, {
  useState,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
  useEffect,
} from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Polygon,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import styles from './MapPicker.module.css';
import { useAlert } from '../context/AlertContext';

// ---------------------------------------------------------------------------
// Delivery zone polygon (lat/lng pairs for Leaflet)
// ---------------------------------------------------------------------------
const DELIVERY_COORDS = [
  [15.888856, -92.003376],
  [15.859375, -91.966981],
  [15.850525, -91.961287],
  [15.847137, -91.966816],
  [15.845281, -91.971451],
  [15.846072, -92.007089],
  [15.849822, -92.015858],
  [15.884673, -92.004707],
];

const DEFAULT_CENTER = [15.852182, -91.977533];
const DEFAULT_ZOOM   = 18;

// ---------------------------------------------------------------------------
// Ray-casting point-in-polygon algorithm (replaces Google geometry library)
// ---------------------------------------------------------------------------
function isPointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect =
      yi > lng !== yj > lng &&
      lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// Custom SVG pin icon (avoids missing default Leaflet marker assets)
// ---------------------------------------------------------------------------
const PIN_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 48" width="32" height="48">
  <filter id="shadow" x="-30%" y="-20%" width="160%" height="140%">
    <feDropShadow dx="0" dy="3" stdDeviation="2" flood-color="rgba(0,0,0,0.4)"/>
  </filter>
  <path d="M16 0C9.373 0 4 5.373 4 12c0 9 12 36 12 36S28 21 28 12C28 5.373 22.627 0 16 0z"
        fill="#e53e3e" filter="url(#shadow)"/>
  <circle cx="16" cy="12" r="5" fill="white"/>
</svg>`;

const createPinIcon = () =>
  L.divIcon({
    html: PIN_SVG,
    className: '',
    iconSize:   [32, 48],
    iconAnchor: [16, 48],
  });

// ---------------------------------------------------------------------------
// Sub-component: syncs the map view when `center` changes externally
// ---------------------------------------------------------------------------
function MapController({ center }) {
  const map = useMap();
  const prevCenter = useRef(null);

  useEffect(() => {
    if (!center) return;
    const [lat, lng] = center;
    const prev = prevCenter.current;
    if (!prev || prev[0] !== lat || prev[1] !== lng) {
      map.setView([lat, lng], map.getZoom(), { animate: true });
      prevCenter.current = [lat, lng];
    }
  }, [center, map]);

  return null;
}

// ---------------------------------------------------------------------------
// Sub-component: handles click events on the map canvas
// ---------------------------------------------------------------------------
function ClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// ---------------------------------------------------------------------------
// Tile-layer URLs
// ---------------------------------------------------------------------------
const TILES = {
  satellite: {
    url:         'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
  },
  streets: {
    url:         'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const MapPicker = forwardRef(({ onLocationSelect, initialPosition, isDraggable = true }, ref) => {
  const { showAlert } = useAlert();

  const toLatLngArray = (pos) =>
    pos ? [pos.lat, pos.lng] : DEFAULT_CENTER;

  const [markerPos,       setMarkerPos]       = useState(toLatLngArray(initialPosition));
  const [mapCenter,       setMapCenter]       = useState(toLatLngArray(initialPosition));
  const [lastValidPos,    setLastValidPos]    = useState(toLatLngArray(initialPosition));
  const [layer,           setLayer]           = useState('satellite');
  const [instructionText, setInstructionText] = useState('Mueve el pin rojo hasta tu ubicación exacta.');

  const pinIcon = useRef(createPinIcon());

  // Notify parent and persist valid position
  const acceptPosition = useCallback((lat, lng) => {
    const pos = [lat, lng];
    setMarkerPos(pos);
    setLastValidPos(pos);
    setMapCenter(pos);
    if (onLocationSelect) onLocationSelect({ lat, lng });
  }, [onLocationSelect]);

  // Reject and snap back
  const rejectPosition = useCallback(() => {
    showAlert('Lo sentimos, solo hacemos entregas dentro de la zona marcada en verde.');
    setMarkerPos(lastValidPos);
    setMapCenter(lastValidPos);
  }, [lastValidPos, showAlert]);

  // Validate then accept/reject
  const tryPosition = useCallback((lat, lng) => {
    if (isPointInPolygon(lat, lng, DELIVERY_COORDS)) {
      acceptPosition(lat, lng);
    } else {
      rejectPosition();
    }
  }, [acceptPosition, rejectPosition]);

  // Marker drag-end handler
  const onDragEnd = useCallback((e) => {
    const { lat, lng } = e.target.getLatLng();
    tryPosition(lat, lng);
  }, [tryPosition]);

  // Map click handler (only when draggable / editable mode)
  const handleMapClick = useCallback((lat, lng) => {
    if (!isDraggable) return;
    tryPosition(lat, lng);
  }, [isDraggable, tryPosition]);

  // GPS geolocation (exposed via ref)
  const handleAutomaticLocation = useCallback(() => {
    setInstructionText('Verifica que el pin esté en tu ubicación exacta. Si no es así, arrástralo para corregirlo.');

    if (!navigator.geolocation) {
      showAlert('La geolocalización no es compatible con tu navegador.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: lat, longitude: lng } = position.coords;

        if (isPointInPolygon(lat, lng, DELIVERY_COORDS)) {
          acceptPosition(lat, lng);
          showAlert('¡Ubicación encontrada!');
        } else {
          showAlert('Estás fuera de la zona de reparto, pero hemos colocado el pin en una ubicación válida para ti.');
          setMarkerPos(DEFAULT_CENTER);
          setMapCenter(DEFAULT_CENTER);
        }
      },
      (error) => {
        const msgs = {
          [error.PERMISSION_DENIED]:    'Necesitamos tu permiso para acceder a tu ubicación.',
          [error.POSITION_UNAVAILABLE]: 'La información de ubicación no está disponible.',
          [error.TIMEOUT]:              'La solicitud de ubicación tardó demasiado.',
        };
        showAlert('No se pudo obtener la ubicación. ' + (msgs[error.code] ?? 'Ocurrió un error desconocido.'));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, [acceptPosition, showAlert]);

  useImperativeHandle(ref, () => ({
    locateUser: handleAutomaticLocation,
  }));

  const tile = TILES[layer];

  return (
    <div className={styles.wrapper}>
      {isDraggable && (
        <p className={styles.instruction}>{instructionText}</p>
      )}

      <div className={styles.mapContainer}>
        {/* Layer-toggle button */}
        {isDraggable && (
          <button
            type="button"
            className={styles.layerToggle}
            onClick={() => setLayer(l => l === 'satellite' ? 'streets' : 'satellite')}
            title={layer === 'satellite' ? 'Cambiar a vista de calles' : 'Cambiar a vista satelital'}
          >
            {layer === 'satellite' ? '🗺️ Calles' : '🛰️ Satélite'}
          </button>
        )}

        <MapContainer
          center={mapCenter}
          zoom={DEFAULT_ZOOM}
          style={{ width: '100%', height: '100%' }}
          zoomControl={true}
          scrollWheelZoom={true}
        >
          <TileLayer url={tile.url} attribution={tile.attribution} />

          <MapController center={mapCenter} />

          {isDraggable && <ClickHandler onMapClick={handleMapClick} />}

          <Polygon
            positions={DELIVERY_COORDS}
            pathOptions={{
              color:       '#00FF00',
              fillColor:   '#00FF00',
              fillOpacity: 0.1,
              weight:      2,
              opacity:     0.8,
            }}
          />

          <Marker
            position={markerPos}
            icon={pinIcon.current}
            draggable={isDraggable}
            eventHandlers={isDraggable ? { dragend: onDragEnd } : {}}
          />
        </MapContainer>
      </div>
    </div>
  );
});

MapPicker.displayName = 'MapPicker';
export default MapPicker;
