import React, { useState } from 'react';
import { Carrot, CookingPot, Plus, Sparkles, Trash2, Utensils, X } from 'lucide-react';

export default function RestauranteFields({
  productType, setProductType,
  onManageRecipe,
  printStation, setPrintStation,
  // Nuevos props que necesitaremos pasar desde ProductForm
  prepTime, setPrepTime,
  modifiers, setModifiers
}) {

  // Estado local para agregar un nuevo grupo de modificadores rápidamente
  const [newModGroup, setNewModGroup] = useState('');

  const handleAddModifierGroup = () => {
    if (!newModGroup.trim()) return;
    // Estructura base de un grupo de modificadores
    const newGroup = {
      id: Date.now(),
      name: newModGroup,
      required: false, // Por defecto opcional
      options: [] // Aquí irán las opciones (ej: "Rojo", "Verde")
    };
    setModifiers([...(modifiers || []), newGroup]);
    setNewModGroup('');
  };

  const removeModifierGroup = (index) => {
    const updated = [...modifiers];
    updated.splice(index, 1);
    setModifiers(updated);
  };

  // Función para agregar una opción a un grupo (ej: "Queso" al grupo "Extras")
  const addOptionToGroup = (groupIndex, optionName, price) => {
    const updated = [...modifiers];
    updated[groupIndex].options.push({
      name: optionName,
      price: parseFloat(price) || 0
    });
    setModifiers(updated);
  };

  const removeOptionFromGroup = (groupIndex, optionIndex) => {
    const updated = [...modifiers];
    updated[groupIndex].options.splice(optionIndex, 1);
    setModifiers(updated);
  };

  return (
    <div className="restaurant-fields-container" style={{ animation: 'fadeIn 0.3s' }}>

      {/* 1. SELECTOR DE TIPO (VISUALMENTE MEJORADO) */}
      <div className="form-group product-type-toggle" style={{ backgroundColor: 'var(--light-background)', padding: '10px', borderRadius: '8px' }}>
        <label className="form-label" style={{ marginBottom: '10px' }}>Tipo de Ítem</label>
        <div className="theme-toggle-container" style={{ width: '100%', display: 'flex' }}>
          <label className="theme-radio-label" style={{ flex: 1, textAlign: 'center' }}>
            <input
              type="radio" name="productType" value="sellable"
              checked={productType === 'sellable'}
              onChange={() => setProductType('sellable')}
            />
            <span className="theme-radio-text"><Utensils size={16} aria-hidden="true" /> Platillo (Venta)</span>
          </label>
          <label className="theme-radio-label" style={{ flex: 1, textAlign: 'center' }}>
            <input
              type="radio" name="productType" value="ingredient"
              checked={productType === 'ingredient'}
              onChange={() => setProductType('ingredient')}
            />
            <span className="theme-radio-text"><Carrot size={16} aria-hidden="true" /> Insumo (Inventario)</span>
          </label>
        </div>
      </div>

      {/* 2. OPCIONES PARA PLATILLOS */}
      {productType === 'sellable' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '15px' }}>
            {/* Botón Receta Destacado */}
            <div className="form-group">
              <label className="form-label">Inventario & Costos</label>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={onManageRecipe}
              >
                <CookingPot size={16} aria-hidden="true" /> Configurar Receta
              </button>
              <small style={{ display: 'block', marginTop: '5px', color: 'var(--text-light)', fontSize: '0.8rem' }}>Define qué insumos se descuentan.</small>
            </div>

            {/* Estación de Impresión */}
            <div className="form-group">
              <label className="form-label">Enviar Comanda a:</label>
              <select
                className="form-input"
                value={printStation}
                onChange={(e) => setPrintStation(e.target.value)}
              >
                <option value="kitchen">Cocina</option>
                <option value="bar">Barra / Bebidas</option>
                <option value="dessert">Postres</option>
                <option value="none">No Imprimir</option>
              </select>
            </div>
          </div>

          {/* Tiempo de Preparación */}
          <div className="form-group" style={{ marginTop: '10px' }}>
            <label className="form-label">Tiempo Promedio de Preparación (min)</label>
            <input
              type="number"
              className="form-input"
              placeholder="Ej: 15"
              value={prepTime}
              onChange={(e) => setPrepTime(e.target.value)}
            />
          </div>

          {/* 3. GESTOR DE MODIFICADORES (NUEVO) */}
          <div style={{ marginTop: '20px', borderTop: '1px dashed #ccc', paddingTop: '15px' }}>
            <label className="form-label" style={{ color: 'var(--primary-color)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <Sparkles size={16} aria-hidden="true" /> Modificadores / Extras
            </label>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginBottom: '10px' }}>
              Ej: "Elige tu Salsa", "Agrega papas", "Término de carne".
            </p>

            {/* Input para crear grupo */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Nuevo Grupo (Ej: Salsas)"
                value={newModGroup}
                onChange={(e) => setNewModGroup(e.target.value)}
              />
              <button type="button" className="btn btn-save" style={{ width: 'auto' }} onClick={handleAddModifierGroup}>Crear</button>
            </div>

            {/* Lista de Grupos */}
            <div className="modifiers-list">
              {modifiers && modifiers.map((group, idx) => (
                <div key={idx} style={{
                  backgroundColor: 'var(--light-background)',
                  padding: '10px',
                  borderRadius: '8px',
                  marginBottom: '10px',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <strong style={{ color: 'var(--text-dark)' }}>{group.name}</strong>
                    <button type="button" style={{ color: 'var(--error-color)', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }} onClick={() => removeModifierGroup(idx)}>
                      <Trash2 size={14} aria-hidden="true" /> Eliminar Grupo
                    </button>
                  </div>

                  {/* Agregar Opción al Grupo */}
                  <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                    <input id={`opt-name-${idx}`} type="text" className="form-input" placeholder="Opción (ej: Roja)" style={{ padding: '5px', fontSize: '0.9rem' }} />
                    <input id={`opt-price-${idx}`} type="number" className="form-input" placeholder="$ Extra" style={{ width: '80px', padding: '5px', fontSize: '0.9rem' }} />
                    <button type="button" className="btn btn-help" style={{ margin: 0, padding: '0 10px' }} onClick={() => {
                      const nameInput = document.getElementById(`opt-name-${idx}`);
                      const priceInput = document.getElementById(`opt-price-${idx}`);
                      if (nameInput.value) {
                        addOptionToGroup(idx, nameInput.value, priceInput.value);
                        nameInput.value = '';
                        priceInput.value = '';
                        nameInput.focus();
                      }
                    }} aria-label="Agregar opción"><Plus size={15} aria-hidden="true" /></button>
                  </div>

                  {/* Lista de Opciones del Grupo */}
                  <ul style={{ paddingLeft: '20px', margin: 0 }}>
                    {group.options.map((opt, optIdx) => (
                      <li key={optIdx} style={{ fontSize: '0.9rem', color: 'var(--text-color)', marginBottom: '4px' }}>
                        {opt.name} {opt.price > 0 && <span style={{ color: 'var(--success-color)', fontWeight: 'bold' }}>(+${opt.price})</span>}
                        <button type="button" style={{ marginLeft: '10px', color: '#999', border: 'none', background: 'none', cursor: 'pointer' }} onClick={() => removeOptionFromGroup(idx, optIdx)} aria-label="Eliminar opción">
                          <X size={14} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {productType === 'ingredient' && (
        <div style={{ padding: '15px', backgroundColor: '#eff6ff', borderRadius: '8px', borderLeft: '4px solid #3b82f6', marginTop: '10px' }}>
          <h4 style={{ margin: '0 0 5px 0', color: '#1e40af' }}>Modo Insumo</h4>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#1e3a8a' }}>
            Este producto <strong>no aparecerá en el menú de ventas</strong>.
            Se usará exclusivamente para construir recetas de otros platillos y descontar inventario automáticamente.
          </p>
        </div>
      )}
    </div>
  );
}
