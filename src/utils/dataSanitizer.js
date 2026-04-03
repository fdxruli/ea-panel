// src/utils/dataSanitizer.js

/**
 * Valida y formatea un dataset antes de insertarlo en cache local.
 * @param {Array} data - Datos crudos de la API.
 * @param {Object} schemaRules - Reglas de validacion.
 * @param {number} threshold - Porcentaje maximo de perdida tolerada (0 a 1).
 */
export function sanitizeDataset(data, schemaRules, threshold = 0.05) {
    if (!Array.isArray(data)) throw new Error('El payload no es un array');
    if (data.length === 0) return [];

    const validData = [];
    let corruptCount = 0;
    const allowedFields = Array.isArray(schemaRules.fields) && schemaRules.fields.length > 0
        ? new Set([
            ...schemaRules.fields,
            schemaRules.primaryKey,
            ...(schemaRules.required || []),
            ...Object.keys(schemaRules.defaults || {})
        ])
        : null;

    for (const item of data) {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
            console.warn('Registro descartado: el item no es un objeto valido', item);
            corruptCount++;
            continue;
        }

        let primaryKey = item[schemaRules.primaryKey];
        if (primaryKey == null && schemaRules.fallbackKey) {
            primaryKey = item[schemaRules.fallbackKey];
        }

        if (primaryKey == null) {
            console.warn('Registro descartado: falta clave primaria', item);
            corruptCount++;
            continue;
        }

        let isValid = true;
        for (const field of schemaRules.required || []) {
            if (item[field] == null) {
                console.warn(`Registro descartado: falta campo requerido "${field}"`, item);
                isValid = false;
                break;
            }
        }

        if (!isValid) {
            corruptCount++;
            continue;
        }

        const sanitizedItem = {};
        const fieldsToCopy = allowedFields ? Array.from(allowedFields) : Object.keys(item);

        for (const field of fieldsToCopy) {
            if (field === schemaRules.primaryKey) {
                sanitizedItem[field] = primaryKey;
                continue;
            }

            if (Object.prototype.hasOwnProperty.call(item, field)) {
                sanitizedItem[field] = item[field];
            }
        }

        sanitizedItem[schemaRules.primaryKey] = primaryKey;

        for (const [field, defaultValue] of Object.entries(schemaRules.defaults || {})) {
            if (allowedFields && !allowedFields.has(field)) {
                continue;
            }
            sanitizedItem[field] = sanitizedItem[field] ?? defaultValue;
        }

        validData.push(sanitizedItem);
    }

    const failureRate = corruptCount / data.length;
    if (failureRate > threshold) {
        throw new Error(
            `Transaccion abortada: la tasa de datos corruptos (${(failureRate * 100).toFixed(2)}%) ` +
            `supera el umbral permitido (${threshold * 100}%). Posible cambio en el esquema de la API.`
        );
    }

    return validData;
}
