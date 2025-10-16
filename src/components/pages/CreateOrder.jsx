import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAlert } from '../context/AlertContext';
import styles from './CreateOrder.module.css';
import LoadingSpinner from '../components/LoadingSpinner';
import ImageWithFallback from '../components/ImageWithFallback';
import { useAdminAuth } from '../context/AdminAuthContext';

const UserPlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="17" y1="11" x2="23" y2="11"></line></svg>;
const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>;


export default function CreateOrder() {
    const { showAlert } = useAlert();
    const { hasPermission } = useAdminAuth();
    const [step, setStep] = useState(1);
    const [customers, setCustomers] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [customerSearch, setCustomerSearch] = useState('');
    const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
    const [newCustomer, setNewCustomer] = useState({ name: '', phone: '' });
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [productSearch, setProductSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [cart, setCart] = useState([]);
    
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const canEdit = hasPermission('crear-pedido.edit');

    // ... (useEffect y otras funciones no cambian)
     useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const { data: customersData, error: customersError } = await supabase.from('customers').select('*');
                if (customersError) throw customersError;
                setCustomers(customersData);

                const { data: productsData, error: productsError } = await supabase.from('products').select('*').eq('is_active', true);
                if (productsError) throw productsError;
                setProducts(productsData);

                const { data: categoriesData, error: categoriesError } = await supabase.from('categories').select('*');
                if (categoriesError) throw categoriesError;
                setCategories(categoriesData);

            } catch (error) {
                showAlert(`Error al cargar datos: ${error.message}`);
            }
            setLoading(false);
        };
        fetchData();
    }, [showAlert]);

    const filteredCustomers = useMemo(() => {
        if (!customerSearch) return [];
        return customers.filter(c =>
            c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
            c.phone.includes(customerSearch)
        ).slice(0, 5);
    }, [customers, customerSearch]);
    
    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            const matchesCategory = categoryFilter === 'all' || p.category_id === categoryFilter;
            const matchesSearch = p.name.toLowerCase().includes(productSearch.toLowerCase());
            return matchesCategory && matchesSearch;
        });
    }, [products, productSearch, categoryFilter]);

    const handleCreateCustomer = async () => {
        if (!canEdit) return;
        if (!newCustomer.name || !newCustomer.phone) {
            showAlert('El nombre y el teléfono son obligatorios.');
            return;
        }
        setIsSubmitting(true);
        const { data, error } = await supabase.from('customers').insert(newCustomer).select().single();
        if (error) {
            showAlert(`Error al crear cliente: ${error.message}`);
        } else {
            showAlert('Cliente creado con éxito.');
            setCustomers(prev => [...prev, data]);
            setSelectedCustomer(data);
            setStep(2);
            setIsCreatingCustomer(false);
        }
        setIsSubmitting(false);
    };

    const addToCart = (product) => {
        if (!canEdit) return;
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
            }
            return [...prev, { ...product, quantity: 1 }];
        });
    };
    
    const updateQuantity = (productId, newQuantity) => {
        if (!canEdit) return;
        if (newQuantity <= 0) {
            setCart(prev => prev.filter(item => item.id !== productId));
        } else {
            setCart(prev => prev.map(item => item.id === productId ? { ...item, quantity: newQuantity } : item));
        }
    };

    const cartTotal = useMemo(() => {
        return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }, [cart]);


    const handlePlaceOrder = async () => {
        if (!canEdit) return;
        if (!selectedCustomer || cart.length === 0) {
            showAlert('Debes seleccionar un cliente y añadir al menos un producto.');
            return;
        }
        setIsSubmitting(true);
        try {
            const { data: orderData, error: orderError } = await supabase
                .from('orders')
                .insert({
                    customer_id: selectedCustomer.id,
                    total_amount: cartTotal,
                    status: 'pendiente' // 1. Cambiamos el estado a 'pendiente' para reflejar la confirmación
                })
                .select()
                .single();
            if (orderError) throw orderError;

            const orderItems = cart.map(item => ({
                order_id: orderData.id,
                product_id: item.id,
                quantity: item.quantity,
                price: item.price
            }));
            const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
            if (itemsError) throw itemsError;

            // 2. Construimos el mensaje de confirmación para WhatsApp
            let message = `¡Hola, ${selectedCustomer.name}! 👋 Te confirmamos tu pedido en ENTRE ALAS:\n\n*Pedido N°: ${orderData.order_code}*\n\n`;
            cart.forEach(item => {
                message += `• ${item.quantity}x ${item.name}\n`;
            });
            message += `\n*Total a pagar: $${cartTotal.toFixed(2)}*`;

            // 3. Creamos la URL de WhatsApp con el número del cliente
            const whatsappUrl = `https://api.whatsapp.com/send?phone=${selectedCustomer.phone}&text=${encodeURIComponent(message)}`;

            // 4. Usamos showAlert con una función callback para redirigir y limpiar el estado
            showAlert(
                `¡Pedido #${orderData.order_code} creado! Serás redirigido a WhatsApp para notificar al cliente.`,
                'info',
                () => {
                    window.open(whatsappUrl, '_blank');
                    setStep(1);
                    setSelectedCustomer(null);
                    setCart([]);
                    setCustomerSearch('');
                }
            );

        } catch (error) {
            showAlert(`Error al crear el pedido: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    // ... (el resto del componente y el JSX no cambian)

    if (loading) return <LoadingSpinner />;

    return (
        <div className={styles.container}>
            <h1>Crear Nuevo Pedido</h1>

            <div className={styles.mainGrid}>
                <div className={styles.workflowColumn}>
                    <div className={`${styles.stepCard} ${step === 1 ? styles.active : ''}`}>
                        <div className={styles.stepHeader}>
                            <span className={styles.stepNumber}>1</span>
                            <h2>Seleccionar Cliente</h2>
                        </div>
                        {selectedCustomer ? (
                            <div className={styles.selectedCustomer}>
                                <p><strong>Cliente:</strong> {selectedCustomer.name}</p>
                                <p><strong>Teléfono:</strong> {selectedCustomer.phone}</p>
                                <button onClick={() => { if(canEdit) {setSelectedCustomer(null); setStep(1);}}} className={styles.changeButton} disabled={!canEdit}>Cambiar</button>
                            </div>
                        ) : (
                            <div className={styles.customerSearch}>
                                <div className={styles.searchInput}>
                                    <SearchIcon />
                                    <input
                                        type="text"
                                        placeholder="Buscar por nombre o teléfono..."
                                        value={customerSearch}
                                        onChange={(e) => setCustomerSearch(e.target.value)}
                                        disabled={!canEdit}
                                    />
                                </div>
                                {filteredCustomers.length > 0 && (
                                    <ul className={styles.customerResults}>
                                        {filteredCustomers.map(c => (
                                            <li key={c.id} onClick={() => { if(canEdit) {setSelectedCustomer(c); setStep(2); }}}>
                                                {c.name} - {c.phone}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <p className={styles.orText}>o</p>
                                <button onClick={() => setIsCreatingCustomer(true)} className={styles.createCustomerButton} disabled={!canEdit}>
                                    <UserPlusIcon /> Crear Nuevo Cliente
                                </button>
                            </div>
                        )}
                    </div>

                    <div className={`${styles.stepCard} ${step === 2 ? styles.active : ''}`}>
                         <div className={styles.stepHeader}>
                            <span className={styles.stepNumber}>2</span>
                            <h2>Añadir Productos</h2>
                        </div>
                        <div className={styles.productFilters}>
                             <div className={styles.searchInput}>
                                <SearchIcon />
                                <input
                                    type="text"
                                    placeholder="Buscar producto..."
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                    disabled={!selectedCustomer || !canEdit}
                                />
                             </div>
                            <select onChange={(e) => setCategoryFilter(e.target.value)} disabled={!selectedCustomer || !canEdit}>
                                <option value="all">Todas las categorías</option>
                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className={styles.productList}>
                            {selectedCustomer ? filteredProducts.map(p => (
                                <div key={p.id} className={styles.productItem} onClick={() => addToCart(p)}>
                                    <ImageWithFallback src={p.image_url || 'https://placehold.co/100'} alt={p.name} />
                                    <div className={styles.productInfo}>
                                        <strong>{p.name}</strong>
                                        <span>${p.price.toFixed(2)}</span>
                                    </div>
                                </div>
                            )) : <p className={styles.disabledText}>Selecciona un cliente para añadir productos.</p>}
                        </div>
                    </div>
                </div>

                <div className={styles.summaryColumn}>
                    <div className={styles.summaryCard}>
                        <h3>Resumen del Pedido</h3>
                        {cart.length === 0 ? (
                            <p className={styles.emptyCart}>El carrito está vacío.</p>
                        ) : (
                            <>
                                <ul className={styles.cartList}>
                                    {cart.map(item => (
                                        <li key={item.id}>
                                            <div className={styles.cartItemInfo}>
                                                <span>{item.name}</span>
                                                <small>${item.price.toFixed(2)}</small>
                                            </div>
                                            <div className={styles.quantityControl}>
                                                <button onClick={() => updateQuantity(item.id, item.quantity - 1)} disabled={!canEdit}>-</button>
                                                <input type="number" value={item.quantity} onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 0)} disabled={!canEdit} />
                                                <button onClick={() => updateQuantity(item.id, item.quantity + 1)} disabled={!canEdit}>+</button>
                                            </div>
                                            <strong>${(item.price * item.quantity).toFixed(2)}</strong>
                                        </li>
                                    ))}
                                </ul>
                                <div className={styles.total}>
                                    <span>Total</span>
                                    <strong>${cartTotal.toFixed(2)}</strong>
                                </div>
                            </>
                        )}
                        <button 
                            className={styles.placeOrderButton} 
                            onClick={handlePlaceOrder}
                            disabled={isSubmitting || cart.length === 0 || !selectedCustomer || !canEdit}
                        >
                            {isSubmitting ? 'Creando...' : 'Crear Pedido'}
                        </button>
                    </div>
                </div>
            </div>

            {isCreatingCustomer && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <h2>Crear Nuevo Cliente</h2>
                        <div className={styles.formGroup}>
                            <label>Nombre Completo</label>
                            <input type="text" value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} />
                        </div>
                         <div className={styles.formGroup}>
                            <label>Número de Teléfono</label>
                            <input type="tel" value={newCustomer.phone} onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})} />
                        </div>
                        <div className={styles.modalActions}>
                            <button onClick={() => setIsCreatingCustomer(false)} className="admin-button-secondary">Cancelar</button>
                            <button onClick={handleCreateCustomer} className="admin-button-primary" disabled={isSubmitting}>
                                {isSubmitting ? 'Guardando...' : 'Guardar Cliente'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}