import React from 'react';

const MapPicker = React.lazy(() => import('./MapPicker'));

const DynamicMapPicker = React.forwardRef(({ onLocationSelect, initialPosition, isDraggable }, ref) => {
  return (
    <React.Suspense fallback={<div style={{height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>Cargando mapa...</div>}>
      <MapPicker ref={ref} onLocationSelect={onLocationSelect} initialPosition={initialPosition} isDraggable={isDraggable} />
    </React.Suspense>
  );
});

export default DynamicMapPicker;