import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import SpecialPriceForm from '../components/SpecialPriceForm';
import styles from './SpecialPrices.module.css';
import ConfirmModal from '../components/ConfirmModal';

const SpecialPrices = () => {
  const [specialPrices, setSpecialPrices] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPrice, setEditingPrice] = useState(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [priceToDelete, setPriceToDelete] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: pricesData, error: pricesError } = await supabase
        .from('special_prices')
        .select(`
          *,
          products (name),
          categories (name)
        `);
      if (pricesError) throw pricesError;
      setSpecialPrices(pricesData);

      const { data: productsData, error: productsError } = await supabase.from('products').select('id, name');
      if (productsError) throw productsError;
      setProducts(productsData);

      const { data: categoriesData, error: categoriesError } = await supabase.from('categories').select('id, name');
      if (categoriesError) throw categoriesError;
      setCategories(categoriesData);

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFormSubmit = async () => {
    fetchData();
    setIsFormVisible(false);
    setEditingPrice(null);
  };

  const handleEdit = (price) => {
    setEditingPrice(price);
    setIsFormVisible(true);
  };
  
  const handleDelete = (price) => {
    setPriceToDelete(price);
    setShowConfirmModal(true);
  };

  const confirmDelete = async () => {
    if (priceToDelete) {
      try {
        const { error } = await supabase.from('special_prices').delete().eq('id', priceToDelete.id);
        if (error) throw error;
        setSpecialPrices(specialPrices.filter(p => p.id !== priceToDelete.id));
      } catch (error) {
        console.error('Error deleting special price:', error);
      } finally {
        setShowConfirmModal(false);
        setPriceToDelete(null);
      }
    }
  };

  const getTargetName = (price) => {
    if (price.product_id) {
      return `Producto: ${price.products?.name || 'No disponible'}`;
    }
    if (price.category_id) {
      return `Categoría: ${price.categories?.name || 'No disponible'}`;
    }
    return 'N/A';
  };
  
  const now = new Date().toISOString().split('T')[0];
  const activeAndUpcomingPrices = specialPrices.filter(p => p.end_date >= now);
  const pastPrices = specialPrices.filter(p => p.end_date < now);


  if (loading) {
    return <p>Cargando precios especiales...</p>;
  }

  return (
    <div className={styles.container}>
      <h2>Gestión de Precios Especiales</h2>
      
      <button onClick={() => { setEditingPrice(null); setIsFormVisible(!isFormVisible); }}>
        {isFormVisible ? 'Cancelar' : 'Crear Nueva Promoción'}
      </button>

      {isFormVisible && (
        <SpecialPriceForm
          products={products}
          categories={categories}
          onSubmit={handleFormSubmit}
          initialData={editingPrice}
        />
      )}

      <h3>Promociones Activas y Próximas</h3>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Objetivo</th>
            <th>Precio Especial</th>
            <th>Fecha de Inicio</th>
            <th>Fecha de Fin</th>
            <th>Motivo</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {activeAndUpcomingPrices.map(price => (
            <tr key={price.id}>
              <td>{getTargetName(price)}</td>
              <td>${price.override_price}</td>
              <td>{price.start_date}</td>
              <td>{price.end_date}</td>
              <td>{price.reason}</td>
              <td>
                <button onClick={() => handleEdit(price)}>Editar</button>
                <button onClick={() => handleDelete(price)} className={styles.deleteButton}>Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Promociones Pasadas</h3>
       <table className={styles.table}>
        <thead>
          <tr>
            <th>Objetivo</th>
            <th>Precio Especial</th>
            <th>Fecha de Inicio</th>
            <th>Fecha de Fin</th>
            <th>Motivo</th>
          </tr>
        </thead>
        <tbody>
          {pastPrices.map(price => (
            <tr key={price.id}>
              <td>{getTargetName(price)}</td>
              <td>${price.override_price}</td>
              <td>{price.start_date}</td>
              <td>{price.end_date}</td>
              <td>{price.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {showConfirmModal && (
        <ConfirmModal
          message="¿Estás seguro de que deseas eliminar esta promoción?"
          onConfirm={confirmDelete}
          onCancel={() => setShowConfirmModal(false)}
        />
      )}
    </div>
  );
};

export default SpecialPrices;