/**
 * src/utils/productExportUtils.js
 * 
 * Utilidad para exportar el catálogo de productos a CSV profesionalmente
 * con métricas financieras, operativas y de ingeniería de menú.
 */

import { exportToCSV } from './exportUtils';

const MATRIX_LABELS = {
  star: 'Estrella (Alta Venta / Alto Margen)',
  workhorse: 'Caballo de Batalla (Alta Venta / Bajo Margen)',
  puzzle: 'Puzle / Oportunidad (Baja Venta / Alto Margen)',
  dog: 'Por Revisar (Baja Venta / Bajo Margen)'
};

const STOCK_LABELS = {
  in_stock: 'En Stock',
  low_stock: 'Stock Bajo',
  out_of_stock: 'Agotado',
  untracked: 'Sin Rastreo de Insumos'
};

/**
 * Transforma y descarga una lista de productos en formato CSV para Excel.
 * 
 * @param {Array<Object>} products 
 * @param {string} [customFilename] 
 */
export const exportProductsCatalogToCSV = (products, customFilename = null) => {
  if (!products || products.length === 0) {
    throw new Error('No hay productos para exportar.');
  }

  const formattedData = products.map(p => ({
    'ID': p.id,
    'Nombre del Producto': p.name,
    'Categoría': p.category_name || 'Sin categoría',
    'Estado en Catálogo': p.is_active ? 'Activo' : 'Inactivo',
    'Precio de Venta ($)': Number(p.price || 0).toFixed(2),
    'Costo Efectivo ($)': Number(p.effective_cost || 0).toFixed(2),
    'Margen de Ganancia ($)': Number(p.margin_amount || 0).toFixed(2),
    'Margen de Ganancia (%)': `${Number(p.margin_percent || 0).toFixed(1)}%`,
    'Rastrea Insumos': p.track_stock ? 'Sí (Receta)' : 'No',
    'Estado de Inventario': STOCK_LABELS[p.stock_status] || p.stock_status,
    'Porciones Preparables': p.max_preparable !== null && p.max_preparable !== undefined ? p.max_preparable : 'N/A',
    'Matriz de Menú': MATRIX_LABELS[p.menu_matrix_class] || p.menu_matrix_class,
    'Unidades Vendidas': p.total_sold || 0,
    'Ingresos Totales ($)': Number(p.total_revenue || 0).toFixed(2),
    'Calificación Promedio': p.avg_rating !== null ? Number(p.avg_rating).toFixed(1) : 'Sin reseñas',
    'Total Reseñas': p.reviews_count || 0,
    'Favoritos': p.favorites_count || 0,
    'Fecha de Creación': p.created_at ? new Date(p.created_at).toLocaleDateString('es-MX') : ''
  }));

  const timestamp = new Date().toISOString().slice(0, 10);
  const fileName = customFilename || `catalogo_productos_ea_${timestamp}.csv`;

  exportToCSV(formattedData, fileName);
};
