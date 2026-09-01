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
import styles from './MapPicker.module.css';
import { useAlert } from '../context/AlertContext';
import { ADDRESS_MARKER_ICON } from './mapIcons';

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
const DEFAULT_ZOOM = 18;

// ---------------------------------------------------------------------------
// Ray-casting point-in-polygon algorithm (replaces Google geometry library)
// ---------------------------------------------------------------------------
function isPointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect =
      yi > lng !== yj > lng &&
      lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function toLatLngArray(position) {
  const lat = Number(position?.lat);
  const lng = Number(position?.lng);

  return Number.isFinite(lat) && Number.isFinite(lng)
    ? [lat, lng]
    : DEFAULT_CENTER;
}

function hasValidPosition(position) {
  const latValue = position?.lat;
  const lngValue = position?.lng;

  return latValue != null
    && lngValue != null
    && Number.isFinite(Number(latValue))
    && Number.isFinite(Number(lngValue));
}

// ---------------------------------------------------------------------------
// Sub-component: keeps Leaflet's internal size in sync with the modal.
// This prevents cropped tiles and misplaced markers after responsive reflow.
// ---------------------------------------------------------------------------
function MapSizeSync() {
  const map = useMap();

  useEffect(() => {
    let frameId = 0;

    const invalidate = () => {
      if (typeof window === 'undefined') {
        map.invalidateSize({ pan: false });
        return;
      }

      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        map.invalidateSize({ pan: false, animate: false });
      });
    };

    invalidate();

    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(invalidate);
    observer?.observe(map.getContainer());

    return () => {
      if (typeof window !== 'undefined') {
        window.cancelAnimationFrame(frameId);
      }
      observer?.disconnect();
    };
  }, [map]);

  return null;
}

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
    click(event) {
      onMapClick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

// ---------------------------------------------------------------------------
// Tile-layer URLs
// ---------------------------------------------------------------------------
const TILES = {
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
  },
  streets: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const MapPicker = forwardRef(({
  onLocationSelect,
  initialPosition,
  isDraggable = true,
}, ref) => {
  const { showAlert } = useAlert();
  const initialLat = initialPosition?.lat;
  const initialLng = initialPosition?.lng;
  const initialCoords = toLatLngArray(initialPosition);

  const [markerPos, setMarkerPos] = useState(initialCoords);
  const [mapCenter, setMapCenter] = useState(initialCoords);
  const [lastValidPos, setLastValidPos] = useState(initialCoords);
  const [layer, setLayer] = useState('satellite');
  const [isDragging, setIsDragging] = useState(false);
  const [hasSelection, setHasSelection] = useState(hasValidPosition(initialPosition));
  const [instructionText, setInstructionText] = useState(
    'Toca el mapa o arrastra el pin para elegir el punto exacto.',
  );

  useEffect(() => {
    const hasNextPosition = hasValidPosition({ lat: initialLat, lng: initialLng });
    const nextPosition = toLatLngArray(
      hasNextPosition
        ? { lat: initialLat, lng: initialLng }
        : null,
    );
    setMarkerPos(nextPosition);
    setMapCenter(nextPosition);
    setLastValidPos(nextPosition);
    setHasSelection(hasNextPosition);
  }, [initialLat, initialLng]);

  // Notify parent and persist valid position.
  const acceptPosition = useCallback((lat, lng) => {
    const nextPosition = [lat, lng];
    setMarkerPos(nextPosition);
    setLastValidPos(nextPosition);
    setMapCenter(nextPosition);
    setHasSelection(true);
    onLocationSelect?.({ lat, lng });
  }, [onLocationSelect]);

  const restoreLastValidPosition = useCallback(() => {
    setMarkerPos(lastValidPos);
    setMapCenter(lastValidPos);
  }, [lastValidPos]);

  // Reject and snap back.
  const rejectPosition = useCallback(() => {
    showAlert('Lo sentimos, solo hacemos entregas dentro de la zona marcada en verde.');
    restoreLastValidPosition();
  }, [restoreLastValidPosition, showAlert]);

  // Validate then accept/reject.
  const tryPosition = useCallback((lat, lng) => {
    const numericLat = Number(lat);
    const numericLng = Number(lng);

    if (isPointInPolygon(numericLat, numericLng, DELIVERY_COORDS)) {
      acceptPosition(numericLat, numericLng);
    } else {
      rejectPosition();
    }
  }, [acceptPosition, rejectPosition]);

  const onDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  // Marker drag-end handler.
  const onDragEnd = useCallback((event) => {
    setIsDragging(false);
    const { lat, lng } = event.target.getLatLng();
    tryPosition(lat, lng);
  }, [tryPosition]);

  // Map click handler (only when draggable / editable mode).
  const handleMapClick = useCallback((lat, lng) => {
    if (!isDraggable) return;
    tryPosition(lat, lng);
  }, [isDraggable, tryPosition]);

  // GPS geolocation (exposed via ref).
  const handleAutomaticLocation = useCallback(() => {
    setInstructionText(
      'Verifica que el pin esté en tu ubicación exacta. Si no es así, arrástralo para corregirlo.',
    );

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
          showAlert(
            'Estás fuera de la zona de reparto. Conservamos el último punto válido.',
          );
          restoreLastValidPosition();
        }
      },
      (error) => {
        const messages = {
          [error.PERMISSION_DENIED]: 'Necesitamos tu permiso para acceder a tu ubicación.',
          [error.POSITION_UNAVAILABLE]: 'La información de ubicación no está disponible.',
          [error.TIMEOUT]: 'La solicitud de ubicación tardó demasiado.',
        };
        showAlert(
          `No se pudo obtener la ubicación. ${messages[error.code] ?? 'Ocurrió un error desconocido.'}`,
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, [acceptPosition, restoreLastValidPosition, showAlert]);

  useImperativeHandle(ref, () => ({
    locateUser: handleAutomaticLocation,
  }), [handleAutomaticLocation]);

  const tile = TILES[layer];
  const statusText = isDraggable
    ? (hasSelection ? 'Ubicación seleccionada' : 'Selecciona una ubicación')
    : 'Ubicación guardada';

  return (
    <div className={styles.wrapper}>
      {isDraggable && (
        <p className={styles.instruction}>{instructionText}</p>
      )}

      <div className={`${styles.mapContainer} ${isDragging ? styles.isDragging : ''}`}>
        <div className={styles.mapToolbar}>
          <div className={styles.mapLegend} aria-label="Leyenda de la zona de entrega">
            <span className={styles.legendSwatch} aria-hidden="true" />
            <span>Zona de entrega</span>
          </div>

          {isDraggable && (
            <button
              type="button"
              className={styles.layerToggle}
              onClick={() => setLayer((currentLayer) => (
                currentLayer === 'satellite' ? 'streets' : 'satellite'
              ))}
              aria-label={layer === 'satellite'
                ? 'Cambiar a vista de calles'
                : 'Cambiar a vista satelital'}
              aria-pressed={layer === 'streets'}
              title={layer === 'satellite'
                ? 'Cambiar a vista de calles'
                : 'Cambiar a vista satelital'}
            >
              {layer === 'satellite' ? 'Calles' : 'Satélite'}
            </button>
          )}
        </div>

        <div className={styles.mapStatus} role="status" aria-live="polite">
          <span
            className={`${styles.statusDot} ${hasSelection ? styles.statusDotSelected : ''}`}
            aria-hidden="true"
          />
          <span>{statusText}</span>
        </div>

        <MapContainer
          center={mapCenter}
          zoom={DEFAULT_ZOOM}
          minZoom={14}
          maxZoom={20}
          className={styles.leafletMap}
          zoomControl
          scrollWheelZoom
        >
          <TileLayer url={tile.url} attribution={tile.attribution} />

          <MapSizeSync />
          <MapController center={mapCenter} />

          {isDraggable && <ClickHandler onMapClick={handleMapClick} />}

          <Polygon
            positions={DELIVERY_COORDS}
            pathOptions={{
              color: '#34D399',
              fillColor: '#10B981',
              fillOpacity: 0.16,
              weight: 3,
              opacity: 0.95,
              dashArray: '7 5',
            }}
          />

          <Marker
            position={markerPos}
            icon={ADDRESS_MARKER_ICON}
            draggable={isDraggable}
            zIndexOffset={1000}
            riseOnHover={isDraggable}
            title="Ubicación seleccionada"
            alt="Pin de ubicación seleccionada"
            eventHandlers={isDraggable
              ? { dragstart: onDragStart, dragend: onDragEnd }
              : {}}
          />
        </MapContainer>
      </div>
    </div>
  );
});

MapPicker.displayName = 'MapPicker';
export default MapPicker;
