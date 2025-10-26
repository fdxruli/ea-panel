import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { supabase } from '../lib/supabaseClient';
import SpecialPriceForm from '../components/SpecialPriceForm';
import styles from './SpecialPrices.module.css';
import ConfirmModal from '../components/ConfirmModal';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAlert } from '../context/AlertContext';
import { useAdminAuth } from '../context/AdminAuthContext';

// ==================== COMPONENTES MEMOIZADOS ====================

// Componente de fila de tabla memoizado
const PriceTableRow = memo(({
  price,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  getTargetName,
  getAudience
}) => {
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
}, (prevProps, nextProps) => {
  // Comparación personalizada para evitar re-renders innecesarios
  return (
    prevProps.price.id === nextProps.price.id &&
    prevProps.price.override_price === nextProps.price.override_price &&
    prevProps.price.start_date === nextProps.price.start_date &&
    prevProps.price.end_date === nextProps.price.end_date &&
    prevProps.canEdit === nextProps.canEdit &&
    prevProps.canDelete === nextProps.canDelete
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
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [priceToDelete, setPriceToDelete] = useState(null);

  const canEdit = hasPermission('special-prices.edit');
  const canDelete = hasPermission('special-prices.delete');

  // ✅ OPTIMIZACIÓN: Fetch con filtrado en el servidor
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pricesRes, productsRes, categoriesRes] = await Promise.all([
        // Usar RPC optimizada
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

      // Adaptar datos de RPC
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

  // ✅ OPTIMIZACIÓN: Realtime selectivo sin refetch completo
  useEffect(() => {
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
            // Agregar nuevo precio a la lista
            fetchData(); // Necesita refetch para traer relaciones
          } else if (payload.eventType === 'UPDATE') {
            // Actualizar precio existente
            setSpecialPrices(prev => prev.map(price =>
              price.id === payload.new.id
                ? { ...price, ...payload.new }
                : price
            ));
          } else if (payload.eventType === 'DELETE') {
            // Eliminar de la lista
            setSpecialPrices(prev => prev.filter(price => price.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  // Handlers memoizados
  const handleFormSubmit = useCallback(() => {
    fetchData();
    setIsFormVisible(false);
    setEditingPrice(null);
  }, [fetchData]);

  const handleEdit = useCallback((price) => {
    if (!canEdit) return;
    setEditingPrice(price);
    setIsFormVisible(true);
  }, [canEdit]);

  const handleDelete = useCallback((price) => {
    if (!canDelete) return;
    setPriceToDelete(price);
  }, [canDelete]);

  const confirmDelete = useCallback(async () => {
    if (!priceToDelete || !canDelete) return;

    try {
      const { error } = await supabase
        .from('special_prices')
        .delete()
        .eq('id', priceToDelete.id);

      if (error) throw error;

      showAlert('Promoción eliminada con éxito.', 'success');

      // Actualización optimista
      setSpecialPrices(prev => prev.filter(p => p.id !== priceToDelete.id));

    } catch (error) {
      console.error('Delete error:', error);
      showAlert(`Error al eliminar: ${error.message}`);
    } finally {
      setPriceToDelete(null);
    }
  }, [priceToDelete, canDelete, showAlert]);

  // ✅ Funciones auxiliares memoizadas
  const getTargetName = useCallback((price) => {
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
    if (price.target_customer_ids === null || price.target_customer_ids?.length === 0) {
      return "Todos";
    }
    const count = price.target_customer_ids.length;
    return `Específicos (${count})`;
  }, []);

  // ✅ OPTIMIZACIÓN: Separación de listas con useMemo
  const { activeAndUpcomingPrices, pastPrices } = useMemo(() => {
    const now = new Date().toISOString().split('T')[0];

    const active = specialPrices.filter(p =>
      !p.end_date || p.end_date >= now
    );

    const past = specialPrices.filter(p =>
      p.end_date && p.end_date < now
    );

    return {
      activeAndUpcomingPrices: active,
      pastPrices: past
    };
  }, [specialPrices]);

  // ✅ Estadísticas memoizadas
  const stats = useMemo(() => {
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
            onClick={() => setIsFormVisible(true)}
            className={styles.addButton}
          >
            + Nueva Promoción
          </button>
        )}
      </div>

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
                    onEdit={handleEdit}
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

      {/* Modal de Formulario */}
      {isFormVisible && (
        <SpecialPriceForm
          isOpen={isFormVisible}
          onClose={() => {
            setIsFormVisible(false);
            setEditingPrice(null);
          }}
          onSubmit={handleFormSubmit}
          products={products}
          categories={categories}
          editingPrice={editingPrice}
        />
      )}

      {/* Modal de Confirmación */}
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
