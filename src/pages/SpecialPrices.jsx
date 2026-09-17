/* src/pages/SpecialPrices.jsx (Fase 2 - Modernizado con Modal, Filtros y Paginación) */

import React, { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import SpecialPriceModal from '../components/SpecialPriceModal';
import styles from './SpecialPrices.module.css';
import ConfirmModal from '../components/ConfirmModal';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAlert } from '../context/AlertContext';
import { useAdminAuth } from '../context/AdminAuthContext';
import { useCategoriesCache } from '../hooks/useCategoriesCache';
import { useAdminProductsBasic } from '../hooks/useAdminProductsBasic';
import { useCustomersBasicCache } from '../hooks/useCustomersBasicCache';
import { subscribeToTableChanges } from '../lib/sharedAdminRealtime';
import { useAdminCache } from '../hooks/useAdminCache';
import { useCacheAdmin } from '../context/CacheAdminContext';
import { broadcastStoreChange } from '../lib/broadcastRealtime';
import { exportToCSV } from '../utils/exportUtils';
import {
  Pencil,
  Plus,
  Trash2,
  Power,
  Search,
  Download,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import {
  getLocalDateString,
  getSpecialPriceBadgeInfo,
  getSpecialPriceStatus,
  filterSpecialPrices
} from '../lib/specialPriceCalculations';

const fetchSpecialPrices = async () => {
  const pricesRes = await supabase.rpc('get_special_prices_with_details');
  if (pricesRes.error) throw pricesRes.error;
  return (pricesRes.data || []).map(price => ({
    ...price,
    products: price.product_name ? { name: price.product_name } : null,
    categories: price.category_name ? { name: price.category_name } : null
  }));
};

const PriceTableRow = memo(({
  price,
  canEdit,
  canDelete,
  onToggle,
  onEdit,
  onDelete,
  getTargetName,
  getAudience,
  today
}) => {
  const badgeInfo = getSpecialPriceBadgeInfo(price, today);
  const isPaused = badgeInfo.key === 'paused';
  const isExpired = badgeInfo.key === 'expired';

  return (
    <tr>
      <td>{getTargetName(price)}</td>
      <td className={styles.priceHighlight}>${parseFloat(price.override_price).toFixed(2)}</td>
      <td>
        {price.start_date} al {price.end_date}
      </td>
      <td>
        <span
          className={`${styles.statusBadge} ${
            badgeInfo.key === 'active'
              ? styles.statusActive
              : badgeInfo.key === 'scheduled'
              ? styles.statusScheduled
              : badgeInfo.key === 'paused'
              ? styles.statusPaused
              : styles.statusExpired
          }`}
        >
          {badgeInfo.label}
        </span>
      </td>
      <td>{getAudience(price)}</td>
      <td>{price.reason || '-'}</td>
      {(canEdit || canDelete) && (
        <td className={styles.actions}>
          {canEdit && !isExpired && (
            <button
              onClick={() => onToggle(price)}
              className={`${styles.toggleButton} ${isPaused ? styles.isPaused : ''}`}
              aria-label={isPaused ? 'Activar promoción' : 'Pausar promoción'}
              title={isPaused ? 'Activar promoción' : 'Pausar promoción'}
            >
              <Power size={13} aria-hidden="true" /> {isPaused ? 'Activar' : 'Pausar'}
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => onEdit(price)}
              className={styles.editButton}
              aria-label="Editar promoción"
            >
              <Pencil size={13} aria-hidden="true" /> Editar
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDelete(price)}
              className={styles.deleteButton}
              aria-label="Eliminar promoción"
            >
              <Trash2 size={13} aria-hidden="true" /> Eliminar
            </button>
          )}
        </td>
      )}
    </tr>
  );
});
PriceTableRow.displayName = 'PriceTableRow';


const SpecialPrices = () => {
  const { showAlert } = useAlert();
  const { hasPermission } = useAdminAuth();
  const { DEFAULT_TTL, invalidate } = useCacheAdmin();

  // Categorías, Productos y Clientes desde Caché
  const { data: categoriesData } = useCategoriesCache();
  const categories = useMemo(() => categoriesData || [], [categoriesData]);

  const { data: productsData } = useAdminProductsBasic();
  const products = useMemo(() => productsData || [], [productsData]);

  const { data: customersData } = useCustomersBasicCache();
  const customers = useMemo(() => customersData || [], [customersData]);

  // Precios especiales desde caché
  const {
    data: cachedPrices,
    isLoading: loadingPrices,
    refetch: refetchPrices,
  } = useAdminCache('special_prices:all', fetchSpecialPrices, {
    ttl: DEFAULT_TTL.MEDIUM,
    staleWhileRevalidate: true
  });

  const [localPrices, setLocalPrices] = useState(null);
  const specialPrices = useMemo(() => localPrices || cachedPrices || [], [localPrices, cachedPrices]);

  useEffect(() => {
    if (cachedPrices) setLocalPrices(cachedPrices);
  }, [cachedPrices]);

  const [editingPrice, setEditingPrice] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [priceToDelete, setPriceToDelete] = useState(null);
  const editingPriceRef = useRef(editingPrice);

  useEffect(() => {
    editingPriceRef.current = editingPrice;
  }, [editingPrice]);

  // Filtros, búsqueda y pestañas
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'paused' | 'past' | 'all'
  const [searchTerm, setSearchTerm] = useState('');
  const [targetFilter, setTargetFilter] = useState('all'); // 'all' | 'product' | 'category'
  const [audienceFilter, setAudienceFilter] = useState('all'); // 'all' | 'everyone' | 'specific'

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab, targetFilter, audienceFilter]);

  const canEdit = hasPermission('special-prices.edit');
  const canDelete = hasPermission('special-prices.delete');

  // Realtime mediante Canal Compartido
  useEffect(() => {
    const unsubscribe = subscribeToTableChanges('special_prices', (payload) => {
      console.log('[SpecialPrices] Cambio detectado (Shared Realtime):', payload);
      setLocalPrices(null);
      invalidate('special_prices:all');
      refetchPrices?.();
      if (editingPriceRef.current?.id === payload.old?.id && payload.eventType === 'DELETE') {
        setIsModalOpen(false);
        setEditingPrice(null);
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [invalidate, refetchPrices]);

  const handleModalSubmit = useCallback(() => {
    setLocalPrices(null);
    invalidate('special_prices:all');
    refetchPrices?.();
    broadcastStoreChange('special_prices_updated', { action: 'save' });
    setIsModalOpen(false);
    setEditingPrice(null);
  }, [invalidate, refetchPrices]);

  const handleOpenCreateModal = useCallback(() => {
    if (!canEdit) return;
    setEditingPrice(null);
    setIsModalOpen(true);
  }, [canEdit]);

  const handleEdit = useCallback((price) => {
    if (!canEdit) return;
    setEditingPrice(price);
    setIsModalOpen(true);
  }, [canEdit]);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingPrice(null);
  }, []);

  const handleDelete = useCallback((price) => {
    if (!canDelete) return;
    setPriceToDelete(price);
  }, [canDelete]);

  // Alternar Activo / Pausado mediante RPC
  const handleToggleActive = useCallback(async (price) => {
    if (!canEdit) return;
    const newActiveState = !price.is_active;
    try {
      const { error } = await supabase.rpc('admin_toggle_special_price', {
        p_id: price.id,
        p_is_active: newActiveState
      });
      if (error) throw error;
      showAlert(`Promoción ${newActiveState ? 'activada' : 'pausada'} con éxito.`, 'success');
      setLocalPrices(prev => (prev || specialPrices).map(p => p.id === price.id ? { ...p, is_active: newActiveState } : p));
      invalidate('special_prices:all');
      broadcastStoreChange('special_prices_updated', { action: 'toggle', id: price.id });
    } catch (error) {
      console.error('Toggle error:', error);
      showAlert(`Error al cambiar estado: ${error.message}`);
    }
  }, [canEdit, showAlert, specialPrices, invalidate]);

  // Eliminación mediante RPC segura
  const confirmDelete = useCallback(async () => {
    if (!priceToDelete || !canDelete) return;
    try {
      const { error } = await supabase.rpc('admin_delete_special_price', {
        p_id: priceToDelete.id
      });
      if (error) throw error;
      showAlert('Promoción eliminada con éxito.', 'success');
      setLocalPrices(prev => (prev || specialPrices).filter(p => p.id !== priceToDelete.id));
      invalidate('special_prices:all');
      refetchPrices?.();
      broadcastStoreChange('special_prices_updated', { action: 'delete' });
    } catch (error) {
      console.error('Delete error:', error);
      showAlert(`Error al eliminar: ${error.message}`);
    } finally {
      setPriceToDelete(null);
    }
  }, [priceToDelete, canDelete, showAlert, invalidate, refetchPrices, specialPrices]);

  const getTargetName = useCallback((price) => {
    if (price.product_id && (price.products?.name || price.product_name)) {
      return `Producto: ${price.products?.name || price.product_name}`;
    }
    if (price.category_id && (price.categories?.name || price.category_name)) {
      return `Categoría: ${price.categories?.name || price.category_name}`;
    }
    if (price.product_id) {
      const prod = products.find(p => p.id === price.product_id);
      return `Producto: ${prod ? prod.name : `ID: ${price.product_id.substring(0, 6)}...`}`;
    }
    if (price.category_id) {
      const cat = categories.find(c => c.id === price.category_id);
      return `Categoría: ${cat ? cat.name : `ID: ${price.category_id.substring(0, 6)}...`}`;
    }
    return 'N/A';
  }, [categories, products]);

  const getAudience = useCallback((price) => {
    if (price.target_customer_ids === null || price.target_customer_ids?.length === 0) {
      return "Todos";
    }
    const count = price.target_customer_ids.length;
    return `Específicos (${count})`;
  }, []);

  // Clasificación de fechas en tiempo local de la tienda
  const today = useMemo(() => getLocalDateString(), []);

  // Métricas para cabecera y tabs
  const stats = useMemo(() => {
    let activeCount = 0;
    let scheduledCount = 0;
    let pausedCount = 0;
    let expiredCount = 0;

    specialPrices.forEach(p => {
      const status = getSpecialPriceStatus(p, today);
      if (status === 'paused') pausedCount++;
      else if (status === 'scheduled') scheduledCount++;
      else if (status === 'active') activeCount++;
      else if (status === 'expired') expiredCount++;
    });

    return {
      total: specialPrices.length,
      active: activeCount,
      scheduled: scheduledCount,
      activeAndScheduled: activeCount + scheduledCount,
      paused: pausedCount,
      expired: expiredCount,
    };
  }, [specialPrices, today]);

  // Lista filtrada
  const filteredPrices = useMemo(() => {
    return filterSpecialPrices(specialPrices, {
      search: searchTerm,
      tab: activeTab,
      targetType: targetFilter,
      audience: audienceFilter,
      today,
    });
  }, [specialPrices, searchTerm, activeTab, targetFilter, audienceFilter, today]);

  // Paginación
  const totalPages = Math.max(1, Math.ceil(filteredPrices.length / pageSize));
  const paginatedPrices = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPrices.slice(start, start + pageSize);
  }, [filteredPrices, currentPage, pageSize]);

  // Exportar a CSV
  const handleExportCSV = useCallback(() => {
    if (!filteredPrices.length) {
      showAlert('No hay datos disponibles para exportar con los filtros seleccionados.');
      return;
    }

    const csvData = filteredPrices.map(price => {
      const badge = getSpecialPriceBadgeInfo(price, today);
      return {
        'ID': price.id,
        'Objetivo': getTargetName(price),
        'Precio Especial': parseFloat(price.override_price).toFixed(2),
        'Fecha Inicio': price.start_date,
        'Fecha Fin': price.end_date,
        'Estado': badge.label,
        'Activo': price.is_active ? 'Sí' : 'No',
        'Audiencia': getAudience(price),
        'Clientes Específicos': price.target_customer_ids?.length || 0,
        'Motivo': price.reason || ''
      };
    });

    exportToCSV(csvData, `precios_especiales_${activeTab}_${today}.csv`);
    showAlert(`Se exportaron ${csvData.length} promociones a CSV con éxito.`, 'success');
  }, [filteredPrices, activeTab, today, getTargetName, getAudience, showAlert]);

  if (loadingPrices && specialPrices.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1>Precios Especiales</h1>
          <p className={styles.subtitle}>
            {stats.total} promociones totales • {stats.active} vigentes • {stats.scheduled} programadas • {stats.paused} pausadas
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            onClick={handleExportCSV}
            className={styles.exportButton}
            title="Exportar listado actual a archivo CSV"
            aria-label="Exportar a CSV"
            disabled={filteredPrices.length === 0}
          >
            <Download size={15} aria-hidden="true" /> Exportar CSV
          </button>
          {canEdit && (
            <button
              onClick={handleOpenCreateModal}
              className={styles.addButton}
              aria-label="Crear nueva promoción"
            >
              <Plus size={17} aria-hidden="true" /> Nueva Promoción
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabsContainer} role="tablist" aria-label="Filtrar por estado">
        <button
          role="tab"
          aria-selected={activeTab === 'active'}
          className={`${styles.tabButton} ${activeTab === 'active' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('active')}
        >
          Activas y Programadas
          <span className={styles.tabBadge}>{stats.activeAndScheduled}</span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'paused'}
          className={`${styles.tabButton} ${activeTab === 'paused' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('paused')}
        >
          Pausadas
          <span className={styles.tabBadge}>{stats.paused}</span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'past'}
          className={`${styles.tabButton} ${activeTab === 'past' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('past')}
        >
          Historial / Expiradas
          <span className={styles.tabBadge}>{stats.expired}</span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'all'}
          className={`${styles.tabButton} ${activeTab === 'all' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('all')}
        >
          Todas
          <span className={styles.tabBadge}>{stats.total}</span>
        </button>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div className={styles.controlsBar}>
        <div className={styles.searchWrapper}>
          <Search size={16} className={styles.searchIcon} aria-hidden="true" />
          <input
            type="text"
            placeholder="Buscar por producto, categoría, motivo o precio..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.searchInput}
            aria-label="Buscar promociones"
          />
        </div>

        <div className={styles.filterGroup}>
          <select
            value={targetFilter}
            onChange={(e) => setTargetFilter(e.target.value)}
            className={styles.filterSelect}
            aria-label="Filtrar por tipo de objetivo"
          >
            <option value="all">Todos los objetivos</option>
            <option value="product">Solo Productos</option>
            <option value="category">Solo Categorías</option>
          </select>

          <select
            value={audienceFilter}
            onChange={(e) => setAudienceFilter(e.target.value)}
            className={styles.filterSelect}
            aria-label="Filtrar por audiencia"
          >
            <option value="all">Toda la audiencia</option>
            <option value="everyone">Público general</option>
            <option value="specific">Clientes específicos</option>
          </select>
        </div>
      </div>

      {/* Tabla */}
      <section className={styles.section}>
        <div className={styles.tableWrapper}>
          <table className={styles.pricesTable}>
            <thead>
              <tr>
                <th>Objetivo</th>
                <th>Precio Especial</th>
                <th>Vigencia</th>
                <th>Estado</th>
                <th>Visible Para</th>
                <th>Motivo</th>
                {(canEdit || canDelete) && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filteredPrices.length === 0 ? (
                <tr>
                  <td
                    colSpan={(canEdit || canDelete) ? 7 : 6}
                    className={styles.emptyMessage}
                  >
                    {searchTerm || targetFilter !== 'all' || audienceFilter !== 'all'
                      ? 'No se encontraron promociones con los filtros aplicados.'
                      : 'No hay promociones en esta sección.'}
                  </td>
                </tr>
              ) : (
                paginatedPrices.map(price => (
                  <PriceTableRow
                    key={price.id}
                    price={price}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    onToggle={handleToggleActive}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    getTargetName={getTargetName}
                    getAudience={getAudience}
                    today={today}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {filteredPrices.length > 0 && (
          <div className={styles.paginationBar}>
            <div>
              Mostrando {Math.min((currentPage - 1) * pageSize + 1, filteredPrices.length)} a{' '}
              {Math.min(currentPage * pageSize, filteredPrices.length)} de {filteredPrices.length} promociones
            </div>
            {totalPages > 1 && (
              <div className={styles.paginationControls}>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className={styles.pageBtn}
                  aria-label="Página anterior"
                >
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`${styles.pageBtn} ${currentPage === page ? styles.pageBtnActive : ''}`}
                    aria-label={`Ir a página ${page}`}
                    aria-current={currentPage === page ? 'page' : undefined}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className={styles.pageBtn}
                  aria-label="Página siguiente"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Modal Modernizado */}
      <SpecialPriceModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        initialData={editingPrice}
        onSubmit={handleModalSubmit}
        products={products}
        categories={categories}
        customers={customers}
      />

      {/* Modal de Confirmación de Eliminación */}
      <ConfirmModal
        isOpen={!!priceToDelete}
        onClose={() => setPriceToDelete(null)}
        onConfirm={confirmDelete}
        title="Eliminar Promoción"
        message="¿Estás seguro de que deseas eliminar esta promoción? Esta acción no se puede deshacer."
      />
    </div>
  );
};

export default SpecialPrices;
