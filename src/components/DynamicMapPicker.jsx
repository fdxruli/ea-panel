// src/components/DynamicMapPicker.jsx (MODIFICADO)

import React from 'react';

const MapPicker = React.lazy(() => import('./MapPicker'));

// 1. ACEPTAMOS LA NUEVA PROP `initialPosition`
export default function DynamicMapPicker({ onLocationSelect, initialPosition }) {
  return (
    <React.Suspense fallback={<div style={{height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>Cargando mapa...</div>}>
      {/* 2. PASAMOS LA PROP AL COMPONENTE `MapPicker` */}
      <MapPicker onLocationSelect={onLocationSelect} initialPosition={initialPosition} />
    </React.Suspense>
  );
}