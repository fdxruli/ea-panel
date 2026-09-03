import React, { useState, useEffect } from 'react';
import { useCaja } from '../hooks/useCaja';
import AuditModal from '../components/common/AuditModal';
import { showMessageModal } from '../services/utils';
import { downloadBackupSmart } from '../services/dataTransfer';
import './CajaPage.css';

const CashRegisterIcon = ({ size = 24 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 10h16v9H4z" />
    <path d="M6 10V6h12v4" />
    <path d="M8 14h.01M12 14h.01M16 14h.01M8 17h8" />
  </svg>
);

const LockIcon = ({ size = 32 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="10" width="14" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" />
  </svg>
);

const DownloadIcon = ({ size = 16 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14" />
  </svg>
);

const EditIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
  </svg>
);

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
    <div className="modal caja-modal" style={{ display: 'flex', zIndex: 1200 }}>
      <div className="modal-content caja-modal-content">
        <div className="caja-modal-heading">
          <span className="caja-modal-icon"><CashRegisterIcon size={20} /></span>
          <div>
            <span className="caja-modal-kicker">Inicio de jornada</span>
            <h3 className="modal-title">Abrir turno de caja</h3>
          </div>
        </div>
        <p className="caja-modal-description">
          Ingresa el fondo inicial con el que comienza tu turno. Puede ser 0 si la caja empieza vacía.
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
          <div className="caja-modal-actions">
            <button type="button" className="btn btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-save"><CashRegisterIcon size={16} /> Abrir turno</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Componente Local: Modal para ajustar fondo inicial ---
const EditInitialModal = ({ show, onClose, onSave, currentAmount }) => {
  const [amount, setAmount] = useState('');
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    if (show) {
      setAmount(currentAmount !== undefined ? currentAmount : '');
      setMotivo('');
    }
  }, [show, currentAmount]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const val = parseFloat(amount);
    if (isNaN(val) || val < 0) {
      alert('Ingresa un monto válido mayor o igual a 0');
      return;
    }
    if (!motivo.trim()) {
      alert('Debes indicar el motivo del ajuste para la bitácora de auditoría');
      return;
    }
    onSave(val, motivo.trim());
    onClose();
  };

  if (!show) return null;

  return (
    <div className="modal caja-modal" style={{ display: 'flex', zIndex: 1200 }}>
      <div className="modal-content caja-modal-content">
        <div className="caja-modal-heading">
          <span className="caja-modal-icon"><CashRegisterIcon size={20} /></span>
          <div>
            <span className="caja-modal-kicker">Auditoría del turno</span>
            <h3 className="modal-title">Ajustar fondo inicial</h3>
          </div>
        </div>
        <p className="caja-modal-description">
          Este cambio quedará registrado en la bitácora de auditoría de caja con tu usuario.
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
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Motivo del ajuste (Obligatorio):</label>
            <input
              type="text"
              className="form-input"
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ej: Corrección de conteo matutino, billetes de cambio"
              required
            />
          </div>
          <div className="caja-modal-actions">
            <button type="button" className="btn btn-cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-save">Guardar con Auditoría</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Badge de sincronización ---
const SyncBadge = ({ status }) => {
  const config = {
    idle: { text: 'Sincronización pendiente', tone: 'neutral' },
    syncing: { text: 'Sincronizando…', tone: 'syncing' },
    ok: { text: 'Sincronizado', tone: 'ok' },
    error: { text: 'Error de sincronización', tone: 'error' },
  };

  const current = config[status] || config.idle;

  return (
    <span className={'caja-sync-badge ' + current.tone}>
      <span className="caja-sync-dot" aria-hidden="true" />
      {current.text}
    </span>
  );
};

const CajaPageHeader = ({ isOpen = false }) => (
  <header className="caja-page-header">
    <div>
      <span className="caja-eyebrow">Operación diaria</span>
      <h1>Caja</h1>
      <p>{isOpen ? 'Controla el efectivo y consulta el estado de tu turno.' : 'Abre tu turno para comenzar a operar.'}</p>
    </div>
    <div className={isOpen ? 'caja-page-header-icon is-open' : 'caja-page-header-icon'}>
      <CashRegisterIcon size={30} />
    </div>
  </header>
);

// --- COMPONENTE PRINCIPAL ---
export default function CajaPage() {
  const {
    cajaActual,
    cajaEstaAbierta,
    historialCajas,
    movimientosCaja,
    isLoading,
    totalesTurno,
    totalEnCaja,
    syncStatus,
    abrirCaja,
    ajustarMontoInicial,
    realizarAuditoriaYCerrar,
    registrarMovimiento,
    calcularTotalTeorico,
    recargarCaja,
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

  const handleAuditConfirm = async (montoFisico, comentarios, detalleCierre = null) => {
    const result = await realizarAuditoriaYCerrar(montoFisico, comentarios, detalleCierre);
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
      <div className="caja-loading">
        <div className="spinner-loader"></div>
        <p>Cargando estado de caja...</p>
      </div>
    );
  }

  if (!cajaEstaAbierta) {
    return (
      <div className="caja-grid caja-page caja-grid-empty">
        <CajaPageHeader />
        <div id="caja-status-container" className="caja-card status-card empty-state-card">
          <div className="caja-empty-icon">
            <LockIcon size={34} />
          </div>
          <span className="caja-eyebrow">Turno cerrado</span>
          <h2>No tienes un turno abierto</h2>
          <p className="caja-empty-description">
            Abre tu turno para gestionar ventas, entradas y salidas de efectivo.
          </p>
          <button
            className="btn btn-save caja-open-button"
            onClick={() => setModalVisible('abrir')}
          >
            <CashRegisterIcon size={18} /> Abrir mi turno
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
    <div className="caja-grid caja-page">
      <CajaPageHeader isOpen />

      {/* 1. TARJETA DE ESTADO */}
      <div id="caja-status-container" className="caja-card status-card">
        <div className="status-header">
          <div className="status-meta">
            <span className="status-badge open">Turno Activo</span>
            <small className="caja-muted-text">
              Operado por: <strong>{cajaActual?.opened_by_name || 'Desconocido'}</strong>
            </small>
            <small className="caja-muted-text">
              Inicio: {cajaActual?.fecha_apertura
                ? new Date(cajaActual.fecha_apertura).toLocaleString()
                : '...'}
            </small>
            <SyncBadge status={syncStatus} />
            <button
              type="button"
              className="btn-icon-small"
              onClick={() => recargarCaja(true)}
              title="Forzar sincronización con la nube"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem' }}
            >
              🔄
            </button>
          </div>

          <button
            className="btn caja-btn-ghost backup-button"
            onClick={handleBackup}
            disabled={isBackupLoading}
            title="Descargar copia de seguridad"
          >
            <DownloadIcon size={16} />
            {isBackupLoading ? 'Generando…' : 'Respaldo'}
          </button>
        </div>

        <div className="status-body">
          <div className="info-row">
            <span className="info-label info-label-with-action">
              Fondo Inicial
              <button
                className="btn-icon-small info-edit-button"
                onClick={() => setModalVisible('edit-inicial')}

                title="Corregir fondo inicial"
              >
                <EditIcon />
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

          <div className="info-row total-row">
            <span className="info-label">Total en Caja</span>
            <span className="amount total-amount">${totalEnCaja.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* 2. TARJETA DE ACCIONES */}
      <div id="caja-actions-container" className="caja-card actions-card">
        <h3 className="actions-title">Control de Efectivo</h3>
        <div className="actions-grid">
          <button className="btn btn-audit full-width" onClick={() => setIsAuditOpen(true)}>
            Corte de caja · cerrar turno
          </button>
          <button className="btn btn-entry half-width" onClick={() => setModalVisible('entrada')}>
            <span className="action-symbol">+</span> Entrada
          </button>
          <button className="btn btn-exit half-width" onClick={() => setModalVisible('salida')}>
            <span className="action-symbol">−</span> Salida
          </button>
        </div>
      </div>

      {/* 3. MOVIMIENTOS DEL TURNO */}
      <div id="caja-movements-container" className="caja-card">
        <h3 className="subtitle">Movimientos del Turno</h3>
        <div id="caja-movements-list">
          {movimientosCaja.length === 0 ? (
            <p className="empty-message movement-empty">No hay movimientos manuales.</p>
          ) : (
            movimientosCaja.map(mov => (
              <div key={mov.id} className={mov.tipo === 'entrada' ? 'movement-item movement-entry' : 'movement-item movement-exit'}>
                <div className="movement-line">
                  <span className="movement-concept">{mov.concepto}</span>
                  <span className={mov.tipo === 'entrada' ? 'movement-amount positive' : 'movement-amount negative'}>
                    {mov.tipo === 'entrada' ? '+' : '-'}${mov.monto.toFixed(2)}
                  </span>
                </div>
                <div className="movement-meta-row">
                  <small className="movement-meta">
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
          <div className="history-list">
            {historialCajas.map(c => (
              <div key={c.id} className="history-item">
                <div className="history-header">
                  <strong>{new Date(c.fecha_apertura).toLocaleDateString()}</strong>
                  <span
                    className={`status-badge ${!c.diferencia || Math.abs(c.diferencia) < 1 ? 'success' : 'error'}`}
                    
                  >
                    {Math.abs(c.diferencia || 0) < 1 ? 'Cuadrada' : 'Descuadre'}
                  </span>
                </div>
                {/* Auditoría de usuario */}
                {(c.opened_by_name || c.closed_by_name) && (
                  <small className="history-meta">
                    {c.opened_by_name && `Abrió: ${c.opened_by_name}`}
                    {c.closed_by_name && ` · Cerró: ${c.closed_by_name}`}
                  </small>
                )}
                <p className="history-amount">
                  Cierre: {c.monto_cierre ? `$${c.monto_cierre.toFixed(2)}` : 'N/A'}
                </p>
                {c.diferencia && Math.abs(c.diferencia) > 0 && (
                  <small className={c.diferencia > 0 ? 'history-difference positive' : 'history-difference negative'}>
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
        <div className="modal caja-modal" style={{ display: 'flex' }}>
          <div className="modal-content caja-modal-content">
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
              <div className="caja-modal-actions">
                <button type="button" className="btn btn-cancel" onClick={() => setModalVisible(null)}>Cancelar</button>
                <button type="submit" className="btn btn-save">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalVisible === 'salida' && (
        <div className="modal caja-modal" style={{ display: 'flex' }}>
          <div className="modal-content caja-modal-content">
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
              <div className="caja-modal-actions">
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
