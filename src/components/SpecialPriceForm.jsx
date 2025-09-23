import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import styles from './SpecialPricesForm.module.css';

const SpecialPriceForm = ({ products, categories, onSubmit, initialData }) => {
  const [targetType, setTargetType] = useState(initialData?.product_id ? 'product' : 'category');
  const [targetId, setTargetId] = useState(initialData?.product_id || initialData?.category_id || '');
  const [overridePrice, setOverridePrice] = useState(initialData?.override_price || '');
  const [startDate, setStartDate] = useState(initialData?.start_date || '');
  const [endDate, setEndDate] = useState(initialData?.end_date || '');
  const [reason, setReason] = useState(initialData?.reason || '');
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
    }
  }, [initialData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
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
      
      if (response.error) {
        throw response.error;
      }
      
      onSubmit();

    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const options = targetType === 'product' ? products : categories;

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div>
        <label>Aplicar a:</label>
        <select value={targetType} onChange={(e) => { setTargetType(e.target.value); setTargetId(''); }}>
          <option value="product">Producto</option>
          <option value="category">Categoría</option>
        </select>
      </div>

      <div>
        <label>{targetType === 'product' ? 'Producto' : 'Categoría'}:</label>
        <select value={targetId} onChange={(e) => setTargetId(e.target.value)} required>
          <option value="">Selecciona una opción</option>
          {options.map(option => (
            <option key={option.id} value={option.id}>{option.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label>Precio Especial:</label>
        <input type="number" step="0.01" value={overridePrice} onChange={(e) => setOverridePrice(e.target.value)} required />
      </div>

      <div>
        <label>Fecha de Inicio:</label>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
      </div>
      
      <div>
        <label>Fecha de Fin:</label>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
      </div>

      <div>
        <label>Motivo:</label>
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: Aniversario"/>
      </div>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Guardando...' : (initialData ? 'Actualizar Promoción' : 'Crear Promoción')}
      </button>
    </form>
  );
};

export default SpecialPriceForm;