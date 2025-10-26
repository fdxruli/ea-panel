import React, { useEffect, useState, useCallback, useMemo, memo } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import { useAlert } from "../context/AlertContext";
import styles from "./Discounts.module.css";
import { useAdminAuth } from '../context/AdminAuthContext';

// ==================== COMPONENTES MEMOIZADOS ====================

// Componente de fila de tabla memoizado
const DiscountTableRow = memo(({
    discount,
    canEdit,
    onToggle,
    getTargetName
}) => {
    return (
        <tr>
            <td className={styles.codeCell}>
                <code>{discount.code}</code>
            </td>
            <td>{discount.value}%</td>
            <td>
                <span className={styles.typeBadge}>
                    {discount.type}
                </span>
            </td>
            <td>{getTargetName(discount)}</td>
            <td>
                {discount.start_date || "N/A"} - {discount.end_date || "N/A"}
            </td>
            <td>
                <span className={styles.usageBadge}>
                    {discount.is_single_use ? 'Único' : 'Múltiple'}
                </span>
            </td>
            <td>
                <span className={`${styles.statusBadge} ${discount.is_active ? styles.active : styles.inactive}`}>
                    {discount.is_active ? "Activo" : "Inactivo"}
                </span>
            </td>
            {canEdit && (
                <td className={styles.actions}>
                    <button
                        onClick={() => onToggle(discount.id, discount.is_active)}
                        className={styles.toggleButton}
                        aria-label={discount.is_active ? "Desactivar" : "Activar"}
                    >
                        {discount.is_active ? "🔴 Desactivar" : "🟢 Activar"}
                    </button>
                </td>
            )}
        </tr>
    );
}, (prevProps, nextProps) => {
    // Comparación personalizada para evitar re-renders innecesarios
    return (
        prevProps.discount.id === nextProps.discount.id &&
        prevProps.discount.is_active === nextProps.discount.is_active &&
        prevProps.discount.code === nextProps.discount.code &&
        prevProps.canEdit === nextProps.canEdit
    );
});
DiscountTableRow.displayName = 'DiscountTableRow';

// ==================== COMPONENTE PRINCIPAL ====================

export default function Discounts() {
    const { showAlert } = useAlert();
    const { hasPermission } = useAdminAuth();

    const [discounts, setDiscounts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newDiscount, setNewDiscount] = useState({
        code: "",
        type: "global",
        value: "",
        target_id: null,
        start_date: "",
        end_date: "",
        is_active: true,
        is_single_use: false
    });

    const canEdit = hasPermission('descuentos.edit');

    // ✅ OPTIMIZACIÓN: Fetch con selección específica de columnas
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [discountsRes, categoriesRes, productsRes] = await Promise.all([
                supabase
                    .from("discounts")
                    .select("id, code, type, value, target_id, start_date, end_date, is_active, is_single_use, created_at")
                    .order("created_at", { ascending: false }),
                supabase
                    .from("categories")
                    .select("id, name")
                    .order("name"),
                supabase
                    .from("products")
                    .select("id, name")
                    .eq("is_active", true)
                    .order("name")
            ]);

            if (discountsRes.error) throw discountsRes.error;
            if (categoriesRes.error) throw categoriesRes.error;
            if (productsRes.error) throw productsRes.error;

            setDiscounts(discountsRes.data || []);
            setCategories(categoriesRes.data || []);
            setProducts(productsRes.data || []);

        } catch (error) {
            console.error('Fetch error:', error);
            showAlert(`Error al cargar datos: ${error.message}`);
            setDiscounts([]);
            setCategories([]);
            setProducts([]);
        } finally {
            setLoading(false);
        }
    }, [showAlert]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // ✅ OPTIMIZACIÓN: Realtime selectivo sin refetch completo
    useEffect(() => {
        const channel = supabase
            .channel('discounts-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'discounts',
                    select: 'id, code, type, value, target_id, start_date, end_date, is_active, is_single_use'
                },
                (payload) => {
                    console.log('Discount change detected:', payload);

                    if (payload.eventType === 'INSERT') {
                        // Agregar nuevo descuento
                        setDiscounts(prev => [payload.new, ...prev]);
                    } else if (payload.eventType === 'UPDATE') {
                        // Actualizar descuento existente
                        setDiscounts(prev => prev.map(d =>
                            d.id === payload.new.id ? { ...d, ...payload.new } : d
                        ));
                    } else if (payload.eventType === 'DELETE') {
                        // Eliminar de la lista
                        setDiscounts(prev => prev.filter(d => d.id !== payload.old.id));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // ✅ OPTIMIZACIÓN: Validación memoizada
    const validateDiscount = useCallback(() => {
        // Validar código (solo letras, números, guiones)
        if (!newDiscount.code || !/^[A-Z0-9-]+$/.test(newDiscount.code)) {
            showAlert("El código es obligatorio y solo puede contener letras mayúsculas, números y guiones.");
            return false;
        }

        // Validar valor
        const value = parseFloat(newDiscount.value);
        if (!newDiscount.value || isNaN(value) || value <= 0 || value > 100) {
            showAlert("El valor debe ser un número entre 1 y 100.");
            return false;
        }

        // Validar target para tipos específicos
        if (newDiscount.type !== "global" && !newDiscount.target_id) {
            showAlert("Debe seleccionar un producto o categoría para este tipo de descuento.");
            return false;
        }

        // Validar fechas
        if (newDiscount.start_date && newDiscount.end_date) {
            if (newDiscount.end_date < newDiscount.start_date) {
                showAlert("La fecha final no puede ser anterior a la inicial.");
                return false;
            }
        }

        // Validar código único
        const codeExists = discounts.some(d =>
            d.code.toLowerCase() === newDiscount.code.toLowerCase()
        );
        if (codeExists) {
            showAlert("Ya existe un descuento con este código.");
            return false;
        }

        return true;
    }, [newDiscount, discounts, showAlert]);

    // Handler para añadir descuento
    const addDiscount = useCallback(async () => {
        if (!canEdit) return;
        if (!validateDiscount()) return;

        try {
            const dataToInsert = {
                code: newDiscount.code.toUpperCase().trim(),
                type: newDiscount.type,
                value: parseFloat(newDiscount.value),
                target_id: newDiscount.target_id || null,
                start_date: newDiscount.start_date || null,
                end_date: newDiscount.end_date || null,
                is_active: newDiscount.is_active,
                is_single_use: newDiscount.is_single_use
            };

            const { error } = await supabase
                .from("discounts")
                .insert([dataToInsert]);

            if (error) throw error;

            showAlert("¡Descuento creado con éxito!", 'success');

            // Reset formulario
            setNewDiscount({
                code: "",
                type: "global",
                value: "",
                target_id: null,
                start_date: "",
                end_date: "",
                is_active: true,
                is_single_use: false
            });

        } catch (error) {
            console.error('Add error:', error);
            showAlert(`Error al crear el descuento: ${error.message}`);
        }
    }, [canEdit, validateDiscount, newDiscount, showAlert]);

    // Handler para toggle de estado
    const toggleActive = useCallback(async (id, isActive) => {
        if (!canEdit) return;

        try {
            const { error } = await supabase
                .from("discounts")
                .update({ is_active: !isActive })
                .eq("id", id);

            if (error) throw error;

            showAlert("Estado del descuento actualizado.", 'success');

            // Actualización optimista
            setDiscounts(prev => prev.map(d =>
                d.id === id ? { ...d, is_active: !isActive } : d
            ));

        } catch (error) {
            console.error('Toggle error:', error);
            showAlert(`Error al actualizar: ${error.message}`);
        }
    }, [canEdit, showAlert]);

    // ✅ OPTIMIZACIÓN: Función getTargetName memoizada
    const getTargetName = useCallback((discount) => {
        if (discount.type === "global") return "Toda la tienda";
        if (discount.type === "category") {
            const category = categories.find(c => c.id === discount.target_id);
            return category ? category.name : "Categoría no encontrada";
        }
        if (discount.type === "product") {
            const product = products.find(p => p.id === discount.target_id);
            return product ? product.name : "Producto no encontrado";
        }
        return "N/A";
    }, [categories, products]);

    // ✅ OPTIMIZACIÓN: Filtrado de opciones según tipo
    const targetOptions = useMemo(() => {
        if (newDiscount.type === "category") {
            return categories;
        } else if (newDiscount.type === "product") {
            return products;
        }
        return [];
    }, [newDiscount.type, categories, products]);

    // ✅ Estadísticas memoizadas
    const stats = useMemo(() => {
        const active = discounts.filter(d => d.is_active).length;
        const singleUse = discounts.filter(d => d.is_single_use).length;
        const global = discounts.filter(d => d.type === 'global').length;

        return {
            total: discounts.length,
            active,
            inactive: discounts.length - active,
            singleUse,
            global
        };
    }, [discounts]);

    // Handler para cambios de formulario
    const handleFormChange = useCallback((field, value) => {
        setNewDiscount(prev => {
            const updated = { ...prev, [field]: value };

            // Limpiar target_id si el tipo cambia a global
            if (field === 'type' && value === 'global') {
                updated.target_id = null;
            }

            return updated;
        });
    }, []);

    if (loading) {
        return <LoadingSpinner />;
    }

    return (
        <div className={styles.container}>
            {/* Header con estadísticas */}
            <div className={styles.header}>
                <div>
                    <h1>Gestión de Descuentos</h1>
                    <p className={styles.subtitle}>
                        {stats.total} descuentos • {stats.active} activos • {stats.singleUse} uso único • {stats.global} globales
                    </p>
                </div>
            </div>

            {/* Formulario de creación */}
            {canEdit && (
                <div className={styles.formCard}>
                    <h2>Crear Nuevo Descuento</h2>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label htmlFor="code">Código *</label>
                            <input
                                id="code"
                                type="text"
                                placeholder="VERANO2025"
                                value={newDiscount.code}
                                onChange={(e) => handleFormChange('code', e.target.value.toUpperCase())}
                                maxLength={20}
                                required
                            />
                            <small>Solo letras mayúsculas, números y guiones</small>
                        </div>

                        <div className={styles.formGroup}>
                            <label htmlFor="value">Descuento (%) *</label>
                            <input
                                id="value"
                                type="number"
                                placeholder="10"
                                min="1"
                                max="100"
                                value={newDiscount.value}
                                onChange={(e) => handleFormChange('value', e.target.value)}
                                required
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label htmlFor="type">Tipo *</label>
                            <select
                                id="type"
                                value={newDiscount.type}
                                onChange={(e) => handleFormChange('type', e.target.value)}
                            >
                                <option value="global">Global (Toda la tienda)</option>
                                <option value="category">Por Categoría</option>
                                <option value="product">Por Producto</option>
                            </select>
                        </div>

                        {newDiscount.type !== "global" && (
                            <div className={styles.formGroup}>
                                <label htmlFor="target">
                                    {newDiscount.type === "category" ? "Categoría *" : "Producto *"}
                                </label>
                                <select
                                    id="target"
                                    value={newDiscount.target_id || ""}
                                    onChange={(e) => handleFormChange('target_id', e.target.value)}
                                    required
                                >
                                    <option value="">Seleccionar...</option>
                                    {targetOptions.map(option => (
                                        <option key={option.id} value={option.id}>
                                            {option.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className={styles.formGroup}>
                            <label htmlFor="start_date">Fecha Inicio</label>
                            <input
                                id="start_date"
                                type="date"
                                value={newDiscount.start_date}
                                onChange={(e) => handleFormChange('start_date', e.target.value)}
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label htmlFor="end_date">Fecha Fin</label>
                            <input
                                id="end_date"
                                type="date"
                                value={newDiscount.end_date}
                                onChange={(e) => handleFormChange('end_date', e.target.value)}
                                min={newDiscount.start_date || undefined}
                            />
                        </div>

                        <div className={styles.checkboxesRow}>
                            <div className={styles.checkboxGroup}>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={newDiscount.is_single_use}
                                        onChange={(e) => handleFormChange('is_single_use', e.target.checked)}
                                    />
                                    <span>Uso único</span> {/* ✅ Texto más corto */}
                                </label>
                            </div>

                            <div className={styles.checkboxGroup}>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={newDiscount.is_active}
                                        onChange={(e) => handleFormChange('is_active', e.target.checked)}
                                    />
                                    <span>Activo al crear</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={addDiscount}
                        className={styles.submitButton}
                        disabled={!newDiscount.code || !newDiscount.value}
                    >
                        ➕ Crear Descuento
                    </button>
                </div>
            )}

            {/* Tabla de descuentos */}
            <div className={styles.tableCard}>
                <h2>Descuentos Existentes</h2>
                <div className={styles.tableWrapper}>
                    <table className={styles.discountsTable}>
                        <thead>
                            <tr>
                                <th>Código</th>
                                <th>Valor</th>
                                <th>Tipo</th>
                                <th>Objetivo</th>
                                <th>Fechas de validez</th>
                                <th>Uso</th>
                                <th>Estado</th>
                                {canEdit && <th>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {discounts.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={canEdit ? 8 : 7}
                                        className={styles.emptyMessage}
                                    >
                                        No hay descuentos creados. ¡Crea el primero!
                                    </td>
                                </tr>
                            ) : (
                                discounts.map(discount => (
                                    <DiscountTableRow
                                        key={discount.id}
                                        discount={discount}
                                        canEdit={canEdit}
                                        onToggle={toggleActive}
                                        getTargetName={getTargetName}
                                    />
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
