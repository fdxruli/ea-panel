// src/components/common/AuditModal.jsx
import React, { useState, useEffect, useMemo } from 'react';
import './AbonoModal.css';

const BILLETES = [1000, 500, 200, 100, 50, 20];
const MONEDAS = [20, 10, 5, 2, 1, 0.5];

export default function AuditModal({ show, onClose, onConfirmAudit, calcularTeorico }) {
    const [conteoMode, setConteoMode] = useState('desglose'); // 'desglose' | 'directo'
    const [montoDirecto, setMontoDirecto] = useState('');
    const [counts, setCounts] = useState({
        b1000: '', b500: '', b200: '', b100: '', b50: '', b20: '',
        m20: '', m10: '', m5: '', m2: '', m1: '', m05: ''
    });
    const [teorico, setTeorico] = useState(0);
    const [comentarios, setComentarios] = useState('');
    const [step, setStep] = useState(1); // 1: Conteo Físico Ciego, 2: Resultado y Comparativa

    useEffect(() => {
        if (show && calcularTeorico) {
            calcularTeorico().then(val => setTeorico(val));
            setMontoDirecto('');
            setCounts({
                b1000: '', b500: '', b200: '', b100: '', b50: '', b20: '',
                m20: '', m10: '', m5: '', m2: '', m1: '', m05: ''
            });
            setComentarios('');
            setStep(1);
            setConteoMode('desglose');
        }
    }, [show, calcularTeorico]);

    // Cálculo del total por desglose
    const totalDesglose = useMemo(() => {
        let sum = 0;
        BILLETES.forEach(val => {
            const key = `b${val}`;
            const qty = parseInt(counts[key]) || 0;
            sum += qty * val;
        });
        MONEDAS.forEach(val => {
            const key = val === 0.5 ? 'm05' : `m${val}`;
            const qty = parseInt(counts[key]) || 0;
            sum += qty * val;
        });
        return Math.round(sum * 100) / 100;
    }, [counts]);

    const handleCountChange = (key, value) => {
        const clean = value === '' ? '' : Math.max(0, parseInt(value) || 0);
        setCounts(prev => ({ ...prev, [key]: clean }));
    };

    const montoFisicoFinal = conteoMode === 'desglose' ? totalDesglose : (parseFloat(montoDirecto) || 0);
    const diferencia = Math.round((montoFisicoFinal - teorico) * 100) / 100;
    const hayDiferencia = Math.abs(diferencia) > 0.5; // Tolerancia de 50 centavos

    const handleNext = () => {
        setStep(2);
    };

    const handleSubmit = () => {
        const detalleCierre = {
            modo: conteoMode,
            desglose_denominaciones: conteoMode === 'desglose' ? counts : null,
            total_contado: montoFisicoFinal,
            total_teorico: teorico,
            diferencia: diferencia,
        };
        onConfirmAudit(montoFisicoFinal, comentarios, detalleCierre);
    };

    if (!show) return null;

    return (
        <div className="modal" style={{ display: 'flex', zIndex: 'var(--z-modal-top, 1200)' }}>
            <div className="modal-content" style={{ maxWidth: step === 1 && conteoMode === 'desglose' ? '680px' : '520px', maxHeight: '92vh', overflowY: 'auto' }}>
                <h2 className="modal-title">Arqueo y Corte de Caja</h2>

                {step === 1 ? (
                    <>
                        <p style={{ color: 'var(--text-secondary, #666)', fontSize: '0.95rem', marginBottom: '15px' }}>
                            <strong>Arqueo a ciegas:</strong> Cuenta el dinero físico disponible en caja antes de ver el total teórico del sistema.
                        </p>

                        {/* Selector de modo de conteo */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
                            <button
                                type="button"
                                className={`btn ${conteoMode === 'desglose' ? 'btn-save' : 'btn-cancel'}`}
                                style={{ flex: 1, padding: '8px 12px', fontSize: '0.9rem' }}
                                onClick={() => setConteoMode('desglose')}
                            >
                                💵 Desglose de Billetes y Monedas
                            </button>
                            <button
                                type="button"
                                className={`btn ${conteoMode === 'directo' ? 'btn-save' : 'btn-cancel'}`}
                                style={{ flex: 1, padding: '8px 12px', fontSize: '0.9rem' }}
                                onClick={() => setConteoMode('directo')}
                            >
                                🔢 Monto Total Directo
                            </button>
                        </div>

                        {conteoMode === 'desglose' ? (
                            <div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                                    {/* Columna Billetes */}
                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', color: '#1e293b' }}>Billetes</h4>
                                        {BILLETES.map(den => {
                                            const key = `b${den}`;
                                            const qty = parseInt(counts[key]) || 0;
                                            const sub = qty * den;
                                            return (
                                                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                    <span style={{ fontWeight: 600, width: '65px', fontSize: '0.9rem' }}>${den}:</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        placeholder="0"
                                                        value={counts[key]}
                                                        onChange={e => handleCountChange(key, e.target.value)}
                                                        className="form-input"
                                                        style={{ width: '75px', textAlign: 'center', padding: '4px 6px', fontSize: '0.9rem' }}
                                                    />
                                                    <span style={{ width: '85px', textAlign: 'right', fontSize: '0.85rem', color: '#475569' }}>
                                                        = ${sub.toFixed(2)}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Columna Monedas */}
                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', color: '#1e293b' }}>Monedas</h4>
                                        {MONEDAS.map(den => {
                                            const key = den === 0.5 ? 'm05' : `m${den}`;
                                            const qty = parseInt(counts[key]) || 0;
                                            const sub = qty * den;
                                            return (
                                                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                    <span style={{ fontWeight: 600, width: '65px', fontSize: '0.9rem' }}>${den === 0.5 ? '0.50' : den}:</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        placeholder="0"
                                                        value={counts[key]}
                                                        onChange={e => handleCountChange(key, e.target.value)}
                                                        className="form-input"
                                                        style={{ width: '75px', textAlign: 'center', padding: '4px 6px', fontSize: '0.9rem' }}
                                                    />
                                                    <span style={{ width: '85px', textAlign: 'right', fontSize: '0.85rem', color: '#475569' }}>
                                                        = ${sub.toFixed(2)}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div style={{
                                    marginTop: '16px',
                                    padding: '12px 16px',
                                    backgroundColor: '#e0f2fe',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <span style={{ fontWeight: 600, color: '#0369a1' }}>Total Físico Contado:</span>
                                    <span style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#0284c7' }}>
                                        ${totalDesglose.toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="form-group">
                                <label className="form-label">Total en Efectivo Contado ($):</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    style={{ fontSize: '1.6rem', textAlign: 'center', fontWeight: 'bold' }}
                                    value={montoDirecto}
                                    onChange={(e) => setMontoDirecto(e.target.value)}
                                    step="0.01"
                                    min="0"
                                    placeholder="0.00"
                                    autoFocus
                                />
                            </div>
                        )}

                        <div style={{ marginTop: '22px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button className="btn btn-cancel" onClick={onClose}>Cancelar</button>
                            <button
                                className="btn btn-save"
                                onClick={handleNext}
                                disabled={montoFisicoFinal <= 0 && !montoDirecto && totalDesglose === 0}
                            >
                                Siguiente: Comparar Cuadre ➔
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '8px' }}>
                                    <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', color: '#64748b' }}>El sistema esperaba:</p>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#334155' }}>${teorico.toFixed(2)}</div>
                                </div>
                                <div style={{ background: '#e0f2fe', padding: '12px', borderRadius: '8px' }}>
                                    <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', color: '#0284c7' }}>Tú contaste físicamente:</p>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#0369a1' }}>${montoFisicoFinal.toFixed(2)}</div>
                                </div>
                            </div>

                            <div style={{
                                padding: '14px',
                                borderRadius: '8px',
                                backgroundColor: hayDiferencia ? (diferencia < 0 ? '#fee2e2' : '#fef3c7') : '#d1fae5',
                                color: hayDiferencia ? (diferencia < 0 ? '#b91c1c' : '#b45309') : '#047857',
                                fontWeight: 'bold',
                                fontSize: '1.05rem'
                            }}>
                                {hayDiferencia
                                    ? `⚠️ ${diferencia < 0 ? 'Faltante en caja' : 'Sobrante en caja'}: ${diferencia > 0 ? '+' : ''}$${diferencia.toFixed(2)}`
                                    : '✅ ¡Caja Cuadrada Perfectamente!'}
                            </div>
                        </div>

                        {hayDiferencia && (
                            <div className="form-group">
                                <label className="form-label" style={{ color: '#b91c1c', fontWeight: 600 }}>
                                    Motivo del descuadre (Requerido para auditoría y cierre):
                                </label>
                                <textarea
                                    className="form-textarea"
                                    placeholder="Explica detalladamente a qué se debe la diferencia (ej: error en cambio, retiro no registrado, etc.)..."
                                    value={comentarios}
                                    onChange={(e) => setComentarios(e.target.value)}
                                    rows={3}
                                    required
                                ></textarea>
                            </div>
                        )}

                        <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                            <button className="btn btn-cancel" onClick={() => setStep(1)}>⬅ Volver a contar</button>
                            <button
                                className="btn btn-save"
                                onClick={handleSubmit}
                                disabled={hayDiferencia && comentarios.trim().length < 5}
                                style={{ flex: 1 }}
                            >
                                Confirmar y Cerrar Caja
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}