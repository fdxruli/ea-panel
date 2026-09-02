// src/hooks/useCaja.js
// Rediseño v3: Multi-dispositivo, control estricto de caja por cajero, auditoría y Supabase Realtime
import { useState, useEffect, useCallback, useRef } from 'react';
import { showMessageModal, roundCurrency, generateID } from '../services/utils';
import { loadDataPaginated, saveDataSafe, STORES, initDB } from '../services/database';
import { useAdminAuth } from '../context/AdminAuthContext';
import { supabase } from '../lib/supabaseClient';

// ============================================================
// SINCRONIZACIÓN CON SUPABASE
// ============================================================

/**
 * Sincroniza una sesión de caja con Supabase.
 */
async function syncCajaToSupabase(caja) {
  try {
    const payload = {
      id: caja.id,
      opened_by: caja.opened_by || caja.user_id || null,
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
    if (error) {
      console.warn('[useCaja] Error sincronizando caja:', error.message);
      return false;
    }
    console.log('[useCaja] ☁️ Caja sincronizada con Supabase:', caja.id);
    return true;
  } catch (err) {
    console.warn('[useCaja] Sync fallida (sin conexión):', err.message);
    return false;
  }
}

/**
 * Sincroniza un movimiento con Supabase.
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
    if (error) {
      console.warn('[useCaja] Error sincronizando movimiento:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[useCaja] Sync movimiento fallida:', err.message);
    return false;
  }
}

// ============================================================
// HOOK PRINCIPAL: useCaja
// ============================================================

export function useCaja() {
  const { userId, adminData } = useAdminAuth();
  const adminName = adminData?.name || 'Desconocido';

  const [cajaActual, setCajaActual] = useState(null);       // La caja activa del usuario
  const [historialCajas, setHistorialCajas] = useState([]); // Historial de cajas cerradas
  const [movimientosCaja, setMovimientosCaja] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle' | 'syncing' | 'error' | 'ok'

  const [totalesTurno, setTotalesTurno] = useState({
    ventasContado: 0,
    abonosFiado: 0
  });

  const activeCajaIdRef = useRef(null);
  useEffect(() => {
    activeCajaIdRef.current = cajaActual?.id || null;
  }, [cajaActual?.id]);

  // ============================================================
  // HELPERS INTERNOS
  // ============================================================

  const calcularTotalesSesion = useCallback(async (fechaApertura, cajaId) => {
    try {
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
            // Filtrar estrictamente por caja del usuario actual si la venta tiene caja_id
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
    } catch {
      return { ventasContado: 0, abonosFiado: 0 };
    }
  }, []);

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
          movs.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
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
  // CARGA DE ESTADO HÍBRIDA (Nube + Local Multi-dispositivo)
  // ============================================================

  const cargarEstadoCaja = useCallback(async (forceRemoteCheck = true) => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    try {
      // 1. CARGA LOCAL RÁPIDA (IndexedDB) para no congelar la UI
      const cajasRecientes = await loadDataPaginated(STORES.CAJAS, {
        limit: 50,
        direction: 'prev'
      });

      let localCajaAbierta = cajasRecientes.find(
        c => c.estado === 'abierta' && (c.user_id === userId || c.opened_by === userId)
      );

      const historialLocal = cajasRecientes.filter(c => c.estado === 'cerrada');
      setHistorialCajas(historialLocal);

      if (localCajaAbierta) {
        setCajaActual(localCajaAbierta);
        await cargarMovimientos(localCajaAbierta.id);
        const totales = await calcularTotalesSesion(
          localCajaAbierta.fecha_apertura,
          localCajaAbierta.id
        );
        setTotalesTurno(totales);
      }

      // 2. VERIFICACIÓN Y SINCRONIZACIÓN CON SUPABASE (Nube)
      if (forceRemoteCheck) {
        setSyncStatus('syncing');

        // Buscar si en la nube existe una caja abierta para este usuario
        const { data: remoteOpenCaja, error: fetchError } = await supabase
          .from('cash_registers')
          .select('*')
          .eq('opened_by', userId)
          .eq('estado', 'abierta')
          .maybeSingle();

        if (fetchError) {
          console.warn('[useCaja] No se pudo verificar caja remota (posible offline):', fetchError.message);
          setSyncStatus('error');
        } else if (remoteOpenCaja) {
          // CASO A: Existe caja abierta en la nube (¡Abierta en este u otro dispositivo!)
          const cajaHidratada = {
            ...remoteOpenCaja,
            user_id: remoteOpenCaja.opened_by,
            opened_by_name: remoteOpenCaja.opened_by === userId ? adminName : 'Administrador',
          };

          // Guardar / actualizar en el IndexedDB de ESTE dispositivo
          await saveDataSafe(STORES.CAJAS, cajaHidratada);
          setCajaActual(cajaHidratada);

          // Traer y guardar movimientos de esta caja desde Supabase
          const { data: remoteMovs } = await supabase
            .from('cash_movements')
            .select('*')
            .eq('caja_id', remoteOpenCaja.id)
            .order('fecha', { ascending: true });

          if (remoteMovs && remoteMovs.length > 0) {
            for (const mov of remoteMovs) {
              await saveDataSafe(STORES.MOVIMIENTOS_CAJA, {
                ...mov,
                realizado_por_name: mov.realizado_por === userId ? adminName : 'Staff'
              });
            }
            setMovimientosCaja(remoteMovs);
          } else {
            await cargarMovimientos(cajaHidratada.id);
          }

          const totales = await calcularTotalesSesion(
            cajaHidratada.fecha_apertura,
            cajaHidratada.id
          );
          setTotalesTurno(totales);
          setSyncStatus('ok');

        } else if (!remoteOpenCaja && localCajaAbierta) {
          // CASO B: Localmente figuraba abierta, pero en la nube NO está abierta.
          // ¿Fue cerrada desde otro dispositivo? Verificamos el estado en Supabase:
          const { data: checkRemoteClosed } = await supabase
            .from('cash_registers')
            .select('*')
            .eq('id', localCajaAbierta.id)
            .maybeSingle();

          if (checkRemoteClosed && checkRemoteClosed.estado === 'cerrada') {
            // El turno fue cerrado en otro dispositivo. Actualizamos el local.
            await saveDataSafe(STORES.CAJAS, {
              ...checkRemoteClosed,
              user_id: checkRemoteClosed.opened_by
            });
            setCajaActual(null);
            setMovimientosCaja([]);
            setTotalesTurno({ ventasContado: 0, abonosFiado: 0 });
            // Recargar historial para reflejar el cierre
            const recargadas = await loadDataPaginated(STORES.CAJAS, { limit: 50, direction: 'prev' });
            setHistorialCajas(recargadas.filter(c => c.estado === 'cerrada'));
            setSyncStatus('ok');
          } else {
            // No existe en la nube aún: sincronizarla hacia la nube
            await syncCajaToSupabase(localCajaAbierta);
            setSyncStatus('ok');
          }
        } else {
          // CASO C: Ni local ni remota está abierta. El usuario no tiene turno activo.
          setCajaActual(null);
          setMovimientosCaja([]);
          setTotalesTurno({ ventasContado: 0, abonosFiado: 0 });
          setSyncStatus('ok');
        }
      }

    } catch (err) {
      console.error('Error al cargar estado de caja:', err);
      setError(err.message || 'Error al cargar la caja.');
      setSyncStatus('error');
    } finally {
      setIsLoading(false);
    }
  }, [userId, adminName, cargarMovimientos, calcularTotalesSesion]);

  // Carga inicial al montar o cambiar de usuario
  useEffect(() => {
    cargarEstadoCaja(true);
  }, [cargarEstadoCaja]);

  // ============================================================
  // SUPABASE REALTIME: Sincronización automática entre dispositivos
  // ============================================================

  useEffect(() => {
    if (!userId) return;

    const channelName = `realtime-caja-${userId.slice(0, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cash_registers',
          filter: `opened_by=eq.${userId}`
        },
        async (payload) => {
          console.log('[useCaja] ⚡ Evento Realtime en cash_registers:', payload.eventType);
          // Si el estado de la caja cambió en otro dispositivo, sincronizar inmediatamente
          await cargarEstadoCaja(true);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'cash_movements'
        },
        async (payload) => {
          const currentId = activeCajaIdRef.current;
          if (currentId && payload.new?.caja_id === currentId) {
            console.log('[useCaja] ⚡ Nuevo movimiento recibido por Realtime:', payload.new);
            await saveDataSafe(STORES.MOVIMIENTOS_CAJA, payload.new);
            setMovimientosCaja(prev => {
              if (prev.some(m => m.id === payload.new.id)) return prev;
              return [...prev, payload.new];
            });
            await cargarEstadoCaja(false);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[useCaja] 🟢 Conectado a Realtime de Caja');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, cargarEstadoCaja]);

  // ============================================================
  // ABRIR CAJA (Atómico y Seguro con RPC)
  // ============================================================

  const abrirCaja = async (montoInicial) => {
    if (!userId) {
      showMessageModal('❌ Error: No hay usuario autenticado.');
      return false;
    }

    if (cajaActual && cajaActual.estado === 'abierta') {
      showMessageModal('⚠️ Ya tienes un turno abierto en este dispositivo.');
      return false;
    }

    const initialAmount = parseFloat(montoInicial) || 0;
    const newCajaId = generateID('caja');

    setSyncStatus('syncing');

    // 1. Intentar apertura atómica vía RPC en Supabase para evitar colisión de dispositivos
    let cajaConfirmada = null;
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('abrir_caja_segura', {
        p_id: newCajaId,
        p_monto_inicial: initialAmount,
        p_opened_by: userId
      });

      if (rpcErr) throw rpcErr;

      if (rpcRes && !rpcRes.success && rpcRes.code === 'ALREADY_OPEN') {
        // El usuario ya abrió caja en otro dispositivo: adoptamos la caja remota
        showMessageModal('ℹ️ Ya tenías un turno abierto en otro equipo. Se cargó tu caja activa.');
        const existing = rpcRes.caja;
        cajaConfirmada = {
          ...existing,
          user_id: existing.opened_by,
          opened_by_name: adminName
        };
      } else if (rpcRes && rpcRes.success && rpcRes.caja) {
        cajaConfirmada = {
          ...rpcRes.caja,
          user_id: rpcRes.caja.opened_by,
          opened_by_name: adminName
        };
      }
    } catch (err) {
      console.warn('[useCaja] RPC no disponible, creando localmente:', err.message);
    }

    // 2. Fallback offline local si no se pudo conectar
    if (!cajaConfirmada) {
      cajaConfirmada = {
        id: newCajaId,
        user_id: userId,
        opened_by: userId,
        opened_by_name: adminName,
        closed_by: null,
        closed_by_name: null,
        fecha_apertura: new Date().toISOString(),
        monto_inicial: initialAmount,
        estado: 'abierta',
        fecha_cierre: null,
        monto_cierre: null,
        ventas_efectivo: 0,
        entradas_efectivo: 0,
        salidas_efectivo: 0,
        diferencia: null,
        es_auto_apertura: false,
      };
      // Intentar sincronización en background
      syncCajaToSupabase(cajaConfirmada);
    }

    // 3. Guardar en IndexedDB local y actualizar estado reactivo
    const result = await saveDataSafe(STORES.CAJAS, cajaConfirmada);
    if (!result.success) {
      showMessageModal(`❌ Error al guardar en base de datos local: ${result.error?.message}`);
      setSyncStatus('error');
      return false;
    }

    setCajaActual(cajaConfirmada);
    setMovimientosCaja([]);
    setTotalesTurno({ ventasContado: 0, abonosFiado: 0 });
    setSyncStatus('ok');

    return true;
  };

  // ============================================================
  // AJUSTAR MONTO INICIAL (Con Auditoría)
  // ============================================================

  const ajustarMontoInicial = async (nuevoMonto, motivo = '') => {
    if (!cajaActual) return false;
    const montoNum = parseFloat(nuevoMonto);
    if (isNaN(montoNum) || montoNum < 0) {
      showMessageModal('El monto debe ser un número válido mayor o igual a 0.');
      return false;
    }

    const montoAnterior = cajaActual.monto_inicial || 0;
    const diferencia = montoNum - montoAnterior;

    const cajaActualizada = {
      ...cajaActual,
      monto_inicial: montoNum
    };

    const result = await saveDataSafe(STORES.CAJAS, cajaActualizada);
    if (!result.success) {
      showMessageModal(`Error: ${result.error?.message || 'No se pudo actualizar el fondo.'}`);
      return false;
    }

    // Registrar movimiento de auditoría si hubo cambio en el fondo
    if (Math.abs(diferencia) > 0.001) {
      const movimientoAuditoria = {
        id: `mov-audit-${Date.now()}-${userId?.slice(0, 6) || 'admin'}`,
        caja_id: cajaActual.id,
        tipo: diferencia > 0 ? 'entrada' : 'salida',
        monto: Math.abs(roundCurrency(diferencia)),
        concepto: `[AUDITORÍA] Corrección Fondo Inicial ($${montoAnterior.toFixed(2)} ➔ $${montoNum.toFixed(2)})${motivo ? ': ' + motivo.trim() : ''}`,
        fecha: new Date().toISOString(),
        realizado_por: userId,
        realizado_por_name: adminName,
      };
      await saveDataSafe(STORES.MOVIMIENTOS_CAJA, movimientoAuditoria);
      setMovimientosCaja(prev => [...prev, movimientoAuditoria]);
      syncMovimientoToSupabase(movimientoAuditoria);
    }

    setCajaActual(cajaActualizada);
    syncCajaToSupabase(cajaActualizada);
    showMessageModal('✅ Fondo inicial actualizado y registrado en auditoría.');
    return true;
  };

  // ============================================================
  // CALCULAR TOTAL TEÓRICO EN EFECTIVO
  // ============================================================

  const calcularTotalTeorico = async () => {
    if (!cajaActual) return 0;
    const { ventasContado, abonosFiado } = totalesTurno;
    const ingresos = roundCurrency(
      (cajaActual.monto_inicial || 0) +
      (ventasContado || 0) +
      (abonosFiado || 0) +
      (cajaActual.entradas_efectivo || 0)
    );
    return roundCurrency(ingresos - (cajaActual.salidas_efectivo || 0));
  };

  // ============================================================
  // CERRAR CAJA (Arqueo y Corte)
  // ============================================================

  const realizarAuditoriaYCerrar = async (montoFisico, comentarios = '', detalleCierre = null) => {
    if (!cajaActual) return { success: false, error: 'No hay turno abierto para cerrar.' };

    try {
      const totalTeorico = await calcularTotalTeorico();
      const montoFisicoNum = parseFloat(montoFisico) || 0;
      const diferencia = roundCurrency(montoFisicoNum - totalTeorico);

      const { ventasContado, abonosFiado } = await calcularTotalesSesion(
        cajaActual.fecha_apertura,
        cajaActual.id
      );

      const cajaCerrada = {
        ...cajaActual,
        closed_by: userId,
        closed_by_name: adminName,
        fecha_cierre: new Date().toISOString(),
        monto_cierre: montoFisicoNum,
        ventas_efectivo: ventasContado + abonosFiado,
        diferencia: diferencia,
        comentarios_auditoria: comentarios || null,
        estado: 'cerrada',
        detalle_cierre: {
          ventas_contado: ventasContado,
          abonos_fiado: abonosFiado,
          total_teorico: totalTeorico,
          entradas_efectivo: cajaActual.entradas_efectivo || 0,
          salidas_efectivo: cajaActual.salidas_efectivo || 0,
          ...(detalleCierre || {})
        }
      };

      // 1. Guardar localmente
      const result = await saveDataSafe(STORES.CAJAS, cajaCerrada);
      if (!result.success) return { success: false, error: result.error };

      // 2. Sincronizar cierre a Supabase inmediatamente
      setSyncStatus('syncing');
      const synced = await syncCajaToSupabase(cajaCerrada);
      setSyncStatus(synced ? 'ok' : 'error');

      // 3. Recargar estado local para limpiar turno activo
      setCajaActual(null);
      setMovimientosCaja([]);
      setTotalesTurno({ ventasContado: 0, abonosFiado: 0 });

      // Actualizar historial
      const cajasActualizadas = await loadDataPaginated(STORES.CAJAS, { limit: 50, direction: 'prev' });
      setHistorialCajas(cajasActualizadas.filter(c => c.estado === 'cerrada'));

      return { success: true, diferencia };
    } catch (err) {
      console.error('Error cerrando caja:', err);
      return { success: false, error: err.message || err };
    }
  };

  // ============================================================
  // REGISTRAR MOVIMIENTO (Entrada / Salida)
  // ============================================================

  const registrarMovimiento = async (tipo, monto, concepto) => {
    if (!cajaActual) {
      showMessageModal('⚠️ Debes abrir tu turno de caja antes de registrar movimientos.');
      return false;
    }

    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      showMessageModal('El monto debe ser un número mayor a cero.');
      return false;
    }

    const movimiento = {
      id: `mov-${Date.now()}-${userId?.slice(0, 8) || 'cajero'}`,
      caja_id: cajaActual.id,
      tipo,
      monto: roundCurrency(montoNum),
      concepto: concepto.trim(),
      fecha: new Date().toISOString(),
      realizado_por: userId,
      realizado_por_name: adminName,
    };

    try {
      // 1. Guardar movimiento en IndexedDB
      const movResult = await saveDataSafe(STORES.MOVIMIENTOS_CAJA, movimiento);
      if (!movResult.success) {
        showMessageModal(movResult.error.message);
        return false;
      }

      // 2. Actualizar totales acumulados en la caja
      const cajaActualizada = { ...cajaActual };
      if (tipo === 'entrada') {
        cajaActualizada.entradas_efectivo = roundCurrency((cajaActualizada.entradas_efectivo || 0) + movimiento.monto);
      } else {
        cajaActualizada.salidas_efectivo = roundCurrency((cajaActualizada.salidas_efectivo || 0) + movimiento.monto);
      }

      const cajaResult = await saveDataSafe(STORES.CAJAS, cajaActualizada);
      if (!cajaResult.success) {
        showMessageModal('El movimiento se guardó pero no se pudo actualizar el total: ' + cajaResult.error.message);
        return false;
      }

      setCajaActual(cajaActualizada);
      setMovimientosCaja(prev => [...prev, movimiento]);

      // 3. Sincronizar en Supabase
      syncMovimientoToSupabase(movimiento);
      syncCajaToSupabase(cajaActualizada);

      return true;
    } catch (err) {
      console.error('Error registrando movimiento:', err);
      return false;
    }
  };

  // ============================================================
  // VALORES DERIVADOS
  // ============================================================

  // Una caja está abierta si su estado es 'abierta' y pertenece a este usuario
  const cajaEstaAbierta = cajaActual?.estado === 'abierta' &&
    (cajaActual?.user_id === userId || cajaActual?.opened_by === userId);

  return {
    cajaActual,
    cajaEstaAbierta,
    historialCajas,
    movimientosCaja,
    error,
    isLoading,
    syncStatus,
    totalesTurno,
    // Operaciones
    abrirCaja,
    ajustarMontoInicial,
    realizarAuditoriaYCerrar,
    registrarMovimiento,
    calcularTotalTeorico,
    recargarCaja: cargarEstadoCaja,
  };
}