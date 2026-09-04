import React, { useState, useEffect } from 'react';
import { generateID } from '../../services/utils';
import { Plus, Sparkles, WandSparkles, X } from 'lucide-react';

export default function QuickVariantEntry({ basePrice, baseCost, onVariantsChange }) {
  // Estado local para las filas de variantes
  const [rows, setRows] = useState([
    // Iniciamos con una fila vacía para invitar a escribir
    { id: Date.now(), talla: '', color: '', sku: '', stock: '', cost: baseCost, price: basePrice }
  ]);

  // Cada vez que cambian las filas, notificamos al padre (ProductForm)
  useEffect(() => {
    onVariantsChange(rows);
  }, [rows, onVariantsChange]);

  // Actualizar una celda específica
  const updateRow = (id, field, value) => {
    setRows(prev => prev.map(row => {
      if (row.id === id) {
        return { ...row, [field]: value };
      }
      return row;
    }));
  };

  // Agregar nueva fila
  const addRow = () => {
    setRows(prev => [
      ...prev,
      { id: Date.now() + Math.random(), talla: '', color: '', sku: '', stock: '', cost: baseCost, price: basePrice }
    ]);
  };

  // Eliminar fila
  const removeRow = (id) => {
    setRows(prev => prev.filter(r => r.id !== id));
  };

  // Generador de SKU simple (Opcional, ayuda a la velocidad)
  const generateSKU = (id, talla, color) => {
    const random = Math.floor(Math.random() * 1000);
    const sku = `${talla.toUpperCase()}-${color.toUpperCase()}-${random}`.replace(/\s+/g, '');
    updateRow(id, 'sku', sku);
  };

  return (
    <div className="quick-variant-container" style={{ marginTop: '20px', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '15px', backgroundColor: '#f9fafb' }}>
      <h4 style={{ margin: '0 0 10px 0', color: 'var(--primary-color)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
        <Sparkles size={17} aria-hidden="true" /> Ingreso Rápido de Variantes
      </h4>
      
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-light)' }}>
              <th style={{padding: '5px'}}>Talla / Medida</th>
              <th style={{padding: '5px'}}>Color / Estilo</th>
              <th style={{padding: '5px', width: '80px'}}>Stock</th>
              <th style={{padding: '5px'}}>SKU (Opcional)</th>
              <th style={{padding: '5px', width: '40px'}}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{padding: '5px'}}>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Ej: M, 28"
                    value={row.talla}
                    onChange={(e) => updateRow(row.id, 'talla', e.target.value)}
                    style={{ padding: '6px' }}
                    autoFocus={index === rows.length - 1 && rows.length > 1} // Auto-foco en nueva fila
                  />
                </td>
                <td style={{padding: '5px'}}>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Ej: Azul"
                    value={row.color}
                    onChange={(e) => updateRow(row.id, 'color', e.target.value)}
                    style={{ padding: '6px' }}
                  />
                </td>
                <td style={{padding: '5px'}}>
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="0"
                    value={row.stock}
                    onChange={(e) => updateRow(row.id, 'stock', e.target.value)}
                    style={{ padding: '6px', textAlign: 'center', fontWeight: 'bold' }}
                  />
                </td>
                <td style={{padding: '5px'}}>
                  <div style={{display:'flex', gap:'5px'}}>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="---"
                      value={row.sku}
                      onChange={(e) => updateRow(row.id, 'sku', e.target.value)}
                      style={{ padding: '6px', fontSize:'0.8rem' }}
                    />
                    {!row.sku && row.talla && (
                        <button type="button" onClick={() => generateSKU(row.id, row.talla, row.color)} style={{border:'none', background:'none', cursor:'pointer', fontSize:'1.2rem'}} title="Generar SKU" aria-label="Generar SKU">
                          <WandSparkles size={17} aria-hidden="true" />
                        </button>
                    )}
                  </div>
                </td>
                <td style={{padding: '5px', textAlign:'center'}}>
                  <button type="button" onClick={() => removeRow(row.id)} style={{ color: 'var(--error-color)', background: 'none', border: 'none', cursor: 'pointer' }} aria-label="Eliminar variante">
                    <X size={16} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button 
        type="button" 
        onClick={addRow} 
        className="btn btn-secondary" 
        style={{ marginTop: '10px', width: '100%', padding: '8px', fontSize: '0.9rem', borderStyle: 'dashed' }}
      >
        <Plus size={16} aria-hidden="true" /> Agregar otra Variante
      </button>
    </div>
  );
}
