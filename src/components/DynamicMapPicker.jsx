import React from 'react';
import styles from './MapPicker.module.css';

const MapPicker = React.lazy(() => import('./MapPicker'));

const DynamicMapPicker = React.forwardRef(({ onLocationSelect, initialPosition, isDraggable }, ref) => {
  return (
    <React.Suspense fallback={<div className={styles.loadingState} role="status">Cargando mapa...</div>}>
      <MapPicker ref={ref} onLocationSelect={onLocationSelect} initialPosition={initialPosition} isDraggable={isDraggable} />
    </React.Suspense>
  );
});

export default DynamicMapPicker;
