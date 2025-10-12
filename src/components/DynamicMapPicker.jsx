import React from 'react';

const MapPicker = React.lazy(() => import('./MapPicker'));

export default function DynamicMapPicker({ onLocationSelect, initialPosition, isDraggable }) {
  return (
    <React.Suspense fallback={<div style={{height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>Cargando mapa...</div>}>
      <MapPicker onLocationSelect={onLocationSelect} initialPosition={initialPosition} isDraggable={isDraggable} />
    </React.Suspense>
  );
}