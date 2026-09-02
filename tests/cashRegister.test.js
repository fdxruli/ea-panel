import test from 'node:test';
import assert from 'node:assert/strict';

// Helper tests for Cash Register logic and Denominations calculation

const BILLETES = [1000, 500, 200, 100, 50, 20];
const MONEDAS = [20, 10, 5, 2, 1, 0.5];

function calcularDesglose(counts) {
  let sum = 0;
  BILLETES.forEach(val => {
    const key = `b${val}`;
    const qty = parseInt(counts[key] || 0);
    sum += qty * val;
  });
  MONEDAS.forEach(val => {
    const key = val === 0.5 ? 'm05' : `m${val}`;
    const qty = parseInt(counts[key] || 0);
    sum += qty * val;
  });
  return Math.round(sum * 100) / 100;
}

function calcularTotalTeorico({ montoInicial, ventasContado, abonosFiado, entradas, salidas }) {
  const ingresos = (montoInicial || 0) + (ventasContado || 0) + (abonosFiado || 0) + (entradas || 0);
  return Math.round((ingresos - (salidas || 0)) * 100) / 100;
}

test('calcularDesglose: suma exactamente monedas y billetes', () => {
  const counts = {
    b1000: 2, // 2000
    b500: 3,  // 1500
    b200: 1,  // 200
    b100: 4,  // 400
    b50: 2,   // 100
    b20: 5,   // 100
    m20: 2,   // 40
    m10: 10,  // 100
    m5: 6,    // 30
    m2: 5,    // 10
    m1: 15,   // 15
    m05: 4    // 2
  };
  const total = calcularDesglose(counts);
  assert.equal(total, 4497.00);
});

test('calcularTotalTeorico: balancea adecuadamente ventas, abonos, entradas y gastos', () => {
  const balance = calcularTotalTeorico({
    montoInicial: 500,
    ventasContado: 1250.50,
    abonosFiado: 300,
    entradas: 200,
    salidas: 150.25
  });
  assert.equal(balance, 2100.25);
});

test('diferencia de arqueo: detecta faltante y sobrante con precisión decimal', () => {
  const teorico = 1500.00;
  const contadoFaltante = 1450.00;
  const diferenciaFaltante = Math.round((contadoFaltante - teorico) * 100) / 100;
  assert.equal(diferenciaFaltante, -50.00);

  const contadoSobrante = 1520.50;
  const diferenciaSobrante = Math.round((contadoSobrante - teorico) * 100) / 100;
  assert.equal(diferenciaSobrante, 20.50);
});
