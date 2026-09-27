import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import styles from './EditOrderModal.module.css';
import LoadingSpinner from './LoadingSpinner';
import { useAlert } from '../context/AlertContext';
import { broadcastOrderUpdate, broadcastStoreChange } from '../lib/broadcastRealtime';
import ImageWithFallback from './ImageWithFallback';
import DeliveryInfoModal from './DeliveryInfoModal';
import { SlidersHorizontal, Check } from 'lucide-react';

const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
);
const ClockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>;
const MapPinIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>;

const getLocalYYYYMMDD = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatDateForInput = (isoString) => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        return getLocalYYYYMMDD(date);
    } catch (e) { return ''; }
};

const formatTimeForInput = (isoString) => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    } catch (e) { return ''; }
};

const getItemsSignature = (items) => {
    if (!items || items.length === 0) return '';
    return items
        .map(i => `${i.product_id}-${i.quantity}-${i.price}-${JSON.stringify(i.selected_modifiers || [])}-${i.item_notes || ''}`)
        .sort()
        .join('|');
};

export default function EditOrderModal({ order, onClose, onOrderUpdated }) {
    const { showAlert } = useAlert();
    const [orderItems, setOrderItems] = useState([]);
    const [allProducts, setAllProducts] = useState([]);
    const [customerAddresses, setCustomerAddresses] = useState([]);
    const [selectedAddressId, setSelectedAddressId] = useState('');
    const [initialAddressId, setInitialAddressId] = useState('');
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activeTab, setActiveTab] = useState('current');
    const [searchTerm, setSearchTerm] = useState('');
    const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
    const [deliveryInfo, setDeliveryInfo] = useState(null);
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');
    const [originalItemsSignature, setOriginalItemsSignature] = useState('');
    const [isDeliveryOpen, setIsDeliveryOpen] = useState(false);

    // Estado para personalizar complementos y notas de un ítem
    const [customizingItem, setCustomizingItem] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const productsPromise = supabase.from('products').select('*').eq('is_active', true);
                const addressesPromise = supabase.from('customer_addresses').select('*').eq('customer_id', order.customer_id);
                const [productsRes, addressesRes] = await Promise.all([productsPromise, addressesPromise]);

                if (productsRes.error) throw productsRes.error;
                if (addressesRes.error) throw addressesRes.error;

                const activeCatalog = (productsRes.data || []).filter(p => {
                    return p.id && p.name && p.price !== null && p.price !== undefined;
                });
                setAllProducts(activeCatalog);

                setCustomerAddresses(addressesRes.data || []);
                const defaultAddress = addressesRes.data.find(a => a.is_default) || addressesRes.data[0];
                const currentAddressId = defaultAddress?.id || '';
                setSelectedAddressId(currentAddressId);
                setInitialAddressId(currentAddressId);

                const initialItems = (order.order_items || []).map((item, index) => {
                    const matched = activeCatalog.find(p => p.id === item.product_id);
                    return {
                        line_id: item.id || `item_${index}_${Date.now()}`,
                        product_id: item.product_id,
                        id: item.product_id,
                        name: item.products?.name || matched?.name || 'Producto Desconocido',
                        base_price: Number(matched?.price) || Number(item.price) || 0,
                        price: Number(item.price) || 0,
                        cost: Number(item.cost) || Number(matched?.cost) || 0,
                        image_url: item.products?.image_url || matched?.image_url || '',
                        quantity: Number(item.quantity) || 1,
                        original_item_id: item.id,
                        selected_modifiers: Array.isArray(item.selected_modifiers) ? item.selected_modifiers : [],
                        item_notes: typeof item.item_notes === 'string' ? item.item_notes : '',
                    };
                });

                setOrderItems(initialItems);
                setOriginalItemsSignature(getItemsSignature(initialItems));
                setScheduleDate(formatDateForInput(order.scheduled_for));
                setScheduleTime(formatTimeForInput(order.scheduled_for));
            } catch (error) {
                console.error("Error fetching data:", error);
                showAlert('Hubo un error al cargar los datos para la edición.');
                onClose();
            } finally {
                setLoading(false);
            }
        };

        if (order) {
            fetchData();
        }
    }, [order, onClose, showAlert]);

    useEffect(() => {
        const newTotal = orderItems.reduce((sum, item) => {
            const price = Number(item.price) || 0;
            const qty = Number(item.quantity) || 1;
            return sum + (price * qty);
        }, 0);
        setTotal(newTotal);
    }, [orderItems]);

    const handleShowDeliveryInfo = () => {
        const selectedAddress = customerAddresses.find(addr => addr.id === selectedAddressId);
        if (selectedAddress && order.customers) {
            setDeliveryInfo({
                customer: order.customers,
                address: selectedAddress
            });
            setIsDeliveryModalOpen(true);
        } else {
            showAlert("No se encontró la dirección o los datos del cliente.");
        }
    };

    const updateQuantity = (lineId, newQuantity) => {
        const numQuantity = parseInt(newQuantity, 10);
        if (isNaN(numQuantity) || numQuantity <= 0) {
            removeItem(lineId);
            return;
        }
        setOrderItems(prevItems => prevItems.map(item =>
            item.line_id === lineId ? { ...item, quantity: numQuantity } : item
        ));
    };

    const removeItem = (lineId) => {
        setOrderItems(prevItems => prevItems.filter(item => item.line_id !== lineId));
    };

    // Abre el configurador de complementos para un ítem existente
    const handleOpenModifierCustomizer = (item) => {
        const catalogProd = allProducts.find(p => p.id === item.product_id) || {
            id: item.product_id,
            name: item.name,
            price: item.base_price || item.price,
            modifiers: [],
        };

        const existingMods = Array.isArray(item.selected_modifiers) ? item.selected_modifiers : [];
        const enrichedMods = existingMods.map(sm => {
            if (sm.ingredient_id && sm.quantity_used) return sm;
            for (const g of (catalogProd?.modifiers || [])) {
                const foundOpt = g.options?.find(o => o.id === sm.option_id || o.name === sm.name);
                if (foundOpt?.ingredient_id) {
                    return {
                        ...sm,
                        ingredient_id: foundOpt.ingredient_id,
                        quantity_used: foundOpt.quantity_used
                    };
                }
            }
            return sm;
        });

        setCustomizingItem({
            isNew: false,
            line_id: item.line_id,
            product_id: item.product_id,
            name: item.name,
            base_price: item.base_price !== undefined ? item.base_price : (catalogProd.price || item.price),
            selected_modifiers: enrichedMods,
            item_notes: item.item_notes || '',
            product: catalogProd,
            quantity: item.quantity,
        });
    };

    // Abre el configurador al seleccionar un producto nuevo desde "+ Añadir"
    const handleSelectProductToAdd = (product) => {
        const hasModifiers = Array.isArray(product.modifiers) && product.modifiers.length > 0;
        if (hasModifiers) {
            setCustomizingItem({
                isNew: true,
                line_id: null,
                product_id: product.id,
                name: product.name,
                base_price: Number(product.price) || 0,
                selected_modifiers: [],
                item_notes: '',
                product: product,
                quantity: 1,
            });
        } else {
            // Producto estándar sin modificadores
            addProductWithoutModifiers(product);
        }
    };

    const addProductWithoutModifiers = (product) => {
        const existingItem = orderItems.find(item =>
            item.product_id === product.id &&
            (!item.selected_modifiers || item.selected_modifiers.length === 0) &&
            !item.item_notes
        );
        if (existingItem) {
            updateQuantity(existingItem.line_id, existingItem.quantity + 1);
            showAlert(`Se aumentó la cantidad de ${product.name}.`, 'success');
        } else {
            const newLineId = `line_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            setOrderItems(prevItems => [...prevItems, {
                line_id: newLineId,
                product_id: product.id,
                id: product.id,
                name: product.name,
                base_price: Number(product.price) || 0,
                price: Number(product.price) || 0,
                cost: Number(product.cost) || 0,
                image_url: product.image_url || '',
                quantity: 1,
                selected_modifiers: [],
                item_notes: null,
            }]);
            showAlert(`${product.name} añadido al pedido.`, 'success');
        }
        if (window.innerWidth < 768) setActiveTab('current');
    };

    // Toggle de modificadores dentro del configurador
    const handleToggleModifierInCustomizer = (group, option) => {
        setCustomizingItem(prev => {
            if (!prev) return null;
            const currentMods = prev.selected_modifiers || [];
            const isSingle = group.max === 1;
            const exists = currentMods.some(m => m.option_id === option.id && m.group_id === group.id);

            let newMods;
            if (isSingle) {
                if (exists) {
                    newMods = group.required ? currentMods : currentMods.filter(m => !(m.group_id === group.id && m.option_id === option.id));
                } else {
                    const withoutGroup = currentMods.filter(m => m.group_id !== group.id);
                    newMods = [
                        ...withoutGroup,
                        {
                            group_id: group.id,
                            group_name: group.name,
                            option_id: option.id,
                            name: option.name,
                            price_delta: Number(option.price_delta) || 0,
                            ingredient_id: option.ingredient_id || null,
                            quantity_used: option.ingredient_id && Number(option.quantity_used) > 0 ? Number(option.quantity_used) : null,
                        }
                    ];
                }
            } else {
                if (exists) {
                    newMods = currentMods.filter(m => !(m.option_id === option.id && m.group_id === group.id));
                } else {
                    const currentCount = currentMods.filter(m => m.group_id === group.id).length;
                    if (group.max && currentCount >= group.max) {
                        showAlert(`Solo puedes seleccionar hasta ${group.max} opción(es) en "${group.name}".`);
                        return prev;
                    }
                    newMods = [
                        ...currentMods,
                        {
                            group_id: group.id,
                            group_name: group.name,
                            option_id: option.id,
                            name: option.name,
                            price_delta: Number(option.price_delta) || 0,
                            ingredient_id: option.ingredient_id || null,
                            quantity_used: option.ingredient_id && Number(option.quantity_used) > 0 ? Number(option.quantity_used) : null,
                        }
                    ];
                }
            }
            return {
                ...prev,
                selected_modifiers: newMods,
            };
        });
    };

    const customizingDeltaSum = useMemo(() => {
        if (!customizingItem?.selected_modifiers) return 0;
        return customizingItem.selected_modifiers.reduce((sum, m) => sum + (Number(m.price_delta) || 0), 0);
    }, [customizingItem?.selected_modifiers]);

    const customizingEffectiveUnitPrice = useMemo(() => {
        if (!customizingItem) return 0;
        const base = Number(customizingItem.base_price || 0);
        return Math.max(0, base + customizingDeltaSum);
    }, [customizingItem, customizingDeltaSum]);

    // Guardar complementos desde el configurador
    const handleSaveCustomizer = () => {
        if (!customizingItem) return;
        const modifierGroups = Array.isArray(customizingItem.product?.modifiers) ? customizingItem.product.modifiers : [];

        // Validar grupos requeridos
        for (const group of modifierGroups) {
            if (group.required) {
                const count = (customizingItem.selected_modifiers || []).filter(m => m.group_id === group.id).length;
                const min = group.min || 1;
                if (count < min) {
                    showAlert(`Por favor selecciona al menos ${min} opción(es) en "${group.name}".`);
                    return;
                }
            }
        }

        const effectivePrice = customizingEffectiveUnitPrice;
        const sanitizedNotes = typeof customizingItem.item_notes === 'string' ? customizingItem.item_notes.trim() : '';

        if (customizingItem.isNew) {
            const newLineId = `line_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            const newItem = {
                line_id: newLineId,
                product_id: customizingItem.product.id,
                id: customizingItem.product.id,
                name: customizingItem.product.name,
                base_price: Number(customizingItem.product.price) || 0,
                price: effectivePrice,
                cost: Number(customizingItem.product.cost) || 0,
                image_url: customizingItem.product.image_url || '',
                quantity: customizingItem.quantity || 1,
                selected_modifiers: customizingItem.selected_modifiers || [],
                item_notes: sanitizedNotes || null,
            };
            setOrderItems(prev => [...prev, newItem]);
            showAlert(`${customizingItem.product.name} añadido con complementos.`, 'success');
            if (window.innerWidth < 768) setActiveTab('current');
        } else {
            setOrderItems(prev => prev.map(item => {
                if (item.line_id === customizingItem.line_id) {
                    return {
                        ...item,
                        price: effectivePrice,
                        selected_modifiers: customizingItem.selected_modifiers || [],
                        item_notes: sanitizedNotes || null,
                    };
                }
                return item;
            }));
            showAlert(`Complementos de "${customizingItem.name}" actualizados.`, 'success');
        }

        setCustomizingItem(null);
    };

    const handleUpdateOrder = async () => {
        if (orderItems.length === 0) {
            showAlert("No puedes dejar el pedido vacío. Cancélalo si es necesario.");
            return;
        }

        let scheduledTimestamp = null;
        if (scheduleDate || scheduleTime) {
            if (!scheduleDate || !scheduleTime) {
                showAlert("Debes seleccionar tanto fecha como hora si deseas programar.");
                return;
            }
            const dateTimeString = `${scheduleDate}T${scheduleTime}:00`;
            const scheduledDateObj = new Date(dateTimeString);
            if (isNaN(scheduledDateObj.getTime())) {
                showAlert('La fecha u hora de programación no es válida.');
                return;
            }
            const now = new Date();
            if (scheduledDateObj <= now) {
                showAlert('La hora programada debe ser posterior a la hora actual.');
                return;
            }
            scheduledTimestamp = scheduledDateObj.toISOString();
        } else {
            scheduledTimestamp = null;
        }

        setIsSubmitting(true);
        try {
            if (selectedAddressId && selectedAddressId !== initialAddressId) {
                await supabase.from('customer_addresses').update({ is_default: false }).eq('customer_id', order.customer_id);
                await supabase.from('customer_addresses').update({ is_default: true }).eq('id', selectedAddressId);
                setInitialAddressId(selectedAddressId);
            }

            const cleanItems = orderItems.map(item => {
                const prodId = item.product_id || item.id;
                if (!prodId) throw new Error(`Error de integridad: Producto sin ID detectado (${item.name})`);
                return {
                    product_id: prodId,
                    quantity: Number(item.quantity) || 1,
                    price: Number(item.price) || 0,
                    cost: Number(item.cost) || 0,
                    selected_modifiers: Array.isArray(item.selected_modifiers) ? item.selected_modifiers : [],
                    item_notes: typeof item.item_notes === 'string' && item.item_notes.trim() ? item.item_notes.trim() : null
                };
            });

            // Actualización atómica de orden e items con sincronización de stock de ingredientes
            const { error: updateRpcError } = await supabase.rpc('update_order_with_stock_sync', {
                p_order_id: order.id,
                p_total_amount: total,
                p_scheduled_for: scheduledTimestamp,
                p_items: cleanItems,
                p_notes: order.notes || null
            });

            if (updateRpcError) throw updateRpcError;

            if (order?.order_code) {
                broadcastOrderUpdate(order.order_code, {
                    total_amount: total,
                    scheduled_for: scheduledTimestamp,
                    updated_at: new Date().toISOString()
                });
                broadcastStoreChange('order_changed', {
                    orderCode: order.order_code,
                    total_amount: total
                });
            }

            showAlert("¡Pedido actualizado con éxito!", 'success');
            onOrderUpdated();
            onClose();
        } catch (error) {
            console.error("Error al actualizar pedido:", error);
            showAlert(`Error al actualizar: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const availableProducts = useMemo(() => {
        return allProducts
            .filter(p => p.price != null)
            .filter(p => p.name?.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [allProducts, searchTerm]);

    return (
        <>
            <div className={styles.modalOverlay}>
                <div className={`${styles.modalContent} ${activeTab === 'add' ? styles.addMode : ''}`}>
                    <div className={styles.header}>
                        <h2>Editando Pedido #{order.order_code}</h2>
                        <button onClick={onClose} className={styles.closeButton}>×</button>
                    </div>

                    {loading ? <LoadingSpinner /> : (
                        <>
                            {/* Estructura del Acordeón */}
                            <div className={styles.deliveryAccordion}>
                                <button
                                    type="button"
                                    className={styles.accordionTrigger}
                                    onClick={() => setIsDeliveryOpen(!isDeliveryOpen)}
                                >
                                    <span>Dirección y Programación</span>
                                    <svg className={`${styles.chevron} ${isDeliveryOpen ? styles.open : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="6 9 12 15 18 9"></polyline>
                                    </svg>
                                </button>

                                <div className={`${styles.accordionContent} ${isDeliveryOpen ? styles.open : ''}`}>
                                    <div className={styles.infoCardsContainer}>
                                        <div className={styles.infoCard}>
                                            <label htmlFor="address-select"><MapPinIcon /> Dirección</label>
                                            <div className={styles.deliveryInfoControls}>
                                                <select
                                                    id="address-select"
                                                    value={selectedAddressId}
                                                    onChange={(e) => setSelectedAddressId(e.target.value)}
                                                    disabled={customerAddresses.length === 0}
                                                >
                                                    {customerAddresses.length > 0 ? (
                                                        customerAddresses.map(addr => (
                                                            <option key={addr.id} value={addr.id}>
                                                                {addr.label} - {addr.address_reference || 'Sin ref'}
                                                            </option>))
                                                    ) : (
                                                        <option value="">Sin direcciones</option>
                                                    )}
                                                </select>
                                                <button type="button" onClick={handleShowDeliveryInfo} className={styles.viewAddressButton} disabled={!selectedAddressId}>
                                                    Mapa
                                                </button>
                                            </div>
                                        </div>
                                        <div className={styles.infoCard}>
                                            <label><ClockIcon /> Programación</label>
                                            <div className={styles.scheduleInputs}>
                                                <input
                                                    type="date"
                                                    value={scheduleDate}
                                                    onChange={e => setScheduleDate(e.target.value)}
                                                    min={getLocalYYYYMMDD(new Date())}
                                                />
                                                <input
                                                    type="time"
                                                    value={scheduleTime}
                                                    onChange={e => setScheduleTime(e.target.value)}
                                                />
                                            </div>
                                            {(scheduleDate || scheduleTime) && (
                                                <button type="button" onClick={() => { setScheduleDate(''); setScheduleTime(''); }} className={styles.clearScheduleButton}>
                                                    Quitar programación
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.tabs}>
                                <button onClick={() => setActiveTab('current')} className={activeTab === 'current' ? styles.active : ''}>
                                    Detalle ({orderItems.length})
                                </button>
                                <button onClick={() => setActiveTab('add')} className={activeTab === 'add' ? styles.active : ''}>
                                    + Añadir
                                </button>
                            </div>

                            <div className={styles.contentBody}>
                                <div className={styles.itemsList}>
                                    {orderItems.length > 0 ? orderItems.map(item => (
                                        <div key={item.line_id} className={styles.cartItem}>
                                            <ImageWithFallback src={item.image_url || 'https://placehold.co/80'} alt={item.name} />
                                            <div className={styles.itemInfo}>
                                                <span className={styles.itemName}>{item.name}</span>
                                                <span className={styles.itemPrice}>${(item.price || 0).toFixed(2)}</span>

                                                {/* Visualización de complementos */}
                                                {Array.isArray(item.selected_modifiers) && item.selected_modifiers.length > 0 && (
                                                    <div className={styles.itemModifiersList}>
                                                        {item.selected_modifiers.map((mod, idx) => (
                                                            <span key={idx} className={styles.modifierTag}>
                                                                {mod.name || mod.option_name}
                                                                {Number(mod.price_delta) !== 0 && (
                                                                    <strong> ({Number(mod.price_delta) > 0 ? `+$${Number(mod.price_delta).toFixed(2)}` : `-$${Math.abs(Number(mod.price_delta)).toFixed(2)}`})</strong>
                                                                )}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Visualización de notas especiales */}
                                                {item.item_notes && (
                                                    <span className={styles.itemNoteText}>
                                                        Nota: {item.item_notes}
                                                    </span>
                                                )}

                                                {/* Botón de personalizar/editar complementos */}
                                                <button
                                                    type="button"
                                                    className={styles.editModifiersBtn}
                                                    onClick={() => handleOpenModifierCustomizer(item)}
                                                >
                                                    <SlidersHorizontal size={13} />
                                                    <span>{Array.isArray(item.selected_modifiers) && item.selected_modifiers.length > 0 ? 'Editar complementos' : 'Personalizar'}</span>
                                                </button>
                                            </div>
                                            <div className={styles.itemActions}>
                                                {item.quantity <= 1 ? (
                                                    <button onClick={() => removeItem(item.line_id)} className={`${styles.quantityButton} ${styles.deleteButton}`} title="Eliminar producto">
                                                        <TrashIcon />
                                                    </button>
                                                ) : (
                                                    <button onClick={() => updateQuantity(item.line_id, item.quantity - 1)} className={styles.quantityButton}>-</button>
                                                )}
                                                <span className={styles.quantityDisplay}>{item.quantity}</span>
                                                <button onClick={() => updateQuantity(item.line_id, item.quantity + 1)} className={styles.quantityButton}>+</button>
                                            </div>
                                        </div>
                                    )) : <p className={styles.emptyMessage}>El pedido está vacío.</p>}
                                </div>
                                <div className={styles.addProductSection}>
                                    <input type="text" placeholder="Buscar producto para añadir..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className={styles.searchInput} />
                                    <div className={styles.productList}>
                                        {availableProducts.length > 0 ? availableProducts.map(product => {
                                            const hasModifiers = Array.isArray(product.modifiers) && product.modifiers.length > 0;
                                            return (
                                                <div key={product.id} className={styles.productCard} onClick={() => handleSelectProductToAdd(product)} role="button">
                                                    <ImageWithFallback src={product.image_url || 'https://placehold.co/150'} alt={product.name} />
                                                    <div className={styles.productInfo}>
                                                        <span>{product.name}</span>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <strong>${(Number(product.price) || 0).toFixed(2)}</strong>
                                                            {hasModifiers && (
                                                                <span style={{ fontSize: '0.68rem', background: 'rgba(211, 47, 47, 0.1)', color: 'var(--color-primary)', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                                                                    Opciones
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }) : <p className={styles.emptyMessage}>No hay productos disponibles.</p>}
                                    </div>
                                </div>
                            </div>

                            <div className={styles.footer}>
                                <div className={styles.totalContainer}>
                                    <span>Total Pedido</span>
                                    <strong>${total.toFixed(2)}</strong>
                                </div>
                                <button onClick={handleUpdateOrder} disabled={isSubmitting} className={styles.updateButton}>
                                    {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Submodal para personalizar complementos y notas */}
            {customizingItem && (
                <div className={styles.customizerOverlay} onClick={() => setCustomizingItem(null)}>
                    <div className={styles.customizerModal} onClick={e => e.stopPropagation()}>
                        <div className={styles.customizerHeader}>
                            <div>
                                <h3 className={styles.customizerTitle}>
                                    <SlidersHorizontal size={18} />
                                    Personalizar {customizingItem.name}
                                </h3>
                                <span className={styles.customizerSubtitle}>
                                    Precio base: ${(Number(customizingItem.base_price) || 0).toFixed(2)}
                                </span>
                            </div>
                            <button type="button" className={styles.customizerCloseBtn} onClick={() => setCustomizingItem(null)}>
                                ×
                            </button>
                        </div>

                        <div className={styles.customizerBody}>
                            {Array.isArray(customizingItem.product?.modifiers) && customizingItem.product.modifiers.length > 0 ? (
                                customizingItem.product.modifiers.map(group => {
                                    const isSingle = group.max === 1;
                                    const selectedInGroup = (customizingItem.selected_modifiers || []).filter(m => m.group_id === group.id);
                                    return (
                                        <div key={group.id} className={styles.modifierGroup}>
                                            <div className={styles.groupHeader}>
                                                <h4 className={styles.groupName}>{group.name}</h4>
                                                <span className={`${styles.groupBadge} ${group.required ? styles.requiredBadge : ''}`}>
                                                    {group.required ? 'Obligatorio' : 'Opcional'}
                                                    {group.max ? ` • Máx ${group.max}` : ''}
                                                </span>
                                            </div>
                                            <div className={styles.optionsList}>
                                                {group.options?.map(opt => {
                                                    const isSelected = selectedInGroup.some(m => m.option_id === opt.id);
                                                    const delta = Number(opt.price_delta) || 0;
                                                    return (
                                                        <div
                                                            key={opt.id}
                                                            className={`${styles.optionCard} ${isSelected ? styles.optionSelected : ''}`}
                                                            onClick={() => handleToggleModifierInCustomizer(group, opt)}
                                                        >
                                                            <div className={styles.optionLeft}>
                                                                <span className={`${styles.optionSelector} ${isSingle ? styles.radioSelector : styles.checkSelector}`}>
                                                                    {isSelected && <Check size={12} strokeWidth={3} />}
                                                                </span>
                                                                <span className={styles.optionName}>{opt.name}</span>
                                                            </div>
                                                            <span className={`${styles.optionPrice} ${delta > 0 ? styles.pricePlus : delta < 0 ? styles.priceMinus : ''}`}>
                                                                {delta > 0 ? `+$${delta.toFixed(2)}` : delta < 0 ? `-$${Math.abs(delta).toFixed(2)}` : 'Gratis'}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <p className={styles.noModifiersNotice}>
                                    Este producto no cuenta con grupos de complementos predefinidos. Puedes agregar notas o preferencias a continuación.
                                </p>
                            )}

                            <div className={styles.notesSection}>
                                <label className={styles.notesLabel}>Notas o instrucciones especiales</label>
                                <textarea
                                    className={styles.notesTextarea}
                                    rows={2}
                                    placeholder="Ej: Sin cebolla, bien cocido, salsa aparte..."
                                    value={customizingItem.item_notes || ''}
                                    onChange={e => setCustomizingItem(prev => ({ ...prev, item_notes: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className={styles.customizerFooter}>
                            <div className={styles.customizerPriceBox}>
                                <span className={styles.priceBoxLabel}>Precio unitario</span>
                                <strong className={styles.priceBoxValue}>
                                    ${customizingEffectiveUnitPrice.toFixed(2)}
                                </strong>
                            </div>
                            <div className={styles.customizerActions}>
                                <button type="button" className={styles.customizerCancelBtn} onClick={() => setCustomizingItem(null)}>
                                    Cancelar
                                </button>
                                <button type="button" className={styles.customizerSaveBtn} onClick={handleSaveCustomizer}>
                                    {customizingItem.isNew ? 'Añadir al pedido' : 'Guardar opciones'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isDeliveryModalOpen && (
                <DeliveryInfoModal
                    isOpen={isDeliveryModalOpen} onClose={() => setIsDeliveryModalOpen(false)}
                    deliveryInfo={deliveryInfo}
                />
            )}
        </>
    );
}
