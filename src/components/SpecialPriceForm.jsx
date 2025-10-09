import { useState, useEffect } from 'react';
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      const type = initialData.product_id ? 'product' : 'category';
      setTargetType(type);
      setTargetId(initialData.product_id || initialData.category_id);
      setOverridePrice(initialData.override_price);
      setStartDate(initialData.start_date);
      setEndDate(initialData.end_date);
      setReason(initialData.reason);
    } else {
      setTargetType('product');
      setTargetId('');
      setOverridePrice('');
      setStartDate('');
      setEndDate('');
      setReason('');
    }
  }, [initialData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (new Date(endDate) < new Date(startDate)) {
        showAlert('La fecha de fin no puede ser anterior a la de inicio.');
        return;
    }
    setIsSubmitting(true);

    const specialPriceData = {
      product_id: targetType === 'product' ? targetId : null,
      category_id: targetType === 'category' ? targetId : null,
      override_price: overridePrice,
      start_date: startDate,
      end_date: endDate,
      reason: reason,
    };
    
    try {
      let response;
      if (initialData?.id) {
        response = await supabase.from('special_prices').update(specialPriceData).eq('id', initialData.id);
      } else {
        response = await supabase.from('special_prices').insert([specialPriceData]);
      }
      
      if (response.error) throw response.error;
      
      showAlert(`Promoción ${initialData ? 'actualizada' : 'creada'} con éxito.`);
      onSubmit();

    } catch (error) {
      showAlert(`Error al guardar la promoción: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const options = targetType === 'product' ? products : categories;

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
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

      <div className={styles.formGroup}>
        <label>Nuevo Precio (Ej: 99.99)</label>
        <input type="number" step="0.01" value={overridePrice} onChange={(e) => setOverridePrice(e.target.value)} required />
      </div>

       <div className={styles.formGroup}>
        <label>Motivo (Ej: Oferta de Aniversario)</label>
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: Aniversario"/>
      </div>

      <div className={styles.formGroup}>
        <label>Fecha de Inicio:</label>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
      </div>
      
      <div className={styles.formGroup}>
        <label>Fecha de Fin:</label>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
      </div>

      <button type="submit" disabled={isSubmitting} className={styles.submitButton}>
        {isSubmitting ? 'Guardando...' : (initialData ? 'Actualizar Promoción' : 'Crear Promoción')}
      </button>
    </form>
  );
};

export default SpecialPriceForm;