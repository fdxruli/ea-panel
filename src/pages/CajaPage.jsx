import React, { useState, useEffect } from 'react';
import { useCaja } from '../hooks/useCaja';
import AuditModal from '../components/common/AuditModal';
import { showMessageModal } from '../services/utils';
import { downloadBackupSmart } from '../services/dataTransfer';
import './CajaPage.css';

// --- Componente Local: Modal para abrir caja manualmente ---
const AbrirCajaModal = ({ show, onClose, onSave }) => {
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (show) setAmount('');
  }, [show]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const val = parseFloat(amount);
    if (!isNaN(val) && val >= 0) {
      onSave(val);
      onClose();
    } else {
      alert('Ingresa un monto válido (puede ser 0)');
    }
  };

  if (!show) return null;

  return (
    <div className="modal" style={{ display: 'flex', zIndex: 1200 }}>
      <div className="modal-content" style={{ maxWidth: '400px' }}>
        <h3 className="modal-title">📋 Abrir Turno de Caja</h3>
        <p style={{ marginBottom: '15px', color: 'var(--text-light)', fontSize: '0.9rem' }}>
          Ingresa el fondo inicial con el que comienza tu turno.
          Puede ser 0 si la caja empieza vacía.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Fondo Inicial ($)</label>
            <input
              type="number"
              className="form-input"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus
              step="0.01"
              min="0"
              placeholder="0.00"
              required
            />
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '15px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-save">Abrir Turno</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Componente Local: Modal para ajustar fondo inicial ---
const EditInitialModal = ({ show, onClose, onSave, currentAmount }) => {
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (show) setAmount(currentAmount !== undefined ? currentAmount : '');
  }, [show, currentAmount]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const val = parseFloat(amount);
    if (!isNaN(val) && val >= 0) {
      onSave(val);
      onClose();
    } else {
      alert('Ingresa un monto válido');
    }
  };

  if (!show) return null;

  return (
    <div className="modal" style={{ display: 'flex', zIndex: 1200 }}>
      <div className="modal-content" style={{ maxWidth: '400px' }}>
        <h3 className="modal-title">Ajustar Fondo Inicial</h3>
        <p style={{ marginBottom: '15px', color: 'var(--text-light)', fontSize: '0.9rem' }}>
          Corrige el monto inicial si el dinero físico real es diferente.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Fondo Real ($)</label>
            <input
              type="number"
              className="form-input"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus
              step="0.01"
              min="0"
            />
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '15px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-save">Actualizar</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Badge de sincronización ---
const SyncBadge = ({ status }) => {
  const config = {
    idle:    { icon: '☁️', text: 'Sin sync', color: '#999' },
    syncing: { icon: '⏳', text: 'Sincronizando...', color: '#f1a32b' },
    ok:      { icon: '✅', text: 'Sincronizado', color: '#27ae60' },
    error:   { icon: '⚠️', text: 'Error de sync', color: '#e74c3c' },
  }[status] || { icon: '☁️', text: '', color: '#999' };

  return (
    <span style={{
      fontSize: '0.72rem', color: config.color, display: 'flex',
      alignItems: 'center', gap: '4px', fontWeight: 500
    }}>
      {config.icon} {config.text}
    </span>
  );
};

// --- COMPONENTE PRINCIPAL ---
export default function CajaPage() {
  const {
    cajaActual,
    cajaEstaAbierta,
    historialCajas,
    movimientosCaja,
    isLoading,
    totalesTurno,
    syncStatus,
    abrirCaja,
    ajustarMontoInicial,
    realizarAuditoriaYCerrar,
    registrarMovimiento,
    calcularTotalTeorico
  } = useCaja();

  const [modalVisible, setModalVisible] = useState(null); // 'abrir', 'entrada', 'salida', 'edit-inicial'
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isBackupLoading, setIsBackupLoading] = useState(false);

  // --- Handlers ---

  const handleAbrirCaja = async (monto) => {
    const success = await abrirCaja(monto);
    if (success) {
      setModalVisible(null);
      showMessageModal('✅ Turno abierto correctamente.');
    }
  };

  const handleEntradaSubmit = async (event) => {
    event.preventDefault();
    const monto = event.target.elements['entrada-monto-input'].value;
    const concepto = event.target.elements['entrada-concepto-input'].value;
    if (await registrarMovimiento('entrada', parseFloat(monto), concepto)) {
      setModalVisible(null);
      showMessageModal('Entrada registrada correctamente.');
    }
  };

  const handleSalidaSubmit = async (event) => {
    event.preventDefault();
    const monto = event.target.elements['salida-monto-input'].value;
    const concepto = event.target.elements['salida-concepto-input'].value;
    if (await registrarMovimiento('salida', parseFloat(monto), concepto)) {
      setModalVisible(null);
      showMessageModal('Salida registrada correctamente.');
    }
  };

  const handleActionableError = (errorObj) => {
    const { message, details } = errorObj;
    if (details?.actionable === 'SUGGEST_RELOAD') {
      showMessageModal(message, () => window.location.reload(), { confirmButtonText: 'Recargar Página' });
    } else {
      showMessageModal(message, null, { type: 'error' });
    }
  };

  const handleAuditConfirm = async (montoFisico, comentarios) => {
    const result = await realizarAuditoriaYCerrar(montoFisico, comentarios);
    if (result.success) {
      setIsAuditOpen(false);
      showMessageModal('✅ Corte realizado con éxito.');
    } else {
      if (result.error?.details) {
        handleActionableError(result.error);
      } else {
        showMessageModal(`Error al cerrar caja: ${result.error}`, null, { type: 'error' });
      }
    }
  };

  const handleBackup = async () => {
    if (!window.confirm('¿Descargar copia de seguridad optimizada?')) return;
    setIsBackupLoading(true);
    try {
      await downloadBackupSmart();
      showMessageModal('✅ Respaldo generado correctamente.');
    } catch (e) {
      console.error(e);
      showMessageModal('Error al respaldar.', null, { type: 'error' });
    } finally {
      setIsBackupLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div className="spinner-loader"></div>
        <p style={{ marginTop: '10px', color: 'var(--text-light)' }}>Cargando estado de caja...</p>
      </div>
    );
  }

  // Cálculo del total en tiempo real
  const totalEnCaja = cajaActual ? (
    (cajaActual.monto_inicial || 0) +
    (totalesTurno.ventasContado || 0) +
    (totalesTurno.abonosFiado || 0) +
    (cajaActual.entradas_efectivo || 0) -
    (cajaActual.salidas_efectivo || 0)
  ) : 0;

  // ─── SI NO HAY CAJA ABIERTA: mostrar pantalla de apertura ───────
  if (!cajaEstaAbierta) {
    return (
      <div className="caja-grid">
        <div className="caja-card status-card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔒</div>
          <h2 style={{ marginBottom: '8px' }}>No tienes un turno abierto</h2>
          <p style={{ color: 'var(--text-light)', marginBottom: '28px' }}>
            Abre tu turno para gestionar ventas, entradas y salidas de efectivo.
          </p>
          <button
            className="btn btn-save"
            style={{ padding: '14px 32px', fontSize: '1rem' }}
            onClick={() => setModalVisible('abrir')}
          >
            📋 Abrir Mi Turno
          </button>
        </div>

        <AbrirCajaModal
          show={modalVisible === 'abrir'}
          onClose={() => setModalVisible(null)}
          onSave={handleAbrirCaja}
        />
      </div>
    );
  }

  return (
    <div className="caja-grid">

      {/* 1. TARJETA DE ESTADO */}
      <div className="caja-card status-card">
        <div className="status-header">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="status-badge open">Turno Activo</span>
            <small style={{ color: 'var(--text-light)' }}>
              Operado por: <strong>{cajaActual?.opened_by_name || 'Desconocido'}</strong>
            </small>
            <small style={{ color: 'var(--text-light)' }}>
              Inicio: {cajaActual?.fecha_apertura
                ? new Date(cajaActual.fecha_apertura).toLocaleString()
                : '...'}
            </small>
            <SyncBadge status={syncStatus} />
          </div>

          <button
            className="btn"
            style={{
              padding: '6px 12px', fontSize: '0.85rem',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--card-background-color)',
              color: 'var(--text-dark)',
              display: 'flex', alignItems: 'center', gap: '5px'
            }}
            onClick={handleBackup}
            disabled={isBackupLoading}
            title="Descargar copia de seguridad"
          >
            {isBackupLoading ? '⏳...' : '💾 Respaldo'}
          </button>
        </div>

        <div className="status-body">
          <div className="info-row">
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              Fondo Inicial
              <button
                className="btn-icon-small"
                onClick={() => setModalVisible('edit-inicial')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '0' }}
                title="Corregir fondo inicial"
              >
                ✏️
              </button>
            </span>
            <span className="amount neutral">${cajaActual?.monto_inicial?.toFixed(2) || '0.00'}</span>
          </div>

          <div className="info-row">
            <span>Ventas (Efectivo)</span>
            <span className="amount success">+ ${totalesTurno.ventasContado.toFixed(2)}</span>
          </div>

          {totalesTurno.abonosFiado > 0 && (
            <div className="info-row">
              <span>Abonos (Créditos)</span>
              <span className="amount warning">+ ${totalesTurno.abonosFiado.toFixed(2)}</span>
            </div>
          )}

          <div className="info-row">
            <span>Entradas Extras</span>
            <span className="amount positive">+ ${cajaActual?.entradas_efectivo?.toFixed(2) || '0.00'}</span>
          </div>
          <div className="info-row">
            <span>Salidas (Gastos)</span>
            <span className="amount negative">- ${cajaActual?.salidas_efectivo?.toFixed(2) || '0.00'}</span>
          </div>

          <div className="info-row" style={{ borderTop: '2px solid #eee', marginTop: '10px', paddingTop: '10px', borderBottom: 'none' }}>
            <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>Total en Caja</span>
            <span className="amount" style={{ fontSize: '1.4rem', color: 'var(--primary-color)' }}>
              ${totalEnCaja.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* 2. TARJETA DE ACCIONES */}
      <div className="caja-card actions-card">
        <h3 className="actions-title">Control de Efectivo</h3>
        <div className="actions-grid">
          <button className="btn btn-audit full-width" onClick={() => setIsAuditOpen(true)}>
            🛡️ Corte de Caja (Cerrar Turno)
          </button>
          <button className="btn btn-entry half-width" onClick={() => setModalVisible('entrada')}>
            + Entrada
          </button>
          <button className="btn btn-exit half-width" onClick={() => setModalVisible('salida')}>
            - Salida
          </button>
        </div>
      </div>

      {/* 3. MOVIMIENTOS DEL TURNO */}
      <div id="caja-movements-container" className="caja-card">
        <h3 className="subtitle">Movimientos del Turno</h3>
        <div id="caja-movements-list">
          {movimientosCaja.length === 0 ? (
            <p className="empty-message" style={{ textAlign: 'center', color: '#999', fontStyle: 'italic' }}>
              No hay movimientos manuales.
            </p>
          ) : (
            movimientosCaja.map(mov => (
              <div key={mov.id} className="movement-item" style={{
                borderLeft: `4px solid ${mov.tipo === 'entrada' ? 'var(--success-color)' : 'var(--error-color)'}`,
                marginBottom: '8px', padding: '8px',
                backgroundColor: 'var(--light-background)', borderRadius: '4px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 500 }}>{mov.concepto}</span>
                  <span style={{ fontWeight: 'bold', color: mov.tipo === 'entrada' ? 'var(--success-color)' : 'var(--error-color)' }}>
                    {mov.tipo === 'entrada' ? '+' : '-'}${mov.monto.toFixed(2)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                  <small style={{ color: 'var(--text-light)' }}>
                    {mov.realizado_por_name && `Por: ${mov.realizado_por_name} · `}
                    {new Date(mov.fecha).toLocaleTimeString()}
                  </small>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 4. HISTORIAL DE CORTES */}
      <div id="caja-history-container" className="caja-card sales-history-container">
        <h3 className="subtitle">Historial de Cortes</h3>
        {historialCajas.length === 0 ? (
          <p className="empty-message">No hay historial.</p>
        ) : (
          <div className="history-list" style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {historialCajas.map(c => (
              <div key={c.id} className="history-item" style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <strong>{new Date(c.fecha_apertura).toLocaleDateString()}</strong>
                  <span
                    className={`status-badge ${!c.diferencia || Math.abs(c.diferencia) < 1 ? 'success' : 'error'}`}
                    style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                  >
                    {Math.abs(c.diferencia || 0) < 1 ? 'Cuadrada' : 'Descuadre'}
                  </span>
                </div>
                {/* Auditoría de usuario */}
                {(c.opened_by_name || c.closed_by_name) && (
                  <small style={{ color: 'var(--text-light)', display: 'block', marginBottom: '2px' }}>
                    {c.opened_by_name && `Abrió: ${c.opened_by_name}`}
                    {c.closed_by_name && ` · Cerró: ${c.closed_by_name}`}
                  </small>
                )}
                <p style={{ fontSize: '0.85rem', color: '#666', margin: 0 }}>
                  Cierre: {c.monto_cierre ? `$${c.monto_cierre.toFixed(2)}` : 'N/A'}
                </p>
                {c.diferencia && Math.abs(c.diferencia) > 0 && (
                  <small style={{ color: c.diferencia > 0 ? 'var(--success-color)' : 'var(--error-color)' }}>
                    Dif: {c.diferencia > 0 ? '+' : ''}${c.diferencia.toFixed(2)}
                  </small>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- MODALES --- */}

      <AbrirCajaModal
        show={modalVisible === 'abrir'}
        onClose={() => setModalVisible(null)}
        onSave={handleAbrirCaja}
      />

      <EditInitialModal
        show={modalVisible === 'edit-inicial'}
        onClose={() => setModalVisible(null)}
        currentAmount={cajaActual?.monto_inicial}
        onSave={ajustarMontoInicial}
      />

      {modalVisible === 'entrada' && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content">
            <h2 className="modal-title">Entrada de Efectivo</h2>
            <form onSubmit={handleEntradaSubmit}>
              <div className="form-group">
                <label className="form-label">Monto:</label>
                <input name="entrada-monto-input" type="number" className="form-input" step="0.01" min="0" required autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Concepto:</label>
                <input name="entrada-concepto-input" type="text" className="form-input" placeholder="Ej: Cambio, Aporte extra" required />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" className="btn btn-cancel" onClick={() => setModalVisible(null)}>Cancelar</button>
                <button type="submit" className="btn btn-save">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalVisible === 'salida' && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content">
            <h2 className="modal-title">Salida de Efectivo</h2>
            <form onSubmit={handleSalidaSubmit}>
              <div className="form-group">
                <label className="form-label">Monto:</label>
                <input name="salida-monto-input" type="number" className="form-input" step="0.01" min="0" required autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Concepto:</label>
                <input name="salida-concepto-input" type="text" className="form-input" placeholder="Ej: Pago proveedor" required />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" className="btn btn-cancel" onClick={() => setModalVisible(null)}>Cancelar</button>
                <button type="submit" className="btn btn-delete">Registrar Salida</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AuditModal
        show={isAuditOpen}
        onClose={() => setIsAuditOpen(false)}
        onConfirmAudit={handleAuditConfirm}
        caja={cajaActual}
        calcularTeorico={calcularTotalTeorico}
      />
    </div>
  );
}