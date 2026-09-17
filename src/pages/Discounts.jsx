/* src/pages/Discounts.jsx (Módulo Modernizado de Descuentos e Impacto Financiero) */

import React, { useEffect, useState, useCallback, useMemo, memo } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import ConfirmModal from "../components/ConfirmModal";
import EditDiscountModal from "../components/EditDiscountModal";
import DiscountImpactSimulator from "../components/DiscountImpactSimulator";
import { useAlert } from "../context/AlertContext";
import styles from "./Discounts.module.css";
import { useAdminAuth } from '../context/AdminAuthContext';

import { useCategoriesCache } from '../hooks/useCategoriesCache';
import { useAdminProductsBasic } from '../hooks/useAdminProductsBasic';
import { useCustomersBasicCache } from '../hooks/useCustomersBasicCache';
import { subscribeToTableChanges } from '../lib/sharedAdminRealtime';
import { useAdminCache } from '../hooks/useAdminCache';
import { useCacheAdmin } from '../context/CacheAdminContext';
import { broadcastStoreChange } from '../lib/broadcastRealtime';
import {
    Plus,
    Power,
    Pencil,
    Trash2,
    Search,
    User,
    Check,
    Tag,
    Gift,
    DollarSign,
    Percent,
    Sparkles,
    Calendar
} from 'lucide-react';

// Fetcher optimizado para descuentos con datos enriquecidos
const fetchDiscounts = async () => {
    return await supabase
        .from("discounts_with_targets")
        .select(`
            id,
            code,
            type,
            value,
            discount_mode,
            target_id,
            start_date,
            end_date,
            is_active,
            is_single_use,
            requires_referred_status,
            specific_customer_id,
            created_at,
            product_name,
            category_name,
            customer_name,
            customer_phone
        `)
        .order("created_at", { ascending: false });
};

// ==================== HELPER DE VIGENCIA ====================
const getValidityStatus = (discount) => {
    if (!discount.is_active) {
        return { label: 'Inactivo', className: styles.statusInactive };
    }
    const today = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .split('T')[0];

    if (discount.start_date && discount.start_date > today) {
        return { label: 'Programado', className: styles.statusScheduled };
    }
    if (discount.end_date && discount.end_date < today) {
        return { label: 'Expirado', className: styles.statusExpired };
    }
    return { label: 'Vigente', className: styles.statusActive };
};

// ==================== FILA MEMOIZADA DE TABLA ====================
const DiscountTableRow = memo(({
    discount,
    canEdit,
    onToggle,
    onEdit,
    onDelete,
    getTargetName
}) => {
    const isFixed = discount.discount_mode === 'fixed';
    const validity = getValidityStatus(discount);
    const isReferralCode = discount.requires_referred_status || (discount.code && discount.code.startsWith('EA-'));

    return (
        <tr>
            <td className={styles.codeCell}>
                <div className={styles.codeWrapper}>
                    <code>{discount.code}</code>
                    {isReferralCode && (
                        <span className={styles.referralTag} title="Código del sistema de referidos">
                            <Gift size={12} /> Referido
                        </span>
                    )}
                </div>
            </td>

            <td className={styles.valueCell}>
                <strong className={styles.valueNumber}>
                    {isFixed ? `$${parseFloat(discount.value).toFixed(2)}` : `${discount.value}%`}
                </strong>
                <span className={styles.modeIndicator}>
                    {isFixed ? 'Monto Fijo' : 'Porcentaje'}
                </span>
            </td>

            <td>
                <span className={`${styles.typeBadge} ${styles[discount.type] || ''}`}>
                    {discount.type === 'global' ? 'Global' : discount.type === 'category' ? 'Categoría' : 'Producto'}
                </span>
            </td>

            <td>{getTargetName(discount)}</td>

            <td className={styles.audienceCell}>
                {discount.specific_customer_id ? (
                    <div className={styles.customerAudience}>
                        <User size={13} />
                        <span>{discount.customer_name || 'Cliente asignado'}</span>
                    </div>
                ) : isReferralCode ? (
                    <span className={styles.referralAudience}>
                        <Gift size={13} /> Invitados / Referidos
                    </span>
                ) : (
                    <span className={styles.publicAudience}>
                        🌐 Toda la tienda
                    </span>
                )}
            </td>

            <td>
                <div className={styles.dateCell}>
                    <span>{discount.start_date || "Siempre"} al {discount.end_date || "Siempre"}</span>
                    <span className={`${styles.validityBadge} ${validity.className}`}>
                        {validity.label}
                    </span>
                </div>
            </td>

            <td>
                <span className={styles.usageBadge}>
                    {discount.is_single_use ? 'Único' : 'Múltiple'}
                </span>
            </td>

            <td>
                <span className={`${styles.statusBadge} ${discount.is_active ? styles.active : styles.inactive}`}>
                    {discount.is_active ? "Activo" : "Pausado"}
                </span>
            </td>

            {canEdit && (
                <td className={styles.actions}>
                    <button
                        onClick={() => onToggle(discount.id, discount.is_active)}
                        className={styles.toggleButton}
                        title={discount.is_active ? "Desactivar" : "Activar"}
                        aria-label={discount.is_active ? "Desactivar" : "Activar"}
                    >
                        <Power size={14} />
                    </button>
                    <button
                        onClick={() => onEdit(discount)}
                        className={styles.editButton}
                        title="Editar Descuento"
                        aria-label="Editar Descuento"
                    >
                        <Pencil size={14} />
                    </button>
                    <button
                        onClick={() => onDelete(discount)}
                        className={styles.deleteButton}
                        title="Eliminar Descuento"
                        aria-label="Eliminar Descuento"
                    >
                        <Trash2 size={14} />
                    </button>
                </td>
            )}
        </tr>
    );
});
DiscountTableRow.displayName = 'DiscountTableRow';

// ==================== COMPONENTE PRINCIPAL ====================
export default function Discounts() {
    const { showAlert } = useAlert();
    const { hasPermission } = useAdminAuth();
    const { DEFAULT_TTL, invalidate } = useCacheAdmin();

    // Categorías del hook
    const { data: categoriesData, isLoading: loadingCategories } = useCategoriesCache();
    const categories = useMemo(() => categoriesData || [], [categoriesData]);

    // Productos del hook
    const { data: productsData, isLoading: loadingProducts } = useAdminProductsBasic();
    const products = useMemo(() => productsData || [], [productsData]);

    // Clientes del hook
    const { data: customersData } = useCustomersBasicCache();
    const customers = useMemo(() => customersData || [], [customersData]);

    // Descuentos cacheados
    const {
        data: discountsData,
        isLoading: loadingDiscounts,
    } = useAdminCache('discounts:all', fetchDiscounts, {
        ttl: DEFAULT_TTL.MEDIUM,
        staleWhileRevalidate: true
    });

    const [localDiscounts, setLocalDiscounts] = useState(null);
    const discounts = useMemo(() => localDiscounts || discountsData || [], [localDiscounts, discountsData]);

    useEffect(() => {
        if (discountsData) {
            setLocalDiscounts(discountsData);
        }
    }, [discountsData]);

    // Estados del Formulario de Creación
    const [newDiscount, setNewDiscount] = useState({
        code: "",
        type: "global",
        discount_mode: "percentage",
        value: "",
        target_id: null,
        start_date: "",
        end_date: "",
        is_active: true,
        is_single_use: false,
        specific_customer_id: null
    });

    const [audienceType, setAudienceType] = useState('everyone');
    const [customerSearch, setCustomerSearch] = useState('');

    // Estados de UI (Pestañas, Búsqueda, Filtros, Modales)
    const [activeTab, setActiveTab] = useState('store'); // 'store' | 'referrals' | 'all'
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [modeFilter, setModeFilter] = useState('all');

    const [editingDiscount, setEditingDiscount] = useState(null);
    const [deletingDiscount, setDeletingDiscount] = useState(null);

    const canEdit = hasPermission('descuentos.edit');

    // Realtime compartido
    useEffect(() => {
        const unsubscribe = subscribeToTableChanges('discounts', (payload) => {
            console.log('[Discounts] Cambio en descuentos detectado (Shared Realtime):', payload);
            invalidate('discounts:all');

            if (payload.eventType === 'INSERT') {
                setLocalDiscounts(prev => prev ? [payload.new, ...prev] : [payload.new]);
            } else if (payload.eventType === 'UPDATE') {
                setLocalDiscounts(prev => prev ? prev.map(d =>
                    d.id === payload.new.id ? { ...d, ...payload.new } : d
                ) : null);
            } else if (payload.eventType === 'DELETE') {
                setLocalDiscounts(prev => prev ? prev.filter(d => d.id !== payload.old.id) : null);
            }
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [invalidate]);

    // Cliente seleccionado en creación
    const selectedCustomer = useMemo(() => {
        if (!newDiscount.specific_customer_id) return null;
        return customers.find(c => c.id === newDiscount.specific_customer_id);
    }, [newDiscount.specific_customer_id, customers]);

    const filteredCustomers = useMemo(() => {
        if (!customerSearch.trim()) return [];
        const lower = customerSearch.toLowerCase();
        return customers
            .filter(c =>
                (c.name && c.name.toLowerCase().includes(lower)) ||
                (c.phone && c.phone.includes(customerSearch))
            )
            .slice(0, 6);
    }, [customerSearch, customers]);

    // Validador de creación
    const validateDiscount = useCallback(() => {
        if (!newDiscount.code || !/^[A-Z0-9-]+$/.test(newDiscount.code)) {
            showAlert("El código es obligatorio y solo puede contener letras mayúsculas, números y guiones.");
            return false;
        }
        const val = parseFloat(newDiscount.value);
        if (!newDiscount.value || isNaN(val) || val <= 0) {
            showAlert("El valor del descuento debe ser un número mayor a 0.");
            return false;
        }
        if (newDiscount.discount_mode === 'percentage' && val > 100) {
            showAlert("El porcentaje de descuento no puede superar el 100%.");
            return false;
        }
        if (newDiscount.type !== "global" && !newDiscount.target_id) {
            showAlert("Debe seleccionar un producto o categoría para este tipo de descuento.");
            return false;
        }
        if (newDiscount.start_date && newDiscount.end_date) {
            if (newDiscount.end_date < newDiscount.start_date) {
                showAlert("La fecha final no puede ser anterior a la inicial.");
                return false;
            }
        }
        const codeExists = discounts.some(d =>
            d.code.toLowerCase() === newDiscount.code.toLowerCase()
        );
        if (codeExists) {
            showAlert("Ya existe un descuento con este código.");
            return false;
        }
        return true;
    }, [newDiscount, discounts, showAlert]);

    // Crear Descuento
    const addDiscount = useCallback(async () => {
        if (!canEdit) return;
        if (!validateDiscount()) return;
        try {
            const dataToInsert = {
                code: newDiscount.code.toUpperCase().trim(),
                type: newDiscount.type,
                discount_mode: newDiscount.discount_mode,
                value: parseFloat(newDiscount.value),
                target_id: newDiscount.target_id || null,
                start_date: newDiscount.start_date || null,
                end_date: newDiscount.end_date || null,
                is_active: newDiscount.is_active,
                is_single_use: newDiscount.is_single_use,
                specific_customer_id: newDiscount.specific_customer_id || null
            };

            const { error } = await supabase.from("discounts").insert([dataToInsert]);
            if (error) throw error;

            showAlert("¡Descuento creado con éxito!", 'success');
            invalidate('discounts:all');
            broadcastStoreChange('discounts_updated', { action: 'add' });

            setNewDiscount({
                code: "",
                type: "global",
                discount_mode: "percentage",
                value: "",
                target_id: null,
                start_date: "",
                end_date: "",
                is_active: true,
                is_single_use: false,
                specific_customer_id: null
            });
            setAudienceType('everyone');
            setCustomerSearch('');
        } catch (error) {
            console.error('Add error:', error);
            showAlert(`Error al crear el descuento: ${error.message}`);
        }
    }, [canEdit, validateDiscount, newDiscount, showAlert, invalidate]);

    // Alternar Estado Activo / Inactivo
    const toggleActive = useCallback(async (id, isActive) => {
        if (!canEdit) return;
        try {
            const { error } = await supabase.from("discounts").update({ is_active: !isActive }).eq("id", id);
            if (error) throw error;
            showAlert("Estado del descuento actualizado.", 'success');
            setLocalDiscounts(prev => (prev || discounts).map(d => d.id === id ? { ...d, is_active: !isActive } : d));
            invalidate('discounts:all');
            broadcastStoreChange('discounts_updated', { action: 'toggle', id });
        } catch (error) {
            console.error('Toggle error:', error);
            showAlert(`Error al actualizar: ${error.message}`);
        }
    }, [canEdit, showAlert, discounts, invalidate]);

    // Guardar Edición
    const handleSaveEdit = useCallback(async (updatedData) => {
        if (!canEdit) return;
        const { error } = await supabase
            .from("discounts")
            .update({
                code: updatedData.code,
                type: updatedData.type,
                discount_mode: updatedData.discount_mode,
                value: updatedData.value,
                target_id: updatedData.target_id || null,
                start_date: updatedData.start_date || null,
                end_date: updatedData.end_date || null,
                is_active: updatedData.is_active,
                is_single_use: updatedData.is_single_use,
                specific_customer_id: updatedData.specific_customer_id || null
            })
            .eq("id", updatedData.id);

        if (error) throw error;

        showAlert("Descuento actualizado con éxito.", 'success');
        invalidate('discounts:all');
        broadcastStoreChange('discounts_updated', { action: 'edit', id: updatedData.id });
    }, [canEdit, showAlert, invalidate]);

    // Eliminar Descuento
    const handleDeleteDiscount = useCallback(async () => {
        if (!canEdit || !deletingDiscount) return;
        try {
            const { error } = await supabase
                .from("discounts")
                .delete()
                .eq("id", deletingDiscount.id);

            if (error) throw error;

            showAlert("Descuento eliminado correctamente.", 'success');
            setLocalDiscounts(prev => prev ? prev.filter(d => d.id !== deletingDiscount.id) : null);
            invalidate('discounts:all');
            broadcastStoreChange('discounts_updated', { action: 'delete', id: deletingDiscount.id });
            setDeletingDiscount(null);
        } catch (error) {
            console.error('Delete error:', error);
            showAlert(`Error al eliminar: ${error.message}`);
        }
    }, [canEdit, deletingDiscount, showAlert, invalidate]);

    const getTargetName = useCallback((discount) => {
        if (discount.type === "global") return "Toda la tienda";
        if (discount.type === "category") {
            if (discount.category_name) return discount.category_name;
            const category = categories.find(c => c.id === discount.target_id);
            return category ? category.name : "Categoría no encontrada";
        }
        if (discount.type === "product") {
            if (discount.product_name) return discount.product_name;
            const product = products.find(p => p.id === discount.target_id);
            return product ? product.name : "Producto no encontrado";
        }
        return "N/A";
    }, [categories, products]);

    const targetOptions = useMemo(() => {
        if (newDiscount.type === "category") {
            return categories;
        } else if (newDiscount.type === "product") {
            return products;
        }
        return [];
    }, [newDiscount.type, categories, products]);

    // Métricas del Header
    const stats = useMemo(() => {
        const active = discounts.filter(d => d.is_active).length;
        const storePromos = discounts.filter(d => !d.requires_referred_status && !(d.code && d.code.startsWith('EA-'))).length;
        const referralCodes = discounts.filter(d => d.requires_referred_status || (d.code && d.code.startsWith('EA-'))).length;
        const customerSpecific = discounts.filter(d => d.specific_customer_id).length;
        return {
            total: discounts.length,
            active,
            storePromos,
            referralCodes,
            customerSpecific
        };
    }, [discounts]);

    const handleFormChange = useCallback((field, value) => {
        setNewDiscount(prev => {
            const updated = { ...prev, [field]: value };
            if (field === 'type' && value === 'global') {
                updated.target_id = null;
            }
            return updated;
        });
    }, []);

    // Filtrado de Descuentos para la Tabla
    const filteredDiscounts = useMemo(() => {
        const today = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000)
            .toISOString()
            .split('T')[0];

        return discounts.filter(d => {
            const isRef = d.requires_referred_status || (d.code && d.code.startsWith('EA-'));

            // 1. Filtro por Pestaña
            if (activeTab === 'store' && isRef) return false;
            if (activeTab === 'referrals' && !isRef) return false;

            // 2. Filtro por Búsqueda
            if (searchTerm.trim()) {
                const search = searchTerm.toLowerCase();
                const matchCode = d.code && d.code.toLowerCase().includes(search);
                const matchCust = d.customer_name && d.customer_name.toLowerCase().includes(search);
                const matchPhone = d.customer_phone && d.customer_phone.includes(search);
                if (!matchCode && !matchCust && !matchPhone) return false;
            }

            // 3. Filtro por Tipo de Alcance
            if (typeFilter !== 'all' && d.type !== typeFilter) return false;

            // 4. Filtro por Modo de Valor
            if (modeFilter !== 'all' && (d.discount_mode || 'percentage') !== modeFilter) return false;

            // 5. Filtro por Estado
            if (statusFilter === 'active' && !d.is_active) return false;
            if (statusFilter === 'inactive' && d.is_active) return false;
            if (statusFilter === 'expired' && (!d.end_date || d.end_date >= today)) return false;
            if (statusFilter === 'scheduled' && (!d.start_date || d.start_date <= today)) return false;

            return true;
        });
    }, [discounts, activeTab, searchTerm, typeFilter, modeFilter, statusFilter]);

    if ((loadingDiscounts && discounts.length === 0) || (loadingCategories && categories.length === 0) || (loadingProducts && products.length === 0)) {
        return <LoadingSpinner />;
    }

    return (
        <div className={styles.container}>
            {/* Header con estadísticas globales */}
            <div className={styles.header}>
                <div>
                    <h1>Gestión Avanzada de Descuentos</h1>
                    <p className={styles.subtitle}>
                        {stats.total} total • {stats.active} activos • {stats.storePromos} promociones de tienda • {stats.referralCodes} de referidos • {stats.customerSpecific} asignados a clientes
                    </p>
                </div>
            </div>

            {/* Formulario de creación con simulador integrado */}
            {canEdit && (
                <div className={styles.formCard}>
                    <div className={styles.formCardHeader}>
                        <div>
                            <h2><Sparkles size={20} className={styles.titleIcon} /> Crear Nuevo Descuento</h2>
                            <p className={styles.formCardSubtitle}>
                                Configura cupones por porcentaje, monto fijo o asignados a clientes específicos con simulación financiera en vivo.
                            </p>
                        </div>
                    </div>

                    <div className={styles.formGrid}>
                        {/* Código */}
                        <div className={styles.formGroup}>
                            <label htmlFor="code">Código del Descuento *</label>
                            <input
                                id="code"
                                type="text"
                                placeholder="PROMOVERANO"
                                value={newDiscount.code}
                                onChange={(e) => handleFormChange('code', e.target.value.toUpperCase())}
                                maxLength={25}
                                required
                            />
                            <small>Letras mayúsculas, números y guiones</small>
                        </div>

                        {/* Modo de Descuento: Porcentaje vs Monto Fijo */}
                        <div className={styles.formGroup}>
                            <label>Tipo de Descuento (Modo) *</label>
                            <div className={styles.modeToggleGroup}>
                                <button
                                    type="button"
                                    className={`${styles.modeBtn} ${newDiscount.discount_mode === 'percentage' ? styles.activeMode : ''}`}
                                    onClick={() => handleFormChange('discount_mode', 'percentage')}
                                >
                                    <Percent size={15} /> Porcentaje (%)
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.modeBtn} ${newDiscount.discount_mode === 'fixed' ? styles.activeMode : ''}`}
                                    onClick={() => handleFormChange('discount_mode', 'fixed')}
                                >
                                    <DollarSign size={15} /> Monto Fijo ($)
                                </button>
                            </div>
                            <small>
                                {newDiscount.discount_mode === 'fixed'
                                    ? 'Aplica un descuento en dinero directo (ej. $30.00)'
                                    : 'Aplica un porcentaje sobre el valor aplicable (ej. 20%)'}
                            </small>
                        </div>

                        {/* Valor */}
                        <div className={styles.formGroup}>
                            <label htmlFor="value">
                                {newDiscount.discount_mode === 'fixed' ? 'Monto a Descontar ($) *' : 'Porcentaje (%) *'}
                            </label>
                            <input
                                id="value"
                                type="number"
                                placeholder={newDiscount.discount_mode === 'fixed' ? "30.00" : "15"}
                                min="0.01"
                                step={newDiscount.discount_mode === 'fixed' ? "0.5" : "1"}
                                max={newDiscount.discount_mode === 'percentage' ? "100" : undefined}
                                value={newDiscount.value}
                                onChange={(e) => handleFormChange('value', e.target.value)}
                                required
                            />
                            <small>
                                {newDiscount.discount_mode === 'fixed'
                                    ? 'Monto en pesos/dólares a deducir'
                                    : 'Porcentaje de descuento entre 1 y 100'}
                            </small>
                        </div>

                        {/* Alcance / Tipo */}
                        <div className={styles.formGroup}>
                            <label htmlFor="type">Alcance / Objetivo *</label>
                            <select
                                id="type"
                                value={newDiscount.type}
                                onChange={(e) => handleFormChange('type', e.target.value)}
                            >
                                <option value="global">Global (Toda la tienda)</option>
                                <option value="category">Por Categoría</option>
                                <option value="product">Por Producto Específico</option>
                            </select>
                            <small>Dónde surtirá efecto el descuento</small>
                        </div>

                        {/* Selector de Producto o Categoría */}
                        {newDiscount.type !== "global" && (
                            <div className={styles.formGroup}>
                                <label htmlFor="target">
                                    {newDiscount.type === "category" ? "Seleccionar Categoría *" : "Seleccionar Producto *"}
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
                                            {option.name} {option.price ? `($${parseFloat(option.price).toFixed(2)})` : ''}
                                        </option>
                                    ))}
                                </select>
                                <small>
                                    {newDiscount.type === "category"
                                        ? 'El descuento aplicará a todos los productos de esta categoría'
                                        : 'El descuento aplicará únicamente a este producto'}
                                </small>
                            </div>
                        )}

                        {/* Fechas */}
                        <div className={styles.formGroup}>
                            <label htmlFor="start_date">Fecha Inicio</label>
                            <input
                                id="start_date"
                                type="date"
                                value={newDiscount.start_date}
                                onChange={(e) => handleFormChange('start_date', e.target.value)}
                            />
                            <small>Opcional: desde cuándo es válido</small>
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
                            <small>Opcional: hasta cuándo es válido</small>
                        </div>

                        {/* Audiencia / Asignación de Cliente */}
                        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                            <label>Audiencia del Descuento</label>
                            <div className={styles.audienceSelection}>
                                <label className={styles.radioLabel}>
                                    <input
                                        type="radio"
                                        name="audience"
                                        checked={audienceType === 'everyone'}
                                        onChange={() => {
                                            setAudienceType('everyone');
                                            handleFormChange('specific_customer_id', null);
                                        }}
                                    />
                                    <span>🌐 Público (Disponible para todos los clientes)</span>
                                </label>

                                <label className={styles.radioLabel}>
                                    <input
                                        type="radio"
                                        name="audience"
                                        checked={audienceType === 'specific'}
                                        onChange={() => setAudienceType('specific')}
                                    />
                                    <span>👤 Asignar a un Cliente Específico</span>
                                </label>
                            </div>

                            {audienceType === 'specific' && (
                                <div className={styles.customerPicker}>
                                    {selectedCustomer ? (
                                        <div className={styles.selectedCustomerCard}>
                                            <User size={18} className={styles.customerIcon} />
                                            <div className={styles.customerInfo}>
                                                <strong>{selectedCustomer.name}</strong>
                                                <span>Tel: {selectedCustomer.phone || 'Sin teléfono'} • Ref: {selectedCustomer.referral_code || 'N/A'}</span>
                                            </div>
                                            <button
                                                type="button"
                                                className={styles.removeCustomerBtn}
                                                onClick={() => handleFormChange('specific_customer_id', null)}
                                            >
                                                Cambiar cliente
                                            </button>
                                        </div>
                                    ) : (
                                        <div className={styles.customerSearchWrapper}>
                                            <div className={styles.searchBar}>
                                                <Search size={16} />
                                                <input
                                                    type="text"
                                                    placeholder="Buscar cliente por nombre o teléfono..."
                                                    value={customerSearch}
                                                    onChange={(e) => setCustomerSearch(e.target.value)}
                                                />
                                            </div>
                                            {filteredCustomers.length > 0 && (
                                                <div className={styles.customerResultsList}>
                                                    {filteredCustomers.map(cust => (
                                                        <div
                                                            key={cust.id}
                                                            className={styles.customerResultItem}
                                                            onClick={() => {
                                                                handleFormChange('specific_customer_id', cust.id);
                                                                setCustomerSearch('');
                                                            }}
                                                        >
                                                            <span><strong>{cust.name}</strong> ({cust.phone || 'S/T'})</span>
                                                            <Check size={14} />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Checkboxes de Opciones */}
                        <div className={styles.checkboxesRow}>
                            <div className={styles.checkboxGroup}>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={newDiscount.is_single_use}
                                        onChange={(e) => handleFormChange('is_single_use', e.target.checked)}
                                    />
                                    <span>Uso único por cliente</span>
                                </label>
                            </div>

                            <div className={styles.checkboxGroup}>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={newDiscount.is_active}
                                        onChange={(e) => handleFormChange('is_active', e.target.checked)}
                                    />
                                    <span>Activar inmediatamente al crear</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* SIMULADOR DE IMPACTO FINANCIERO EN TIEMPO REAL */}
                    <DiscountImpactSimulator
                        discount={newDiscount}
                        products={products}
                        categories={categories}
                    />

                    <div className={styles.formFooter}>
                        <button
                            onClick={addDiscount}
                            className={styles.submitButton}
                            disabled={!newDiscount.code || !newDiscount.value}
                        >
                            <Plus size={18} aria-hidden="true" /> Crear Descuento
                        </button>
                    </div>
                </div>
            )}

            {/* TABLA CON PESTAÑAS Y FILTROS */}
            <div className={styles.tableCard}>
                {/* PESTAÑAS PARA SEPARAR REFERIDOS */}
                <div className={styles.tabsHeader}>
                    <button
                        type="button"
                        className={`${styles.tabBtn} ${activeTab === 'store' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('store')}
                    >
                        <Tag size={16} /> Cupones de Tienda ({stats.storePromos})
                    </button>
                    <button
                        type="button"
                        className={`${styles.tabBtn} ${activeTab === 'referrals' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('referrals')}
                    >
                        <Gift size={16} /> Recompensas de Referidos ({stats.referralCodes})
                    </button>
                    <button
                        type="button"
                        className={`${styles.tabBtn} ${activeTab === 'all' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('all')}
                    >
                        Todos los Descuentos ({stats.total})
                    </button>
                </div>

                {/* BARRA DE BÚSQUEDA Y FILTROS */}
                <div className={styles.filtersBar}>
                    <div className={styles.searchBox}>
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Buscar por código o cliente..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className={styles.filterControls}>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className={styles.filterSelect}
                        >
                            <option value="all">Estado: Todos</option>
                            <option value="active">Activos</option>
                            <option value="inactive">Pausados</option>
                            <option value="expired">Expirados</option>
                            <option value="scheduled">Programados</option>
                        </select>

                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            className={styles.filterSelect}
                        >
                            <option value="all">Alcance: Todos</option>
                            <option value="global">Global</option>
                            <option value="category">Categoría</option>
                            <option value="product">Producto</option>
                        </select>

                        <select
                            value={modeFilter}
                            onChange={(e) => setModeFilter(e.target.value)}
                            className={styles.filterSelect}
                        >
                            <option value="all">Tipo: % y $</option>
                            <option value="percentage">Solo Porcentaje (%)</option>
                            <option value="fixed">Solo Monto Fijo ($)</option>
                        </select>
                    </div>
                </div>

                {/* TABLA DE RESULTADOS */}
                <div className={styles.tableWrapper}>
                    <table className={styles.discountsTable}>
                        <thead>
                            <tr>
                                <th>Código</th>
                                <th>Valor</th>
                                <th>Alcance</th>
                                <th>Objetivo</th>
                                <th>Audiencia</th>
                                <th>Vigencia</th>
                                <th>Uso</th>
                                <th>Estado</th>
                                {canEdit && <th>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredDiscounts.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={canEdit ? 9 : 8}
                                        className={styles.emptyMessage}
                                    >
                                        No se encontraron descuentos con los filtros aplicados.
                                    </td>
                                </tr>
                            ) : (
                                filteredDiscounts.map(discount => (
                                    <DiscountTableRow
                                        key={discount.id}
                                        discount={discount}
                                        canEdit={canEdit}
                                        onToggle={toggleActive}
                                        onEdit={setEditingDiscount}
                                        onDelete={setDeletingDiscount}
                                        getTargetName={getTargetName}
                                    />
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* MODAL PARA EDITAR DESCUENTO */}
            {editingDiscount && (
                <EditDiscountModal
                    isOpen={!!editingDiscount}
                    onClose={() => setEditingDiscount(null)}
                    discount={editingDiscount}
                    onSave={handleSaveEdit}
                    products={products}
                    categories={categories}
                    customers={customers}
                />
            )}

            {/* MODAL DE CONFIRMACIÓN PARA ELIMINAR */}
            {deletingDiscount && (
                <ConfirmModal
                    isOpen={!!deletingDiscount}
                    onClose={() => setDeletingDiscount(null)}
                    onConfirm={handleDeleteDiscount}
                    title="¿Eliminar Descuento?"
                >
                    ¿Estás seguro de que deseas eliminar permanentemente el descuento <strong>{deletingDiscount.code}</strong>? Esta acción no se puede deshacer.
                </ConfirmModal>
            )}
        </div>
    );
}
