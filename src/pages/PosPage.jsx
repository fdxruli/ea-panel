// src/pages/PosPage.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ProductMenu from '../components/pos/ProductMenu';
import OrderSummary from '../components/pos/OrderSummary';
import ScannerModal from '../components/common/ScannerModal';
import PaymentModal from '../components/common/PaymentModal';
import PrescriptionModal from '../components/pos/PrescriptionModal';
import { useCaja } from '../hooks/useCaja';
import { useOrderStore } from '../store/useOrderStore';
import { processSale } from '../services/salesService';
import { useAdminAuth } from '../context/AdminAuthContext';

import { useProductStore } from '../store/useProductStore';
import { useStatsStore } from '../store/useStatsStore';

import { loadData, STORES } from '../services/database';
import { showMessageModal, sendWhatsAppMessage } from '../services/utils';
import { useAppStore } from '../store/useAppStore';
import { useDebounce } from '../hooks/useDebounce';
import { useFeatureConfig } from '../hooks/useFeatureConfig';
import './PosPage.css';

// ============================================================
// OVERLAY: Caja Cerrada
// ============================================================

function CajaCerradaOverlay({ hasAccess, onAbrirTurno }) {
  const [monto, setMonto] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    const val = parseFloat(monto);
    if (!isNaN(val) && val >= 0) {
      onAbrirTurno(val);
      setMonto('');
    } else {
      showMessageModal('Ingresa un monto válido (puede ser 0).');
    }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100%', width: '100%', padding: '2rem 1rem'
    }}>
      <div className="modal-content" style={{ textAlign: 'center', margin: 'auto', maxWidth: '420px', padding: '2rem', border: '1px solid var(--border-color, #eaeaea)' }}>
        <div style={{ fontSize: '3.5rem', marginBottom: '16px' }}>🔒</div>
        <h2 style={{ margin: '0 0 12px', color: 'var(--text-dark, #1a1a1a)', fontSize: '1.5rem' }}>
          Caja Cerrada
        </h2>

        {!hasAccess ? (
          <>
            <p style={{ color: 'var(--text-light, #666)', marginBottom: '24px' }}>
              No tienes permiso para abrir una caja. Contacta al administrador.
            </p>
            <button className="admin-button-secondary" style={{ width: '100%' }} onClick={() => navigate('/admin/dashboard')}>
              ← Ir al Dashboard
            </button>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--text-light, #666)', marginBottom: '24px', lineHeight: '1.5' }}>
              Para procesar ventas debes abrir tu turno.<br />
              <strong>Ingresa el fondo inicial de tu caja.</strong>
            </p>
            <form onSubmit={handleSubmit}>
              <div className="form-group" style={{ textAlign: 'left', marginBottom: '16px' }}>
                <label className="form-label" htmlFor="pos-caja-monto" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Fondo Inicial ($):
                </label>
                <input
                  id="pos-caja-monto"
                  type="number"
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '0.5rem', border: '1px solid var(--border-color, #ccc)', backgroundColor: 'var(--bg-color, #1a1a1a)', color: 'var(--text-color, #ffffff)' }}
                  step="0.01"
                  min="0"
                  value={monto}
                  onChange={e => setMonto(e.target.value)}
                  autoFocus
                  placeholder="0.00"
                  required
                />
                <small style={{ color: 'var(--text-light)', fontSize: '0.8rem' }}>
                  Puedes ingresar 0 si la caja empieza vacía.
                </small>
              </div>
              <button
                type="submit"
                className="admin-button-primary"
                style={{ width: '100%', marginBottom: '10px' }}
              >
                📋 Abrir Mi Turno
              </button>
            </form>
            <button
              className="admin-button-secondary"
              style={{ width: '100%' }}
              onClick={() => navigate('/admin/caja')}
            >
              Ir a Gestión de Caja
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function PosPage() {
  const verifySessionIntegrity = useAppStore((state) => state.verifySessionIntegrity);
  const { hasPermission } = useAdminAuth();
  const features = useFeatureConfig();
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMobileOrderOpen, setIsMobileOrderOpen] = useState(false);

  useEffect(() => {
    if (isMobileOrderOpen) {
      window.history.pushState({ modal: 'cart' }, document.title);
      const handlePopState = () => setIsMobileOrderOpen(false);
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
    }
  }, [isMobileOrderOpen]);

  const searchProducts = useProductStore((state) => state.searchProducts);
  useEffect(() => {
    searchProducts(debouncedSearchTerm);
  }, [debouncedSearchTerm]);

  // ─── Caja ───────────────────────────────────────────────────────
  const { cajaActual, cajaEstaAbierta, abrirCaja } = useCaja();
  const { order, clearOrder, getTotalPrice } = useOrderStore();
  const companyName = useAppStore((state) => state.companyProfile?.name || 'Tu Negocio');

  const allProducts = useProductStore((state) => state.menu);
  const refreshData = useProductStore((state) => state.loadInitialProducts);

  const total = getTotalPrice();
  const totalItemsCount = order.reduce((acc, item) => acc + (item.saleType === 'bulk' ? 1 : item.quantity), 0);

  const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(false);
  const [prescriptionItems, setPrescriptionItems] = useState([]);
  const [tempPrescriptionData, setTempPrescriptionData] = useState(null);

  useEffect(() => {
    const loadExtras = async () => {
      try {
        const categoryData = await loadData(STORES.CATEGORIES);
        setCategories(categoryData || []);
        await refreshData();
      } catch (error) {
        console.error('Error cargando datos:', error);
      }
    };
    loadExtras();
  }, []);

  const filteredProducts = useMemo(() => {
    let items = (allProducts || []).filter(p => p.productType === 'sellable' || !p.productType);
    if (selectedCategoryId) {
      items = items.filter(p => p.categoryId === selectedCategoryId);
    }
    return items;
  }, [allProducts, selectedCategoryId]);

  // ─── Permiso de acceso a caja ───────────────────────────────────
  // Los admins (role === 'admin') tienen acceso por defecto a todo.
  // Los staff necesitan permiso explícito 'caja.access'.
  const hasCajaAccess = hasPermission('caja.access');

  // ─── Handler: Abrir turno desde el overlay ─────────────────────
  const handleAbrirTurno = async (monto) => {
    const success = await abrirCaja(monto);
    if (success) {
      showMessageModal('✅ Turno abierto correctamente. ¡A vender!');
    }
  };

  // ─── Checkout ───────────────────────────────────────────────────
  const handleInitiateCheckout = () => {
    const licenseDetails = useAppStore.getState().licenseDetails;
    if (!licenseDetails || !licenseDetails.valid) {
      showMessageModal('⚠️ Error de Seguridad: Licencia no válida.');
      return;
    }
    const itemsToProcess = order.filter(item => item.quantity && item.quantity > 0);
    if (itemsToProcess.length === 0) {
      showMessageModal('El pedido está vacío.');
      return;
    }

    setIsMobileOrderOpen(false);

    const itemsRequiring = features.hasLabFields
      ? itemsToProcess.filter(item => item.requiresPrescription)
      : [];

    if (itemsRequiring.length > 0) {
      setPrescriptionItems(itemsRequiring);
      setTempPrescriptionData(null);
      setIsPrescriptionModalOpen(true);
    } else {
      setTempPrescriptionData(null);
      setIsPaymentModalOpen(true);
    }
  };

  const handlePrescriptionConfirm = (data) => {
    setTempPrescriptionData(data);
    setIsPrescriptionModalOpen(false);
    setIsPaymentModalOpen(true);
  };

  const handleProcessOrder = async (paymentData, forceSale = false) => {
    if (isProcessing) return;

    const isSessionValid = await verifySessionIntegrity();
    if (!isSessionValid) {
      showMessageModal('Sesión inválida o licencia expirada. El sistema se recargará.', () => {
        window.location.reload();
      });
      return;
    }

    setIsProcessing(true);

    // Segunda línea de defensa: verificar caja justo antes de procesar
    if (!cajaEstaAbierta) {
      setIsPaymentModalOpen(false);
      setIsProcessing(false);
      showMessageModal('⚠️ Debes abrir tu turno de caja antes de registrar ventas.');
      return;
    }

    try {
      setIsPaymentModalOpen(false);

      const result = await processSale({
        order,
        paymentData,
        total,
        allProducts,
        features,
        companyName,
        tempPrescriptionData,
        ignoreStock: forceSale,
        cajaId: cajaActual?.id, // Ligamos la venta al turno actual
      });

      if (result.success) {
        clearOrder();
        setTempPrescriptionData(null);
        setIsMobileOrderOpen(false);
        showMessageModal('✅ ¡Venta registrada correctamente!');
        await refreshData();
      } else {
        if (result.errorType === 'RACE_CONDITION') {
          showMessageModal(`⚠️ ${result.message} Se han actualizado los datos. Intenta cobrar de nuevo.`);
          await refreshData();
        } else if (result.errorType === 'STOCK_WARNING') {
          showMessageModal(
            result.message,
            () => handleProcessOrder(paymentData, true),
            { confirmButtonText: 'Sí, Vender Igual', type: 'warning' }
          );
        } else {
          showMessageModal(`Error: ${result.message}`, null, { type: 'error' });
        }
      }
    } catch (error) {
      console.error('Error crítico en UI:', error);
      showMessageModal(`Error inesperado: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!cajaEstaAbierta) {
    return (
      <div className="pos-page-layout" style={{ display: 'flex', minHeight: '60vh' }}>
        <CajaCerradaOverlay
          hasAccess={hasCajaAccess}
          onAbrirTurno={handleAbrirTurno}
        />
      </div>
    );
  }

  return (
    <>

      <div className="pos-page-layout">
        <div className="pos-grid">
          <ProductMenu
            products={filteredProducts}
            categories={categories}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={setSelectedCategoryId}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onOpenScanner={() => setIsScannerOpen(true)}
          />
          <OrderSummary onOpenPayment={handleInitiateCheckout} />
        </div>
      </div>

      {totalItemsCount > 0 && (
        <div
          className="floating-cart-bar"
          onClick={() => setIsMobileOrderOpen(true)}
          role="button"
          tabIndex={0}
          aria-label={`Ver carrito con ${totalItemsCount} artículos, total $${total.toFixed(2)}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setIsMobileOrderOpen(true);
          }}
        >
          <div className="cart-info">
            <span className="cart-count-badge">{totalItemsCount}</span>
            <span className="cart-total-label">${total.toFixed(2)}</span>
          </div>
          <span className="cart-arrow">Ver pedido</span>
        </div>
      )}

      {isMobileOrderOpen && (
        <div className="modal" style={{ display: 'flex', zIndex: 10005, alignItems: 'flex-end' }}>
          <div className="modal-content" style={{
            borderRadius: '20px 20px 0 0', width: '100%', height: '85vh',
            maxWidth: '100%', padding: '0', animation: 'slideUp 0.3s ease-out', overflow: 'hidden'
          }}>
            <OrderSummary
              onOpenPayment={handleInitiateCheckout}
              isMobileModal={true}
              onClose={() => setIsMobileOrderOpen(false)}
            />
          </div>
        </div>
      )}

      <ScannerModal show={isScannerOpen} onClose={() => setIsScannerOpen(false)} />

      <PaymentModal
        show={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onConfirm={handleProcessOrder}
        total={total}
      />

      <PrescriptionModal
        show={isPrescriptionModalOpen}
        onClose={() => setIsPrescriptionModalOpen(false)}
        onConfirm={handlePrescriptionConfirm}
        itemsRequiringPrescription={prescriptionItems}
      />
    </>
  );
}