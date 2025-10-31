/**
 * Escapa los valores para CSV, manejando comas, comillas y saltos de línea.
 */
const escapeCSVValue = (value) => {
    const stringValue = String(value == null ? '' : value);
    // Si el valor contiene comas, comillas o saltos de línea, debe ser envuelto en comillas
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        // Escapar comillas dobles (") duplicándolas (-> "")
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
};

/**
 * Exporta un array de objetos a un archivo CSV.
 * @param {Array<Object>} data - El array de datos (JSON) a exportar.
 * @param {string} fileName - El nombre del archivo (ej: 'reporte.csv').
 */
export const exportToCSV = (data, fileName) => {
    if (!data || data.length === 0) {
        console.error("No hay datos para exportar.");
        // Opcional: Mostrar una alerta al usuario
        // alert("No hay datos disponibles para exportar.");
        return;
    }

    // Usar las claves del primer objeto como cabeceras
    const headers = Object.keys(data[0]);
    
    // Crear la fila de cabeceras (escapando también las cabeceras)
    const headerRow = headers.map(escapeCSVValue).join(',');

    // Crear las filas de datos
    const dataRows = data.map(row => {
        return headers.map(header => {
            return escapeCSVValue(row[header]);
        }).join(',');
    });

    // Combinar todo
    const csvContent = [headerRow, ...dataRows].join('\n');

    // Crear y descargar el archivo
    // Añadir BOM (Byte Order Mark) para compatibilidad con Excel en Windows (UTF-8)
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
};