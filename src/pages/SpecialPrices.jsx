import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import SpecialPriceForm from '../components/SpecialPriceForm';
import styles from './SpecialPrices.module.css';
import ConfirmModal from '../components/ConfirmModal';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAlert } from '../context/AlertContext';

const SpecialPrices = () => {
  const { showAlert } = useAlert();
  const [specialPrices, setSpecialPrices] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPrice, setEditingPrice] = useState(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [priceToDelete, setPriceToDelete] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const { data: pricesData, error: pricesError } = await supabase
        .from('special_prices')
        .select(`*, products (name), categories (name)`)
        .order('end_date', { ascending: false });
      if (pricesError) throw pricesError;
      setSpecialPrices(pricesData);

      const { data: productsData, error: productsError } = await supabase.from('products').select('id, name');
      if (productsError) throw productsError;
      setProducts(productsData);

      const { data: categoriesData, error: categoriesError } = await supabase.from('categories').select('id, name');
      if (categoriesError) throw categoriesError;
      setCategories(categoriesData);

    } catch (error) {
      showAlert(`Error al cargar datos: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFormSubmit = () => {
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
  };

  const confirmDelete = async () => {
    if (priceToDelete) {
      try {
        const { error } = await supabase.from('special_prices').delete().eq('id', priceToDelete.id);
        if (error) throw error;
        showAlert('Promoción eliminada con éxito.');
        fetchData();
      } catch (error) {
        showAlert(`Error al eliminar: ${error.message}`);
      } finally {
        setPriceToDelete(null);
      }
    }
  };

  const getTargetName = (price) => {
    if (price.product_id) return `Producto: ${price.products?.name || 'N/A'}`;
    if (price.category_id) return `Categoría: ${price.categories?.name || 'N/A'}`;
    return 'N/A';
  };
  
  const now = new Date().toISOString().split('T')[0];
  const activeAndUpcomingPrices = specialPrices.filter(p => p.end_date >= now);
  const pastPrices = specialPrices.filter(p => p.end_date < now);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className={styles.container}>
      <h1>Gestión de Precios Especiales</h1>

      <div className="form-container">
          <h3>{isFormVisible ? (editingPrice ? 'Editando Promoción' : 'Crear Nueva Promoción') : 'Crear Nueva Promoción'}</h3>
          {!isFormVisible && 
            <button className="admin-button-primary" onClick={() => setIsFormVisible(true)}>
              + Añadir Promoción
            </button>
          }
          {isFormVisible && (
            <>
              <SpecialPriceForm
                products={products}
                categories={categories}
                onSubmit={handleFormSubmit}
                initialData={editingPrice}
              />
               <button className="admin-button-secondary" onClick={() => { setIsFormVisible(false); setEditingPrice(null); }}>
                Cancelar
              </button>
            </>
          )}
      </div>
      
      <div className={styles.table}>
        <h3>Promociones Activas y Próximas</h3>
        <div className="table-wrapper">
          <table className="products-table">
            <thead>
              <tr>
                <th>Objetivo</th>
                <th>Precio Especial</th>
                <th>Vigencia</th>
                <th>Motivo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {activeAndUpcomingPrices.map(price => (
                <tr key={price.id}>
                  <td>{getTargetName(price)}</td>
                  <td>${price.override_price}</td>
                  <td>{price.start_date} al {price.end_date}</td>
                  <td>{price.reason}</td>
                  <td>
                    <div className={styles.actionsContainer}>
                        <button onClick={() => handleEdit(price)} className="admin-button-secondary">Editar</button>
                        <button onClick={() => handleDelete(price)} className="admin-button-danger">Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className={styles.table}>
        <h3>Promociones Pasadas</h3>
        <div className="table-wrapper">
           <table className="products-table">
            <thead>
              <tr>
                <th>Objetivo</th>
                <th>Precio Especial</th>
                <th>Vigencia</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {pastPrices.map(price => (
                <tr key={price.id}>
                  <td>{getTargetName(price)}</td>
                  <td>${price.override_price}</td>
                  <td>{price.start_date} al {price.end_date}</td>
                  <td>{price.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <ConfirmModal
          isOpen={!!priceToDelete}
          onClose={() => setPriceToDelete(null)}
          onConfirm={confirmDelete}
          title="¿Confirmar Eliminación?"
        >
          ¿Estás seguro de que deseas eliminar la promoción para "{priceToDelete && getTargetName(priceToDelete)}"?
      </ConfirmModal>

    </div>
  );
};

export default SpecialPrices;