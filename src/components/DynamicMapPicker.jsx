// src/components/DynamicMapPicker.jsx

import React from 'react';

const MapPicker = React.lazy(() => import('./MapPicker'));

export default function DynamicMapPicker({ onLocationSelect }) {
  return (
    <React.Suspense fallback={<div style={{height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>Cargando mapa...</div>}>
      <MapPicker onLocationSelect={onLocationSelect} />
    </React.Suspense>
  );
}