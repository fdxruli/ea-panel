// src/hooks/useCaja.js
// Rediseño v2: Caja por cajero, auditoría de usuario, sync con Supabase
import { useState, useEffect, useCallback } from 'react';
import { showMessageModal, roundCurrency, generateID } from '../services/utils';
import { loadDataPaginated, saveDataSafe, STORES, initDB } from '../services/database';
import { useAdminAuth } from '../context/AdminAuthContext';
import { supabase } from '../lib/supabaseClient';

// ============================================================
// SINCRONIZACIÓN EN BACKGROUND (fire-and-forget)
// ============================================================

/**
 * Sincroniza una caja con Supabase en segundo plano.
 * No bloquea la UI — los errores solo se loguean.
 */
async function syncCajaToSupabase(caja) {
  try {
    const payload = {
      id: caja.id,
      opened_by: caja.opened_by || null,
      closed_by: caja.closed_by || null,
      monto_inicial: caja.monto_inicial,
      monto_cierre: caja.monto_cierre ?? null,
      diferencia: caja.diferencia ?? null,
      ventas_efectivo: caja.ventas_efectivo ?? 0,
      entradas_efectivo: caja.entradas_efectivo ?? 0,
      salidas_efectivo: caja.salidas_efectivo ?? 0,
      estado: caja.estado,
      fecha_apertura: caja.fecha_apertura,
      fecha_cierre: caja.fecha_cierre ?? null,
      comentarios_auditoria: caja.comentarios_auditoria ?? null,
      detalle_cierre: caja.detalle_cierre ?? null,
    };
    const { error } = await supabase
      .from('cash_registers')
      .upsert(payload, { onConflict: 'id' });
    if (error) console.warn('[useCaja] Error sincronizando caja:', error.message);
    else console.log('[useCaja] ☁️ Caja sincronizada con Supabase:', caja.id);
  } catch (err) {
    console.warn('[useCaja] Sync fallida (sin conexión):', err.message);
  }
}

/**
 * Sincroniza un movimiento con Supabase en segundo plano.
 */
async function syncMovimientoToSupabase(movimiento) {
  try {
    const payload = {
      id: movimiento.id,
      caja_id: movimiento.caja_id,
      tipo: movimiento.tipo,
      monto: movimiento.monto,
      concepto: movimiento.concepto,
      fecha: movimiento.fecha,
      realizado_por: movimiento.realizado_por || null,
    };
    const { error } = await supabase
      .from('cash_movements')
      .upsert(payload, { onConflict: 'id' });
    if (error) console.warn('[useCaja] Error sincronizando movimiento:', error.message);
  } catch (err) {
    console.warn('[useCaja] Sync movimiento fallida:', err.message);
  }
}

const toFiniteAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const calcularTotalEnCaja = (caja, totals = {}) => {
  if (!caja) return 0;

  return roundCurrency(
    toFiniteAmount(caja.monto_inicial) +
      toFiniteAmount(totals.ventasContado) +
      toFiniteAmount(totals.abonosFiado) +
      toFiniteAmount(caja.entradas_efectivo) -
      toFiniteAmount(caja.salidas_efectivo)
  );
};

// ============================================================
// HOOK PRINCIPAL
// ============================================================

export function useCaja() {
  const { userId, adminData } = useAdminAuth();
  const adminName = adminData?.name || 'Desconocido';

  const [cajaActual, setCajaActual] = useState(null);       // La caja del usuario actual
  const [historialCajas, setHistorialCajas] = useState([]); // Historial de cajas (todas, cerradas)
  const [movimientosCaja, setMovimientosCaja] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle' | 'syncing' | 'error' | 'ok'

  const [totalesTurno, setTotalesTurno] = useState({
    ventasContado: 0,
    abonosFiado: 0
  });

  // ============================================================
  // HELPERS INTERNOS
  // ============================================================

  const calcularTotalesSesion = async (fechaApertura, cajaId) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.SALES], 'readonly');
      const store = tx.objectStore(STORES.SALES);
      const index = store.index('timestamp');
      const range = IDBKeyRange.lowerBound(fechaApertura);
      const request = index.getAll(range);

      request.onsuccess = () => {
        const sales = request.result || [];
        let contado = 0;
        let abonos = 0;

        for (const sale of sales) {
          if (sale.fulfillmentStatus === 'cancelled') continue;
          // Filtrar por caja del usuario actual si se proporciona cajaId
          if (cajaId && sale.caja_id && sale.caja_id !== cajaId) continue;
          if (sale.paymentMethod === 'efectivo') {
            contado += (sale.total || 0);
          } else if (sale.paymentMethod === 'fiado') {
            abonos += (sale.abono || 0);
          }
        }
        resolve({
          ventasContado: roundCurrency(contado),
          abonosFiado: roundCurrency(abonos)
        });
      };
      request.onerror = (e) => reject(e.target.error);
    });
  };

  const cargarMovimientos = useCallback(async (cajaId) => {
    try {
      const db = await initDB();
      const transaction = db.transaction(STORES.MOVIMIENTOS_CAJA, 'readonly');
      const store = transaction.objectStore(STORES.MOVIMIENTOS_CAJA);
      const index = store.index('caja_id');
      const request = index.getAll(cajaId);
      return new Promise((resolve) => {
        request.onsuccess = () => {
          const movs = request.result || [];
          setMovimientosCaja(movs);
          resolve(movs);
        };
        request.onerror = () => {
          setMovimientosCaja([]);
          resolve([]);
        };
      });
    } catch {
      setMovimientosCaja([]);
      return [];
    }
  }, []);

  // ============================================================
  // CARGA DE ESTADO: Una caja por usuario
  // ============================================================

  const cargarEstadoCaja = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      // Traer todas las cajas recientes
      const cajasRecientes = await loadDataPaginated(STORES.CAJAS, {
        limit: 50,
        direction: 'prev'
      });

      // Buscar la caja ABIERTA del usuario actual
      const cajaAbiertaDeUsuario = cajasRecientes.find(
        c => c.estado === 'abierta' && c.user_id === userId
      );

      // Historial: todas las cajas cerradas (de cualquier usuario)
      const historial = cajasRecientes.filter(c => c.estado === 'cerrada');

      setCajaActual(cajaAbiertaDeUsuario || null);
      setHistorialCajas(historial);

      if (cajaAbiertaDeUsuario) {
        await cargarMovimientos(cajaAbiertaDeUsuario.id);
        const totales = await calcularTotalesSesion(
          cajaAbiertaDeUsuario.fecha_apertura,
          cajaAbiertaDeUsuario.id
        );
        setTotalesTurno(totales);
      } else {
        setMovimientosCaja([]);
        setTotalesTurno({ ventasContado: 0, abonosFiado: 0 });
      }

    } catch (err) {
      console.error('Error al cargar estado de caja:', err);
      setError(err.message || 'Error al cargar la caja.');
    } finally {
      setIsLoading(false);
    }
  }, [userId, cargarMovimientos]);

  useEffect(() => {
    cargarEstadoCaja();
  }, [cargarEstadoCaja]);

  // ============================================================
  // ABRIR CAJA (manual, requerido antes de vender)
  // ============================================================

  const abrirCaja = async (montoInicial) => {
    if (!userId) {
      showMessageModal('❌ Error: No hay usuario autenticado.');
      return false;
    }

    // Verificar si el usuario ya tiene una caja abierta
    if (cajaActual && cajaActual.estado === 'abierta') {
      showMessageModal('⚠️ Ya tienes un turno abierto.');
      return false;
    }

    const nuevaCaja = {
      id: generateID('caja'),
      user_id: userId,
      opened_by: userId,
      opened_by_name: adminName,
      closed_by: null,
      closed_by_name: null,
      fecha_apertura: new Date().toISOString(),
      monto_inicial: parseFloat(montoInicial) || 0,
      estado: 'abierta',
      fecha_cierre: null,
      monto_cierre: null,
      ventas_efectivo: 0,
      entradas_efectivo: 0,
      salidas_efectivo: 0,
      diferencia: null,
      es_auto_apertura: false,
    };

    const result = await saveDataSafe(STORES.CAJAS, nuevaCaja);
    if (!result.success) {
      showMessageModal(`❌ Error al abrir caja: ${result.error?.message}`);
      return false;
    }

    setCajaActual(nuevaCaja);
    setMovimientosCaja([]);
    setTotalesTurno({ ventasContado: 0, abonosFiado: 0 });
    setSyncStatus('syncing');

    // Sincronizar en background
    syncCajaToSupabase(nuevaCaja).then(() => setSyncStatus('ok')).catch(() => setSyncStatus('error'));

    return true;
  };

  // ============================================================
  // AJUSTAR MONTO INICIAL
  // ============================================================

  const ajustarMontoInicial = async (nuevoMonto) => {
    if (!cajaActual) return;
    const cajaActualizada = { ...cajaActual, monto_inicial: parseFloat(nuevoMonto) };

    const result = await saveDataSafe(STORES.CAJAS, cajaActualizada);
    if (result.success) {
      setCajaActual(cajaActualizada);
      syncCajaToSupabase(cajaActualizada);
      showMessageModal('✅ Fondo inicial ajustado.');
    } else {
      showMessageModal(`Error: ${result.error?.message || 'No se pudo actualizar el fondo.'}`);
    }
  };

  // ============================================================
  // CALCULAR TOTAL TEÓRICO
  // ============================================================

  const calcularTotalTeorico = async () => {
    return calcularTotalEnCaja(cajaActual, totalesTurno);
  };

  // ============================================================
  // CERRAR CAJA (Auditoría y Corte)
  // ============================================================

  const realizarAuditoriaYCerrar = async (montoFisico, comentarios = '') => {
    if (!cajaActual) return false;
    try {
      const totalTeorico = await calcularTotalTeorico();
      const diferencia = parseFloat(montoFisico) - totalTeorico;
      const { ventasContado, abonosFiado } = await calcularTotalesSesion(
        cajaActual.fecha_apertura,
        cajaActual.id
      );

      const cajaCerrada = {
        ...cajaActual,
        closed_by: userId,
        closed_by_name: adminName,
        fecha_cierre: new Date().toISOString(),
        monto_cierre: parseFloat(montoFisico),
        ventas_efectivo: ventasContado + abonosFiado,
        diferencia: roundCurrency(diferencia),
        comentarios_auditoria: comentarios,
        estado: 'cerrada',
        detalle_cierre: {
          ventas_contado: ventasContado,
          abonos_fiado: abonosFiado,
          total_teorico: totalTeorico
        }
      };

      const result = await saveDataSafe(STORES.CAJAS, cajaCerrada);
      if (!result.success) return { success: false, error: result.error };

      // Sincronizar cierre en background
      syncCajaToSupabase(cajaCerrada).then(() => setSyncStatus('ok')).catch(() => setSyncStatus('error'));

      // Recargar estado (la caja quedará null para este usuario)
      await cargarEstadoCaja();

      return { success: true, diferencia: roundCurrency(diferencia) };
    } catch (err) {
      return { success: false, error: err };
    }
  };

  // ============================================================
  // REGISTRAR MOVIMIENTO (Entrada / Salida)
  // ============================================================

  const registrarMovimiento = async (tipo, monto, concepto) => {
    if (!cajaActual) return false;
    const movimiento = {
      id: `mov-${Date.now()}-${userId?.slice(0, 8) || 'anon'}`,
      caja_id: cajaActual.id,
      tipo,
      monto: parseFloat(monto),
      concepto: concepto.trim(),
      fecha: new Date().toISOString(),
      realizado_por: userId,
      realizado_por_name: adminName,
    };

    try {
      const movResult = await saveDataSafe(STORES.MOVIMIENTOS_CAJA, movimiento);
      if (!movResult.success) {
        showMessageModal(movResult.error.message);
        return false;
      }

      const cajaActualizada = { ...cajaActual };
      if (tipo === 'entrada') cajaActualizada.entradas_efectivo += movimiento.monto;
      else cajaActualizada.salidas_efectivo += movimiento.monto;

      const cajaResult = await saveDataSafe(STORES.CAJAS, cajaActualizada);
      if (!cajaResult.success) {
        showMessageModal('El movimiento se guardó pero no se pudo actualizar el total: ' + cajaResult.error.message);
        return false;
      }

      setCajaActual(cajaActualizada);
      setMovimientosCaja(prev => [...prev, movimiento]);

      // Sync en background
      syncMovimientoToSupabase(movimiento);
      syncCajaToSupabase(cajaActualizada);

      return true;
    } catch { return false; }
  };

  // ============================================================
  // VALORES DERIVADOS
  // ============================================================

  const totalEnCaja = calcularTotalEnCaja(cajaActual, totalesTurno);

  // true solo si el usuario actual tiene su propia caja abierta
  const cajaEstaAbierta = cajaActual?.estado === 'abierta' && cajaActual?.user_id === userId;

  return {
    cajaActual,
    cajaEstaAbierta,
    historialCajas,
    movimientosCaja,
    error,
    isLoading,
    syncStatus,
    totalesTurno,
    totalEnCaja,
    // Operaciones
    abrirCaja,
    ajustarMontoInicial,
    realizarAuditoriaYCerrar,
    registrarMovimiento,
    calcularTotalTeorico,
  };
}