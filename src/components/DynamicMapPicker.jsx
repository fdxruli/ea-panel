// src/components/DynamicMapPicker.jsx (MODIFICADO)

import React from 'react';

const MapPicker = React.lazy(() => import('./MapPicker'));

// 1. ACEPTAMOS LA NUEVA PROP `isDraggable`
export default function DynamicMapPicker({ onLocationSelect, initialPosition, isDraggable }) {
  return (
    <React.Suspense fallback={<div style={{height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>Cargando mapa...</div>}>
      {/* 2. PASAMOS LA PROP AL COMPONENTE `MapPicker` */}
      <MapPicker onLocationSelect={onLocationSelect} initialPosition={initialPosition} isDraggable={isDraggable} />
    </React.Suspense>
  );
}