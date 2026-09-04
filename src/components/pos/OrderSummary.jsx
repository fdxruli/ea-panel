// src/components/pos/OrderSummary.jsx
import React from 'react';
import { useOrderStore } from '../../store/useOrderStore';
// 1. IMPORTAMOS EL ICONO DE BASURA (Trash2)
import { AlertTriangle, ChevronDown, FileText, ShoppingCart, Trash2 } from 'lucide-react';
import './OrderSummary.css';

export default function OrderSummary({ onOpenPayment, isMobileModal, onClose }) {
  const order = useOrderStore((state) => state.order);

  // Nos aseguramos de tener 'removeItem' disponible
  const { updateItemQuantity, removeItem, clearOrder, getTotalPrice } = useOrderStore.getState();
  const total = getTotalPrice();

  const handleQuantityChange = (id, change) => {
    // ... (lógica existente para unitarios)
    const item = order.find(i => i.id === id);
    if (!item) return;
    if (item.saleType === 'unit' || !item.saleType) {
      const newQuantity = (item.quantity || 0) + change;
      if (newQuantity <= 0) removeItem(id);
      else updateItemQuantity(id, newQuantity);
    }
  };

  const handleBulkInputChange = (id, value) => {
    // ... (lógica existente para granel)
    const newQuantity = parseFloat(value);
    // Opcional: Si escriben 0, lo borramos también
    if (newQuantity === 0) {
      removeItem(id);
    } else {
      updateItemQuantity(id, isNaN(newQuantity) || newQuantity < 0 ? null : newQuantity);
    }
  };

  return (
    <div className="pos-order-container" style={isMobileModal ? { height: '100%', boxShadow: 'none', border: 'none' } : {}}>

      {/* ... (Header del modal móvil sigue igual) ... */}
      {isMobileModal && (
        <div className="mobile-summary-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Tu Pedido</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', padding: '5px' }}>
            <ChevronDown size={24} />
          </button>
        </div>
      )}

      {!isMobileModal && <h2>Resumen del Pedido</h2>}

      {order.length === 0 ? (
        <div className="empty-message">
          <ShoppingCart className="empty-message-icon" size={56} aria-hidden="true" />
          <span>No hay productos en el pedido</span>
        </div>
      ) : (
        <>
          <div className="order-list">
            {order.map(item => {
              // ... (código de clases y modificadores igual) ...
              const itemClasses = `order-item ${item.exceedsStock ? 'exceeds-stock' : ''}`;
              const hasModifiers = item.selectedModifiers && item.selectedModifiers.length > 0;

              return (
                <div key={item.id} className={itemClasses}>
                  <div className="order-item-info">
                    {/* ... (Nombre, precio, notas igual) ... */}
                    <div className="order-item-header">
                      <span className="order-item-name">{item.name}</span>
                      {item.exceedsStock && (
                        <div className="stock-error-container">
                          <div className="stock-error-text">
                            <strong><AlertTriangle size={14} aria-hidden="true" /> Stock Insuficiente</strong>
                            <span>Solo quedan <b>{item.stock}</b> disponibles.</span>
                          </div>

                          {/* Botón inteligente para ajustar automáticamente al máximo */}
                          <button
                            className="btn-fix-stock"
                            onClick={() => updateItemQuantity(item.id, item.stock)}
                            title="Ajustar cantidad al máximo disponible"
                          >
                            Ajustar a {item.stock}
                          </button>
                        </div>
                      )}
                    </div>
                    {hasModifiers && (
                      <div className="order-item-modifiers">
                        {item.selectedModifiers.map((mod, idx) => (
                          <span key={idx} className="modifier-tag">+ {mod.name}</span>
                        ))}
                      </div>
                    )}
                    {item.notes && <div className="order-item-notes"><FileText size={13} aria-hidden="true" /> {item.notes}</div>}
                    <div className="order-item-price">${item.price.toFixed(2)} {item.saleType === 'bulk' ? ` / ${item.bulkData?.purchase?.unit || 'kg'}` : ''}</div>
                  </div>

                  {(item.saleType === 'unit' || !item.saleType) ? (
                    <div className="order-item-controls">
                      <button className="quantity-btn" onClick={() => handleQuantityChange(item.id, -1)}>−</button>
                      <span className="quantity-display">{item.quantity}</span>
                      <button className="quantity-btn" onClick={() => handleQuantityChange(item.id, 1)}>+</button>
                    </div>
                  ) : (
                    <div className="order-item-controls">

                      {/* --- NUEVO BOTÓN ELIMINAR PARA GRANEL --- */}
                      <button
                        className="btn-remove-item"
                        onClick={() => removeItem(item.id)}
                        title="Eliminar del pedido"
                      >
                        <Trash2 size={18} />
                      </button>
                      {/* -------------------------------------- */}

                      <input
                        type="number" className="bulk-input"
                        value={item.quantity || ''}
                        onChange={(e) => handleBulkInputChange(item.id, e.target.value)}
                        placeholder="0.0" step="0.1" min="0"
                      />
                      <span className="unit-label">
                        {item.bulkData?.purchase?.unit?.toUpperCase() || 'KG'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ... (Totales y botones inferiores siguen igual) ... */}
          <div className="order-total">
            <span>Total:</span>
            <span className="total-price">${total.toFixed(2)}</span>
          </div>

          <div className="order-actions">
            <button className="process-btn" onClick={onOpenPayment}>Cobrar</button>
            <button className="clear-btn" onClick={() => {
              if (window.confirm('¿Vaciar carrito?')) {
                clearOrder();
                if (isMobileModal) onClose();
              }
            }}>Cancelar</button>
          </div>
        </>
      )}
    </div>
  );
}
