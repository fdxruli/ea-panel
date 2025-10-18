import React, { useState, useEffect, useMemo } from 'react'; // Asegúrate de importar useMemo y React si no está
import { supabase } from '../lib/supabaseClient';
import styles from './SpecialPriceForm.module.css';
import { useAlert } from '../context/AlertContext';

const SpecialPriceForm = ({ products, categories, onSubmit, initialData }) => {
  const { showAlert } = useAlert();
  const [targetType, setTargetType] = useState('product');
  const [targetId, setTargetId] = useState('');
  const [overridePrice, setOverridePrice] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [appliesTo, setAppliesTo] = useState('everyone'); // 'everyone' or 'specific'
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [allCustomers, setAllCustomers] = useState([]); // Necesitamos obtener los clientes
  const [isSubmitting, setIsSubmitting] = useState(false);


  // Obtener clientes cuando el componente se monta o appliesTo cambia a 'specific'
  useEffect(() => {
    const fetchCustomers = async () => {
      // Optimizacion: Solo traer id, name, phone
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

  // Actualizar estado cuando initialData cambia (para edición)
  useEffect(() => {
    if (initialData) {
      const type = initialData.product_id ? 'product' : 'category';
      setTargetType(type);
      setTargetId(initialData.product_id || initialData.category_id || ''); // Asegurar valor inicial '' si no hay id
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
      // Resetear para nueva entrada
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

  // Filtrar clientes para la UI de búsqueda/selección
  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return [];
    const lowerSearch = customerSearch.toLowerCase();
    return allCustomers.filter(c =>
        !selectedCustomerIds.includes(c.id) && // Excluir ya seleccionados
        (c.name.toLowerCase().includes(lowerSearch) || (c.phone && c.phone.includes(customerSearch)))
    ).slice(0, 10); // Limitar resultados
  }, [customerSearch, allCustomers, selectedCustomerIds]);

  const handleAddCustomer = (customerId) => {
    if (!selectedCustomerIds.includes(customerId)) {
         setSelectedCustomerIds(prev => [...prev, customerId]);
    }
    setCustomerSearch(''); // Limpiar búsqueda después de seleccionar
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
      product_id: targetType === 'product' ? targetId || null : null, // Asegurar null si está vacío
      category_id: targetType === 'category' ? targetId || null : null, // Asegurar null si está vacío
      override_price: parseFloat(overridePrice), // Asegurar que sea número
      start_date: startDate,
      end_date: endDate,
      reason: reason || null, // Asegurar null si está vacío
      // --- NUEVO CAMPO ---
      target_customer_ids: appliesTo === 'specific' ? selectedCustomerIds : null, // Usa null para 'todos'
    };

    // Validación adicional: Al menos product_id o category_id debe estar presente
    if (!specialPriceData.product_id && !specialPriceData.category_id) {
        showAlert('Debes seleccionar un Producto o una Categoría.');
        setIsSubmitting(false);
        return;
    }


    try {
      let response;
      if (initialData?.id) {
        // Actualizar
        response = await supabase.from('special_prices').update(specialPriceData).eq('id', initialData.id).select().single();
      } else {
        // Insertar
        response = await supabase.from('special_prices').insert(specialPriceData).select().single();
      }

      if (response.error) {
          // Manejo específico para violación de unicidad si es necesario
          if (response.error.code === '23505') { // Código típico de violación de unicidad
              showAlert('Error: Ya existe una promoción similar para este objetivo y fechas.');
          } else {
              throw response.error;
          }
      } else {
          showAlert(`Promoción ${initialData ? 'actualizada' : 'creada'} con éxito.`);
          onSubmit(); // Llama al callback proporcionado por el padre
      }

    } catch (error) {
      showAlert(`Error al guardar la promoción: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const options = targetType === 'product' ? products : categories;

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
          {options.map(option => (
            <option key={option.id} value={option.id}>{option.name}</option>
          ))}
        </select>
      </div>

      {/* Inputs de Precio, Fechas, Motivo */}
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

      {/* --- NUEVA SECCIÓN para Selección de Clientes --- */}
      <div className={`${styles.formGroup} ${styles.fullWidth}`}> {/* Asumiendo clase fullWidth */}
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
            disabled={!allCustomers.length} // Deshabilitar si no hay clientes cargados
          />
          {customerSearch && filteredCustomers.length > 0 && (
            <ul className={styles.customerSearchResults}> {/* Añadir estilos CSS para esta lista */}
              {filteredCustomers.map(c => (
                <li key={c.id} onClick={() => handleAddCustomer(c.id)} role="button">
                  {c.name} ({c.phone || 'Sin teléfono'})
                </li>
              ))}
            </ul>
          )}
          {customerSearch && !filteredCustomers.length && <p className={styles.noResults}>No se encontraron clientes.</p>}

          <div className={styles.selectedCustomersList}> {/* Añadir estilos CSS para esta lista */}
             <label>Clientes Seleccionados ({selectedCustomerIds.length}):</label>
            {selectedCustomerIds.length > 0 ? (
                selectedCustomerIds.map(id => {
                  const customer = allCustomers.find(c => c.id === id);
                  return (
                    <div key={id} className={styles.selectedCustomerTag}> {/* Añadir estilos CSS */}
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
      {/* --- FIN DE LA NUEVA SECCIÓN --- */}

      <button type="submit" disabled={isSubmitting} className={styles.submitButton}>
         {isSubmitting ? 'Guardando...' : (initialData ? 'Actualizar Promoción' : 'Crear Promoción')}
      </button>
    </form>
  );
};

export default SpecialPriceForm;
