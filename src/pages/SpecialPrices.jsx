import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { supabase } from '../lib/supabaseClient';
import SpecialPriceForm from '../components/SpecialPriceForm'; // <-- Asegúrate que la ruta sea correcta
import styles from './SpecialPrices.module.css';
import ConfirmModal from '../components/ConfirmModal';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAlert } from '../context/AlertContext';
import { useAdminAuth } from '../context/AdminAuthContext';

// ==================== COMPONENTES MEMOIZADOS ====================

// Componente de fila de tabla memoizado (sin cambios)
const PriceTableRow = memo(({
  price,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  getTargetName,
  getAudience
}) => {
  // ... (código existente del componente PriceTableRow) ...
  return (
    <tr>
      <td>{getTargetName(price)}</td>
      <td>${parseFloat(price.override_price).toFixed(2)}</td>
      <td>
        {price.start_date} al {price.end_date}
      </td>
      <td>{getAudience(price)}</td>
      <td>{price.reason || '-'}</td>
      {(canEdit || canDelete) && (
        <td className={styles.actions}>
          {canEdit && (
            <button
              onClick={() => onEdit(price)}
              className={styles.editButton}
              aria-label="Editar promoción"
            >
              ✏️ Editar
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDelete(price)}
              className={styles.deleteButton}
              aria-label="Eliminar promoción"
            >
              🗑️ Eliminar
            </button>
          )}
        </td>
      )}
    </tr>
  );
});
PriceTableRow.displayName = 'PriceTableRow';

// ==================== COMPONENTE PRINCIPAL ====================

const SpecialPrices = () => {
  const { showAlert } = useAlert();
  const { hasPermission } = useAdminAuth();

  const [specialPrices, setSpecialPrices] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPrice, setEditingPrice] = useState(null);
  const [isFormVisible, setIsFormVisible] = useState(false); // Estado para mostrar/ocultar formulario
  const [priceToDelete, setPriceToDelete] = useState(null);

  const canEdit = hasPermission('special-prices.edit');
  const canDelete = hasPermission('special-prices.delete');

  // Fetch data (sin cambios)
  const fetchData = useCallback(async () => {
    // ... (código existente de fetchData) ...
     setLoading(true);
    try {
      const [pricesRes, productsRes, categoriesRes] = await Promise.all([
        supabase.rpc('get_special_prices_with_details'),
        supabase
          .from('products')
          .select('id, name')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('categories')
          .select('id, name')
          .order('name')
      ]);

      if (pricesRes.error) throw pricesRes.error;
      if (productsRes.error) throw productsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;

      const adaptedPrices = pricesRes.data.map(price => ({
        ...price,
        products: price.product_name ? { name: price.product_name } : null,
        categories: price.category_name ? { name: price.category_name } : null
      }));

      setSpecialPrices(adaptedPrices);
      setProducts(productsRes.data || []);
      setCategories(categoriesRes.data || []);

    } catch (error) {
      console.error('Fetch error:', error);
      showAlert(`Error al cargar datos: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime (sin cambios)
  useEffect(() => {
    // ... (código existente del listener de realtime) ...
    const channel = supabase
      .channel('special-prices-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'special_prices',
          select: 'id, product_id, category_id, override_price, start_date, end_date, reason, target_customer_ids'
        },
        (payload) => {
          console.log('Special price change detected:', payload);

          if (payload.eventType === 'INSERT') {
            fetchData(); // Necesita refetch para traer relaciones
          } else if (payload.eventType === 'UPDATE') {
            setSpecialPrices(prev => prev.map(price =>
              price.id === payload.new.id
                ? { ...price, ...payload.new } // Actualizar con nuevos datos
                : price
            ));
             // Si se estaba editando este precio, actualizar initialData del form
             if (editingPrice?.id === payload.new.id) {
               // Necesitamos buscar las relaciones actualizadas si cambiaron
               fetchData(); // Refetch para asegurar relaciones correctas
             }
          } else if (payload.eventType === 'DELETE') {
            setSpecialPrices(prev => prev.filter(price => price.id !== payload.old.id));
            if (editingPrice?.id === payload.old.id) {
                 setIsFormVisible(false); // Ocultar form si se elimina el que se editaba
                 setEditingPrice(null);
             }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData, editingPrice]); // <-- Añadir editingPrice como dependencia

  // Handlers (sin cambios)
  const handleFormSubmit = useCallback(() => {
    // ... (código existente de handleFormSubmit) ...
    fetchData();
    setIsFormVisible(false);
    setEditingPrice(null);
  }, [fetchData]);

  const handleEdit = useCallback((price) => {
    // ... (código existente de handleEdit) ...
    if (!canEdit) return;
    setEditingPrice(price);
    setIsFormVisible(true);
  }, [canEdit]);

  const handleDelete = useCallback((price) => {
    // ... (código existente de handleDelete) ...
    if (!canDelete) return;
    setPriceToDelete(price);
  }, [canDelete]);

  const confirmDelete = useCallback(async () => {
    // ... (código existente de confirmDelete) ...
    if (!priceToDelete || !canDelete) return;

    try {
      const { error } = await supabase
        .from('special_prices')
        .delete()
        .eq('id', priceToDelete.id);

      if (error) throw error;

      showAlert('Promoción eliminada con éxito.', 'success');
      setSpecialPrices(prev => prev.filter(p => p.id !== priceToDelete.id));

    } catch (error) {
      console.error('Delete error:', error);
      showAlert(`Error al eliminar: ${error.message}`);
    } finally {
      setPriceToDelete(null);
    }
  }, [priceToDelete, canDelete, showAlert]);

  // Funciones auxiliares (sin cambios)
  const getTargetName = useCallback((price) => {
    // ... (código existente de getTargetName) ...
      if (price.product_id && price.products) {
      return `Producto: ${price.products.name}`;
    }
    if (price.category_id && price.categories) {
      return `Categoría: ${price.categories.name}`;
    }
    if (price.product_id) {
      return `Producto (ID: ${price.product_id.substring(0, 6)}...)`;
    }
    if (price.category_id) {
      return `Categoría (ID: ${price.category_id.substring(0, 6)}...)`;
    }
    return 'N/A';
  }, []);

  const getAudience = useCallback((price) => {
    // ... (código existente de getAudience) ...
      if (price.target_customer_ids === null || price.target_customer_ids?.length === 0) {
      return "Todos";
    }
    const count = price.target_customer_ids.length;
    return `Específicos (${count})`;
  }, []);

  // Separación de listas (sin cambios)
  const { activeAndUpcomingPrices, pastPrices } = useMemo(() => {
    // ... (código existente de useMemo) ...
     const now = new Date().toISOString().split('T')[0];
    const active = specialPrices.filter(p => !p.end_date || p.end_date >= now);
    const past = specialPrices.filter(p => p.end_date && p.end_date < now);
    return { activeAndUpcomingPrices: active, pastPrices: past };
  }, [specialPrices]);

  // Estadísticas (sin cambios)
  const stats = useMemo(() => {
    // ... (código existente de useMemo para stats) ...
      const now = new Date().toISOString().split('T')[0];
    return {
      total: specialPrices.length,
      active: activeAndUpcomingPrices.length,
      past: pastPrices.length,
      forAll: specialPrices.filter(p =>
        !p.target_customer_ids || p.target_customer_ids.length === 0
      ).length
    };
  }, [specialPrices, activeAndUpcomingPrices, pastPrices]);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1>Precios Especiales</h1>
          <p className={styles.subtitle}>
            {stats.total} promociones totales • {stats.active} activas • {stats.forAll} para todos
          </p>
        </div>
        {canEdit && (
          <button
            // Modificado: Ahora solo alterna la visibilidad del formulario
            onClick={() => {
              setIsFormVisible(!isFormVisible);
              // Si se estaba editando y se cierra, limpiar el estado de edición
              if (isFormVisible) {
                setEditingPrice(null);
              }
            }}
            className={styles.addButton}
          >
            {isFormVisible ? '➖ Ocultar Formulario' : '+ Nueva Promoción'}
          </button>
        )}
      </div>

      {/* --- MOVIDO: Renderizado condicional del formulario aquí --- */}
      {isFormVisible && (
        <section className={styles.section}> {/* Envuelve el formulario en una sección */}
          <h2>{editingPrice ? 'Editar Promoción' : 'Crear Nueva Promoción'}</h2>
          <SpecialPriceForm
            // isOpen ya no es necesario pasarlo al componente hijo si no lo usa internamente
            onClose={() => { // onClose ahora solo oculta y resetea
              setIsFormVisible(false);
              setEditingPrice(null);
            }}
            onSubmit={handleFormSubmit}
            products={products}
            categories={categories}
            initialData={editingPrice} // Cambiado a initialData
          />
        </section>
      )}
      {/* --- FIN MOVIDO --- */}


      {/* Tabla de Promociones Activas/Futuras */}
      <section className={styles.section}>
        <h2>Promociones Activas y Futuras</h2>
        <div className={styles.tableWrapper}>
          <table className={styles.pricesTable}>
            <thead>
              <tr>
                <th>Objetivo</th>
                <th>Precio Especial</th>
                <th>Vigencia</th>
                <th>Visible Para</th>
                <th>Motivo</th>
                {(canEdit || canDelete) && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {activeAndUpcomingPrices.length === 0 ? (
                <tr>
                  <td
                    colSpan={(canEdit || canDelete) ? 6 : 5}
                    className={styles.emptyMessage}
                  >
                    No hay promociones activas o futuras.
                  </td>
                </tr>
              ) : (
                activeAndUpcomingPrices.map(price => (
                  <PriceTableRow
                    key={price.id}
                    price={price}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    onEdit={handleEdit} // Sigue funcionando igual, abre el form y pasa los datos
                    onDelete={handleDelete}
                    getTargetName={getTargetName}
                    getAudience={getAudience}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tabla de Promociones Pasadas */}
      {pastPrices.length > 0 && (
        <section className={styles.section}>
          {/* ... (código existente de la tabla de promociones pasadas) ... */}
            <h2>Promociones Pasadas</h2>
          <div className={styles.tableWrapper}>
            <table className={styles.pricesTable}>
              <thead>
                <tr>
                  <th>Objetivo</th>
                  <th>Precio Especial</th>
                  <th>Vigencia</th>
                  <th>Visible Para</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {pastPrices.map(price => (
                  <tr key={price.id}>
                    <td>{getTargetName(price)}</td>
                    <td>${parseFloat(price.override_price).toFixed(2)}</td>
                    <td>{price.start_date} al {price.end_date}</td>
                    <td>{getAudience(price)}</td>
                    <td>{price.reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* --- ELIMINADO: Modal de Formulario (ahora se renderiza inline) --- */}
      {/* {isFormVisible && ( ... )} */}

      {/* Modal de Confirmación (sin cambios) */}
      <ConfirmModal
        isOpen={!!priceToDelete}
        onClose={() => setPriceToDelete(null)}
        onConfirm={confirmDelete}
        title="Eliminar Promoción"
        message={`¿Estás seguro de que deseas eliminar esta promoción? Esta acción no se puede deshacer.`}
      />
    </div>
  );
};

export default SpecialPrices;