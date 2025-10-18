import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import SpecialPriceForm from '../components/SpecialPriceForm';
import styles from './SpecialPrices.module.css';
import ConfirmModal from '../components/ConfirmModal';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAlert } from '../context/AlertContext';
import { useAdminAuth } from '../context/AdminAuthContext';

const SpecialPrices = () => {
  const { showAlert } = useAlert();
  const { hasPermission } = useAdminAuth();
  const [specialPrices, setSpecialPrices] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPrice, setEditingPrice] = useState(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [priceToDelete, setPriceToDelete] = useState(null);

  const canEdit = hasPermission('special-prices.edit');
  const canDelete = hasPermission('special-prices.delete');

  const fetchData = useCallback(async () => {
    setLoading(true); // Asegurar que el estado de carga se active
    try {
      // Pedir todos los datos necesarios en paralelo
      const [pricesRes, productsRes, categoriesRes] = await Promise.all([
        supabase
          .from('special_prices')
          .select(`*, products (name), categories (name)`) // Incluir nombres relacionados
          .order('end_date', { ascending: false }),
        supabase.from('products').select('id, name').order('name'), // Ordenar productos
        supabase.from('categories').select('id, name').order('name') // Ordenar categorías
      ]);

      if (pricesRes.error) throw pricesRes.error;
      if (productsRes.error) throw productsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;

      setSpecialPrices(pricesRes.data || []);
      setProducts(productsRes.data || []);
      setCategories(categoriesRes.data || []);

    } catch (error) {
      showAlert(`Error al cargar datos: ${error.message}`);
      // Considerar resetear estados en caso de error
      setSpecialPrices([]);
      setProducts([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    fetchData();
    // Suscripción a cambios en tiempo real
    const channel = supabase.channel('public:special_prices')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'special_prices' }, (payload) => {
        console.log('Change detected in special prices!', payload);
        fetchData(); // Volver a cargar los datos cuando hay cambios
      })
      .subscribe();

    // Limpieza al desmontar el componente
    return () => {
        supabase.removeChannel(channel);
    };
  }, [fetchData]); // fetchData ahora es una dependencia estable

  const handleFormSubmit = () => {
    fetchData(); // Recargar datos después de enviar el formulario
    setIsFormVisible(false);
    setEditingPrice(null); // Limpiar el estado de edición
  };

  const handleEdit = (price) => {
    if (!canEdit) return;
    setEditingPrice(price);
    setIsFormVisible(true);
  };

  const handleDelete = (price) => {
    if (!canDelete) return;
    setPriceToDelete(price); // Establecer el precio a eliminar para el modal de confirmación
  };

  const confirmDelete = async () => {
    if (!priceToDelete || !canDelete) return; // Doble verificación

    try {
      const { error } = await supabase.from('special_prices').delete().eq('id', priceToDelete.id);
      if (error) throw error;
      showAlert('Promoción eliminada con éxito.');
      fetchData(); // Recargar datos después de eliminar
    } catch (error) {
      showAlert(`Error al eliminar: ${error.message}`);
    } finally {
      setPriceToDelete(null); // Cerrar el modal de confirmación
    }
  };

  // Función auxiliar para obtener el nombre del objetivo (Producto o Categoría)
  const getTargetName = (price) => {
    if (price.product_id && price.products) return `Producto: ${price.products.name}`;
    if (price.category_id && price.categories) return `Categoría: ${price.categories.name}`;
    if (price.product_id) return `Producto (ID: ${price.product_id.substring(0,6)}...)`; // Fallback si el producto no se cargó
    if (price.category_id) return `Categoría (ID: ${price.category_id.substring(0,6)}...)`; // Fallback
    return 'N/A';
  };

   // Función auxiliar para mostrar a quién aplica el precio
  const getAudience = (price) => {
    if (price.target_customer_ids === null || price.target_customer_ids?.length === 0) {
      return "Todos";
    }
    const count = price.target_customer_ids.length;
    return `Específicos (${count})`;
  };


  // Separar precios activos/futuros y pasados
  const now = new Date().toISOString().split('T')[0];
  const activeAndUpcomingPrices = specialPrices.filter(p => !p.end_date || p.end_date >= now);
  const pastPrices = specialPrices.filter(p => p.end_date && p.end_date < now);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className={styles.container}>
      <h1>Gestión de Precios Especiales</h1>

      {/* Sección del Formulario (Crear/Editar) */}
      {canEdit && (
          <div className="form-container"> {/* Reutilizar estilo si existe */}
              <h3>{isFormVisible ? (editingPrice ? 'Editando Promoción' : 'Crear Nueva Promoción') : 'Crear Nueva Promoción'}</h3>
              {!isFormVisible &&
                <button className="admin-button-primary" onClick={() => { setEditingPrice(null); setIsFormVisible(true); }}>
                  + Añadir Promoción
                </button>
              }
              {isFormVisible && (
                <>
                  <SpecialPriceForm
                    products={products}
                    categories={categories}
                    onSubmit={handleFormSubmit}
                    initialData={editingPrice} // Pasar datos iniciales si se está editando
                  />
                   <button className="admin-button-secondary" style={{marginTop: '1rem'}} onClick={() => { setIsFormVisible(false); setEditingPrice(null); }}>
                    Cancelar
                  </button>
                </>
              )}
          </div>
      )}

      {/* Tabla de Promociones Activas y Próximas */}
      <div className={styles.table}>
        <h3>Promociones Activas y Próximas ({activeAndUpcomingPrices.length})</h3>
        <div className="table-wrapper"> {/* Reutilizar estilo si existe */}
          <table className="products-table"> {/* Reutilizar estilo si existe */}
            <thead>
              <tr>
                <th>Objetivo</th>
                <th>Precio Especial</th>
                <th>Vigencia</th>
                <th>Visible Para</th> {/* Nueva Columna */}
                <th>Motivo</th>
                {(canEdit || canDelete) && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {activeAndUpcomingPrices.length === 0 ? (
                <tr><td colSpan={(canEdit || canDelete) ? 6 : 5}>No hay promociones activas o futuras.</td></tr>
              ) : (
                activeAndUpcomingPrices.map(price => (
                  <tr key={price.id}>
                    <td>{getTargetName(price)}</td>
                    <td>${parseFloat(price.override_price).toFixed(2)}</td> {/* Asegurar formato */}
                    <td>{price.start_date} al {price.end_date}</td>
                    <td>{getAudience(price)}</td> {/* Mostrar audiencia */}
                    <td>{price.reason || '-'}</td>
                    {(canEdit || canDelete) && (
                        <td>
                          <div className={styles.actionsContainer}>
                              {canEdit && <button onClick={() => handleEdit(price)} className="admin-button-secondary">Editar</button>}
                              {canDelete && <button onClick={() => handleDelete(price)} className="admin-button-danger">Eliminar</button>}
                          </div>
                        </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabla de Promociones Pasadas */}
      <div className={styles.table}>
        <h3>Promociones Pasadas ({pastPrices.length})</h3>
         <div className="table-wrapper">
           <table className="products-table">
            <thead>
              <tr>
                <th>Objetivo</th>
                <th>Precio Especial</th>
                <th>Vigencia</th>
                <th>Visible Para</th> {/* Nueva Columna */}
                <th>Motivo</th>
                {/* No hay acciones para precios pasados */}
              </tr>
            </thead>
            <tbody>
              {pastPrices.length === 0 ? (
                 <tr><td colSpan="5">No hay promociones pasadas.</td></tr>
              ) : (
                  pastPrices.map(price => (
                    <tr key={price.id}>
                      <td>{getTargetName(price)}</td>
                      <td>${parseFloat(price.override_price).toFixed(2)}</td>
                      <td>{price.start_date} al {price.end_date}</td>
                      <td>{getAudience(price)}</td> {/* Mostrar audiencia */}
                      <td>{price.reason || '-'}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Confirmación para Eliminar */}
      <ConfirmModal
          isOpen={!!priceToDelete}
          onClose={() => setPriceToDelete(null)}
          onConfirm={confirmDelete}
          title="¿Confirmar Eliminación?"
        >
          ¿Estás seguro de que deseas eliminar la promoción para "{priceToDelete && getTargetName(priceToDelete)}"? Esta acción no se puede deshacer.
      </ConfirmModal>

    </div>
  );
};

export default SpecialPrices;
