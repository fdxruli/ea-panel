// src/components/common/ScannerModal.jsx - VERSIÓN OPTIMIZADA
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useZxing } from 'react-zxing';
import { useOrderStore } from '../../store/useOrderStore';
import { searchProductByBarcode, queryBatchesByProductIdAndActive } from '../../services/database';
import { AlertTriangle, Camera, CameraOff, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import './ScannerModal.css';

// ✅ OPTIMIZACIÓN 1: Configuración de cámara SIMPLIFICADA
const CAMERA_CONSTRAINTS = {
  video: {
    facingMode: 'environment',
    width: { ideal: 1280 }, // Reducido de 1920 (menos procesamiento)
    height: { ideal: 720 }, // Reducido de 1080
    frameRate: { ideal: 24, max: 30 } // 24fps es suficiente y más ligero
  },
  audio: false
};

// ✅ OPTIMIZACIÓN 2: Hints simplificados (solo códigos comunes)
const SCAN_HINTS = new Map([
  [2, ['EAN_13', 'EAN_8', 'CODE_128', 'QR_CODE']] // Removimos formatos raros
]);

export default function ScannerModal({ show, onClose, onScanSuccess }) {
  const currentOrder = useOrderStore((state) => state.order);
  const setOrder = useOrderStore((state) => state.setOrder);

  const [scannedItems, setScannedItems] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [scanFeedback, setScanFeedback] = useState('');
  const [scanFeedbackType, setScanFeedbackType] = useState('success');
  const mode = onScanSuccess ? 'single' : 'pos';

  // Referencias para control de escaneo
  const lastScannedRef = useRef({ code: null, time: 0 });
  const processingRef = useRef(false);
  const scanCountRef = useRef(0);
  
  // ✅ OPTIMIZACIÓN 3: Cache de stream de cámara
  const cameraStreamRef = useRef(null);

  // ✅ OPTIMIZACIÓN 4: Configuración de ZXing MÁS LIGERA
  const { ref } = useZxing({
    paused: !isScanning,
    onDecodeResult(result) {
      const code = result.getText();
      const now = Date.now();

      // Debounce: 1 segundo (reducido de 1.5s para ser más ágil)
      if (
        lastScannedRef.current.code === code &&
        now - lastScannedRef.current.time < 1000
      ) {
        return;
      }

      if (processingRef.current) return;

      lastScannedRef.current = { code, time: now };
      processingRef.current = true;
      scanCountRef.current++;

      // MODO 1: Escaneo simple (solo devolver código)
      if (onScanSuccess) {
        if (navigator.vibrate) navigator.vibrate(50);
        onScanSuccess(code);
        handleClose(true);
        return;
      }

      // MODO 2: Punto de Venta (Carrito temporal)
      setIsScanning(false);

      if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
      setScanFeedback(code);
      setScanFeedbackType('success');

      processScannedCode(code);

      // Reactivar escaneo después de procesar
      setTimeout(() => {
        setIsScanning(true);
        processingRef.current = false;
        setScanFeedback('');
      }, 500); // Reducido de 600ms
    },
    onError(error) {
      console.error('Error ZXing:', error);
      setCameraError('Error al leer códigos. Verifica permisos de cámara.');
      processingRef.current = false;
    },
    constraints: CAMERA_CONSTRAINTS,
    hints: SCAN_HINTS,
    timeBetweenDecodingAttempts: 150, // Aumentado de 100ms para reducir carga de CPU
  });

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      lastScannedRef.current = { code: null, time: 0 };
      processingRef.current = false;
      scanCountRef.current = 0;
      
      // ✅ OPTIMIZACIÓN 5: Liberar stream de cámara
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
      }
    };
  }, []);

  // ✅ OPTIMIZACIÓN 6: Apertura de cámara INMEDIATA (sin delay artificial)
  useEffect(() => {
    if (show) {
      setIsScanning(false);
      setCameraError(null);
      lastScannedRef.current = { code: null, time: 0 };
      processingRef.current = false;

      // Solicitar permisos INMEDIATAMENTE (sin setTimeout)
      (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
          
          // Guardamos el stream para reutilizarlo
          cameraStreamRef.current = stream;
          
          // Activamos el escáner
          setIsScanning(true);
        } catch (error) {
          console.error('Error accediendo a cámara:', error);
          if (error.name === 'NotAllowedError') {
            setCameraError('Permiso de cámara denegado.');
          } else if (error.name === 'NotFoundError') {
            setCameraError('No se encontró cámara en este dispositivo.');
          } else {
            setCameraError(`Error: ${error.message}`);
          }
        }
      })();

      return () => {
        setIsScanning(false);
        // El stream se liberará en el useEffect de limpieza global
      };
    } else {
      setIsScanning(false);
      
      // Liberar cámara al cerrar modal
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
      }
    }
  }, [show]);

  const processScannedCode = async (code) => {
    try {
      const product = await searchProductByBarcode(code);
      if (product) {
        let finalPrice = 0;
        let finalCost = 0;

        // Si el producto usa gestión de lotes, obtener precio/costo del lote activo
        if (product.batchManagement?.enabled) {
          try {
            const activeBatches = await queryBatchesByProductIdAndActive(product.id, true);

            if (activeBatches && activeBatches.length > 0) {
              activeBatches.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
              const currentBatch = activeBatches[0];

              finalPrice = parseFloat(currentBatch.price) || 0;
              finalCost = parseFloat(currentBatch.cost) || 0;
            } else {
              finalPrice = parseFloat(product.price) || 0;
              finalCost = parseFloat(product.cost) || 0;
            }
          } catch (batchError) {
            console.warn("Error cargando lotes, usando precio base:", batchError);
            finalPrice = parseFloat(product.price) || 0;
            finalCost = parseFloat(product.cost) || 0;
          }
        } else {
          finalPrice = parseFloat(product.price) || 0;
          finalCost = parseFloat(product.cost) || 0;
        }

        if (isNaN(finalPrice) || finalPrice < 0) finalPrice = 0;
        if (isNaN(finalCost) || finalCost < 0) finalCost = 0;

        const safeProduct = {
          ...product,
          price: finalPrice,
          cost: finalCost,
          originalPrice: finalPrice,
          stock: (typeof product.stock === 'number' && !isNaN(product.stock)) ? product.stock : 0
        };

        setScannedItems(prevItems => {
          const existing = prevItems.find(i => i.id === safeProduct.id);
          if (existing) {
            return prevItems.map(i =>
              i.id === safeProduct.id ? { ...i, quantity: i.quantity + 1 } : i
            );
          }
          return [...prevItems, { ...safeProduct, quantity: 1 }];
        });

        setScanFeedback(`${safeProduct.name} - $${finalPrice.toFixed(2)}`);
        setScanFeedbackType('success');
      } else {
        console.warn(`Código ${code} no encontrado.`);
        setScanFeedback(`No encontrado: ${code}`);
        setScanFeedbackType('warning');
        setTimeout(() => setScanFeedback(''), 2000);
      }
    } catch (error) {
      console.error('Error procesando código:', error);
      setScanFeedback('Error al buscar producto');
      setScanFeedbackType('error');
      setTimeout(() => setScanFeedback(''), 2000);
    }
  };

  const handleConfirmScan = useCallback(() => {
    const newOrder = [...currentOrder];

    scannedItems.forEach(scannedItem => {
      const existingInOrder = newOrder.find(item => item.id === scannedItem.id);
      if (existingInOrder) {
        if (existingInOrder.saleType === 'unit') {
          existingInOrder.quantity += scannedItem.quantity;
        }
      } else {
        newOrder.push(scannedItem);
      }
    });

    setOrder(newOrder);
    handleClose(true);
  }, [scannedItems, currentOrder, setOrder]);

  const handleClose = useCallback((force = false) => {
    if (!force && scannedItems.length > 0) {
      if (!window.confirm('¿Cerrar sin agregar los productos escaneados?')) {
        return;
      }
    }
    setScannedItems([]);
    setIsScanning(false);
    setCameraError(null);
    setScanFeedback('');
    setScanFeedbackType('success');
    lastScannedRef.current = { code: null, time: 0 };
    processingRef.current = false;
    onClose();
  }, [scannedItems, onClose]);

  const totalScaneado = scannedItems.reduce(
    (sum, item) => sum + (item.price * item.quantity),
    0
  );

  if (!show) return null;

  return (
    <div id="scanner-modal" className="modal" style={{ display: 'flex' }}>
      <div className={`modal-content scanner-modal-content ${mode === 'pos' ? 'pos-scan-mode' : 'simple-scan-mode'}`}>
        <h2 className="modal-title">
          Escanear Códigos {scanCountRef.current > 0 && `(${scanCountRef.current})`}
        </h2>

        <div className="scanner-main-container">
          <div className="scanner-video-container">
            {cameraError ? (
              <div className="camera-error-feedback">
                <CameraOff size={30} aria-hidden="true" />
                <p>{cameraError}</p>
                <button onClick={() => { setCameraError(null); setIsScanning(true); }} className="btn btn-secondary">
                  <RefreshCw size={15} aria-hidden="true" /> Reintentar
                </button>
              </div>
            ) : (
              <>
                <video 
                  ref={ref} 
                  id="scanner-video" 
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'cover',
                    // ✅ OPTIMIZACIÓN 7: Hardware acceleration
                    transform: 'translateZ(0)',
                    backfaceVisibility: 'hidden'
                  }} 
                />
                {scanFeedback && (
                  <div className="scan-feedback-overlay">
                    <div className={`scan-feedback-message ${scanFeedbackType}`}>
                      {scanFeedbackType === 'success' && <CheckCircle2 size={20} aria-hidden="true" />}
                      {scanFeedbackType === 'warning' && <AlertTriangle size={20} aria-hidden="true" />}
                      {scanFeedbackType === 'error' && <XCircle size={20} aria-hidden="true" />}
                      <span>{scanFeedback}</span>
                    </div>
                  </div>
                )}
                <div className="scanner-reticle" style={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  width: '70%', height: '40%', border: '3px solid rgba(0, 255, 0, 0.5)',
                  borderRadius: '12px', pointerEvents: 'none', boxShadow: '0 0 0 9999px rgba(0,0,0,0.3)'
                }}>
                  <div style={{ position: 'absolute', bottom: '-30px', left: '50%', transform: 'translateX(-50%)', color: 'white', fontSize: '0.9rem', textShadow: '0 2px 4px rgba(0,0,0,0.8)', whiteSpace: 'nowrap' }}>
                    <Camera size={15} aria-hidden="true" /> Centra el código aquí
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="scanner-results-container">
            <h3 className="subtitle">Carrito Temporal</h3>
            <div className="scanned-items-list">
              {scannedItems.length === 0 ? (
                <p className="empty-message" style={{ padding: '2rem 0' }}>Escanea tu primer producto</p>
              ) : (
                scannedItems.map(item => (
                  <div key={item.id} className="scanned-item">
                    <span className="scanned-item-name">{item.name}</span>
                    <span className="scanned-item-controls">x{item.quantity}</span>
                    <span className="scanned-item-price">${(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))
              )}
            </div>
            <div className="scanner-total-container">
              <span>Total:</span>
              <span>${totalScaneado.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="scanner-actions">
          <button className="btn btn-process" onClick={handleConfirmScan} disabled={scannedItems.length === 0}>
            Confirmar ({scannedItems.length})
          </button>
          <button className="btn btn-cancel" onClick={() => handleClose(false)}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
