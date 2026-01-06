/* src/components/SpecialPriceForm.jsx (Migrado) */

import React, { useState, useEffect, useMemo } from 'react'; // <-- Añadido useMemo
import { supabase } from '../lib/supabaseClient';
import styles from './SpecialPriceForm.module.css';
import { useAlert } from '../context/AlertContext';

// --- (PASO A) AÑADIR IMPORT ---
import { useCategoriesCache } from '../hooks/useCategoriesCache';
// --- FIN PASO A ---

// (Añadido por si las categorías están cargando)
import LoadingSpinner from './LoadingSpinner'; 

// --- (PASO B) CAMBIAR PROPS ---
const SpecialPriceForm = ({ products, onSubmit, initialData }) => {
  const { showAlert } = useAlert();
  
  // --- (PASO B) OBTENER CATEGORÍAS DEL HOOK ---
  const { data: categoriesData, isLoading: loadingCategories } = useCategoriesCache();
  // Corrección para evitar error en null.map
  const categories = useMemo(() => categoriesData || [], [categoriesData]);
  // --- FIN PASO B ---

  const [targetType, setTargetType] = useState('product');
  const [targetId, setTargetId] = useState('');
  const [overridePrice, setOverridePrice] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [appliesTo, setAppliesTo] = useState('everyone'); 
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [allCustomers, setAllCustomers] = useState([]); 
  const [isSubmitting, setIsSubmitting] = useState(false);


  // ... (useEffect para fetchCustomers sin cambios) ...
  useEffect(() => {
    const fetchCustomers = async () => {
      const { data, error } = await supabase.from('customers').select('id, name, phone');
      if (error) {
        showAlert('Error al obtener clientes para la selección.');
      } else {
        setAllCustomers(data);
      }
    };
    if (appliesTo === 'specific') {
      fetchCustomers();
    }
  }, [appliesTo, showAlert]);

  // ... (useEffect para initialData sin cambios) ...
  useEffect(() => {
    if (initialData) {
      const type = initialData.product_id ? 'product' : 'category';
      setTargetType(type);
      setTargetId(initialData.product_id || initialData.category_id || '');
      setOverridePrice(initialData.override_price || '');
      setStartDate(initialData.start_date || '');
      setEndDate(initialData.end_date || '');
      setReason(initialData.reason || '');

      if (initialData.target_customer_ids && initialData.target_customer_ids.length > 0) {
        setAppliesTo('specific');
        setSelectedCustomerIds(initialData.target_customer_ids);
      } else {
        setAppliesTo('everyone');
        setSelectedCustomerIds([]);
      }
    } else {
      setTargetType('product');
      setTargetId('');
      setOverridePrice('');
      setStartDate('');
      setEndDate('');
      setReason('');
      setAppliesTo('everyone');
      setSelectedCustomerIds([]);
    }
  }, [initialData]);

  // ... (filteredCustomers, handleAddCustomer, handleRemoveCustomer, handleSubmit sin cambios) ...
  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return [];
    const lowerSearch = customerSearch.toLowerCase();
    return allCustomers.filter(c =>
        !selectedCustomerIds.includes(c.id) && 
        (c.name.toLowerCase().includes(lowerSearch) || (c.phone && c.phone.includes(customerSearch)))
    ).slice(0, 10);
  }, [customerSearch, allCustomers, selectedCustomerIds]);

  const handleAddCustomer = (customerId) => {
    if (!selectedCustomerIds.includes(customerId)) {
         setSelectedCustomerIds(prev => [...prev, customerId]);
    }
    setCustomerSearch(''); 
  };

  const handleRemoveCustomer = (customerId) => {
    setSelectedCustomerIds(prev => prev.filter(id => id !== customerId));
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    if (new Date(endDate) < new Date(startDate)) {
        showAlert('La fecha de fin no puede ser anterior a la de inicio.');
        return;
    }
    if (appliesTo === 'specific' && selectedCustomerIds.length === 0) {
        showAlert('Por favor, selecciona al menos un cliente específico o elige "Todos los Clientes".');
        return;
    }
    setIsSubmitting(true);

    const specialPriceData = {
      product_id: targetType === 'product' ? targetId || null : null,
      category_id: targetType === 'category' ? targetId || null : null,
      override_price: parseFloat(overridePrice),
      start_date: startDate,
      end_date: endDate,
      reason: reason || null,
      target_customer_ids: appliesTo === 'specific' ? selectedCustomerIds : null,
    };

    if (!specialPriceData.product_id && !specialPriceData.category_id) {
        showAlert('Debes seleccionar un Producto o una Categoría.');
        setIsSubmitting(false);
        return;
    }


    try {
      let response;
      if (initialData?.id) {
        response = await supabase.from('special_prices').update(specialPriceData).eq('id', initialData.id).select().single();
      } else {
        response = await supabase.from('special_prices').insert(specialPriceData).select().single();
      }

      if (response.error) {
          if (response.error.code === '23505') { 
              showAlert('Error: Ya existe una promoción similar para este objetivo y fechas.');
          } else {
              throw response.error;
          }
      } else {
          showAlert(`Promoción ${initialData ? 'actualizada' : 'creada'} con éxito.`);
          onSubmit(); 
      }

    } catch (error) {
      showAlert(`Error al guardar la promoción: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };


  // 'categories' ahora viene del hook
  const options = targetType === 'product' ? products : categories;

  // Añadimos un spinner si las categorías están cargando
  if (loadingCategories) {
      return (
          <div className={styles.form}>
              <LoadingSpinner />
          </div>
      );
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {/* Selección de Tipo (Producto/Categoría) y Objetivo (ID) */}
       <div className={styles.formGroup}>
        <label>Aplicar a:</label>
        <select value={targetType} onChange={(e) => { setTargetType(e.target.value); setTargetId(''); }}>
          <option value="product">Producto Específico</option>
          <option value="category">Categoría Completa</option>
        </select>
      </div>

      <div className={styles.formGroup}>
        <label>{targetType === 'product' ? 'Producto' : 'Categoría'}:</label>
        <select value={targetId} onChange={(e) => setTargetId(e.target.value)} required>
          <option value="">Selecciona una opción</option>
          {/* 'options' ahora depende de 'categories' del hook */}
          {options.map(option => (
            <option key={option.id} value={option.id}>{option.name}</option>
          ))}
        </select>
      </div>

      {/* ... (Resto del formulario sin cambios) ... */}
      <div className={styles.formGroup}>
        <label>Nuevo Precio (Ej: 99.99)</label>
        <input type="number" step="0.01" min="0" value={overridePrice} onChange={(e) => setOverridePrice(e.target.value)} required />
      </div>
      <div className={styles.formGroup}>
        <label>Motivo (Opcional)</label>
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: Oferta Aniversario"/>
      </div>
       <div className={styles.formGroup}>
        <label>Fecha de Inicio:</label>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
      </div>
      <div className={styles.formGroup}>
        <label>Fecha de Fin:</label>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
      </div>
      <div className={`${styles.formGroup} ${styles.fullWidth}`}>
        <label>Visible Para:</label>
        <select value={appliesTo} onChange={(e) => setAppliesTo(e.target.value)}>
          <option value="everyone">Todos los Clientes</option>
          <option value="specific">Clientes Específicos</option>
        </select>
      </div>

      {appliesTo === 'specific' && (
        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <label>Buscar y Añadir Clientes:</label>
          <input
            type="text"
            placeholder="Buscar por nombre o teléfono..."
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            disabled={!allCustomers.length}
          />
          {customerSearch && filteredCustomers.length > 0 && (
            <ul className={styles.customerSearchResults}> 
              {filteredCustomers.map(c => (
                <li key={c.id} onClick={() => handleAddCustomer(c.id)} role="button">
                  {c.name} ({c.phone || 'Sin teléfono'})
                </li>
              ))}
            </ul>
          )}
          {customerSearch && !filteredCustomers.length && <p className={styles.noResults}>No se encontraron clientes.</p>}

          <div className={styles.selectedCustomersList}> 
             <label>Clientes Seleccionados ({selectedCustomerIds.length}):</label>
            {selectedCustomerIds.length > 0 ? (
                selectedCustomerIds.map(id => {
                  const customer = allCustomers.find(c => c.id === id);
                  return (
                    <div key={id} className={styles.selectedCustomerTag}> 
                      <span>{customer?.name || `ID: ${id.substring(0, 6)}...`}</span>
                      <button type="button" onClick={() => handleRemoveCustomer(id)} aria-label={`Quitar ${customer?.name || 'cliente'}`}>×</button>
                    </div>
                  );
                })
             ) : <p>Ningún cliente específico seleccionado. El precio será visible para todos.</p>
             }
          </div>
        </div>
      )}
      <button type="submit" disabled={isSubmitting} className={styles.submitButton}>
         {isSubmitting ? 'Guardando...' : (initialData ? 'Actualizar Promoción' : 'Crear Promoción')}
      </button>
    </form>
  );
};

// No necesitas exportar 'default' si ya lo haces en el componente padre
// (Asumiendo que SpecialPriceForm está en su propio archivo)
export default SpecialPriceForm;