/* src/components/CustomerLoyaltyTiersSection.jsx */
import React, { useState, useMemo, useCallback } from 'react';
import { useLoyaltyTiersCache } from '../hooks/useLoyaltyTiersCache';
import { createLoyaltyTier, updateLoyaltyTier, deleteLoyaltyTier, toggleLoyaltyTierStatus } from '../services/loyaltyTierService';
import { useAlert } from '../context/AlertContext';
import { useCacheAdmin } from '../context/CacheAdminContext';
import { broadcastStoreChange } from '../lib/broadcastRealtime';
import LoadingSpinner from './LoadingSpinner';
import styles from './CustomerLoyaltyTiersSection.module.css';
import {
  Crown,
  Star,
  Sparkles,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Layers,
  TrendingUp,
  ShoppingBag,
  Calendar,
  AlertTriangle,
  Award,
  Power
} from 'lucide-react';

const COLOR_PRESETS = [
  { label: 'Dorado', value: '#eab308' },
  { label: 'Azul Cielo', value: '#38bdf8' },
  { label: 'Púrpura', value: '#a855f7' },
  { label: 'Esmeralda', value: '#10b981' },
  { label: 'Rubí / Rosa', value: '#f43f5e' },
  { label: 'Ámbar', value: '#f59e0b' },
  { label: 'Plata / Gris', value: '#94a3b8' },
  { label: 'Índigo', value: '#6366f1' }
];

export default function CustomerLoyaltyTiersSection() {
  const { showAlert } = useAlert();
  const { invalidate } = useCacheAdmin();
  const { data: tiersData, isLoading, refetch } = useLoyaltyTiersCache();
  const tiers = useMemo(() => tiersData || [], [tiersData]);

  // Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTier, setEditingTier] = useState(null);
  const [deletingTier, setDeletingTier] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingTierId, setTogglingTierId] = useState(null);

  // Formulario
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    min_orders: '0',
    min_spent: '0',
    period_days: '90',
    rank_priority: '10',
    color: '#eab308',
    badge_text: '',
    benefit_description: '',
    is_active: true,
    is_default: false
  });

  // KPIs
  const kpis = useMemo(() => {
    const total = tiers.length;
    const active = tiers.filter(t => t.is_active).length;
    const highestTier = tiers.find(t => !t.is_default && t.is_active) || tiers[0];
    return {
      total,
      active,
      highestTierName: highestTier ? highestTier.name : 'N/A'
    };
  }, [tiers]);

  const handleOpenCreateModal = useCallback(() => {
    setEditingTier(null);
    setFormData({
      name: '',
      slug: '',
      min_orders: '5',
      min_spent: '1000',
      period_days: '90',
      rank_priority: String((tiers.length + 1) * 10),
      color: '#a855f7',
      badge_text: '',
      benefit_description: '',
      is_active: true,
      is_default: false
    });
    setIsModalOpen(true);
  }, [tiers.length]);

  const handleOpenEditModal = useCallback((tier) => {
    setEditingTier(tier);
    setFormData({
      name: tier.name || '',
      slug: tier.slug || '',
      min_orders: String(tier.min_orders ?? 0),
      min_spent: String(tier.min_spent ?? 0),
      period_days: String(tier.period_days ?? 90),
      rank_priority: String(tier.rank_priority ?? 0),
      color: tier.color || '#eab308',
      badge_text: tier.badge_text || '',
      benefit_description: tier.benefit_description || '',
      is_active: Boolean(tier.is_active),
      is_default: Boolean(tier.is_default)
    });
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingTier(null);
  }, []);

  const handleNameChange = useCallback((newName) => {
    setFormData(prev => {
      // Auto-generar slug si estamos creando un nuevo nivel
      if (!editingTier) {
        const autoSlug = newName
          .toLowerCase()
          .trim()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9_-]/g, '_')
          .replace(/_+/g, '_');

        return {
          ...prev,
          name: newName,
          slug: autoSlug,
          badge_text: prev.badge_text || newName
        };
      }
      return { ...prev, name: newName };
    });
  }, [editingTier]);

  const handleSaveTier = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showAlert('El nombre del nivel es obligatorio.', 'warning');
      return;
    }
    if (!formData.slug.trim()) {
      showAlert('El identificador (slug) es obligatorio.', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      if (editingTier) {
        await updateLoyaltyTier(editingTier.id, formData);
        showAlert(`Nivel "${formData.name}" actualizado correctamente.`, 'success');
      } else {
        await createLoyaltyTier(formData);
        showAlert(`Nivel "${formData.name}" creado con éxito.`, 'success');
      }

      invalidate('customer_loyalty_tiers_admin');
      broadcastStoreChange('loyalty_tiers_updated');
      await refetch();
      handleCloseModal();
    } catch (err) {
      console.error('Error guardando nivel de cliente:', err);
      showAlert(`Error: ${err.message || 'No se pudo guardar el nivel'}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (tier) => {
    if (togglingTierId) return;
    setTogglingTierId(tier.id);
    try {
      const nextState = !tier.is_active;
      await toggleLoyaltyTierStatus(tier.id, nextState);
      showAlert(`Nivel "${tier.name}" ${nextState ? 'activado' : 'pausado'}.`, 'success');
      invalidate('customer_loyalty_tiers_admin');
      broadcastStoreChange('loyalty_tiers_updated');
      await refetch();
    } catch (err) {
      showAlert(`Error al cambiar estado: ${err.message}`, 'error');
    } finally {
      setTogglingTierId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingTier || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteLoyaltyTier(deletingTier.id);
      showAlert(`Nivel "${deletingTier.name}" eliminado correctamente.`, 'success');
      invalidate('customer_loyalty_tiers_admin');
      broadcastStoreChange('loyalty_tiers_updated');
      await refetch();
      setDeletingTier(null);
    } catch (err) {
      showAlert(`Error al eliminar: ${err.message}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const renderTierIcon = (tier) => {
    if (tier.rank_priority >= 100 || tier.slug === 'vip') {
      return <Crown size={20} style={{ color: tier.color || '#eab308' }} />;
    }
    if (tier.rank_priority >= 50 || tier.slug === 'frecuente') {
      return <Star size={20} style={{ color: tier.color || '#38bdf8' }} />;
    }
    if (tier.is_default) {
      return <Layers size={20} style={{ color: tier.color || '#94a3b8' }} />;
    }
    return <Award size={20} style={{ color: tier.color || '#a855f7' }} />;
  };

  if (isLoading && tiers.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <div className={styles.sectionContainer}>
      {/* TOP BANNER */}
      <div className={styles.topBanner}>
        <div className={styles.topBannerInfo}>
          <h2 className={styles.topBannerTitle}>
            <Crown size={22} style={{ color: '#eab308' }} />
            Niveles de Clientes y Categorías de Fidelización
          </h2>
          <p className={styles.topBannerDesc}>
            Administra los niveles de lealtad. Define las metas de gasto y pedidos mínimos.
            El sistema evalúa las compras automáticamente en tiempo real.
            Todos los niveles activos estarán disponibles al crear y asignar productos exclusivos en la sección de Productos.
          </p>
        </div>
        <div className={styles.topBannerActions}>
          <button
            type="button"
            className={styles.createTierBtn}
            onClick={handleOpenCreateModal}
          >
            <Plus size={16} /> + Nuevo Nivel
          </button>
        </div>
      </div>

      {/* KPIS */}
      <div className={styles.kpisGrid}>
        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIcon} ${styles.kpiIconBlue}`}>
            <Layers size={20} />
          </div>
          <div className={styles.kpiMeta}>
            <span className={styles.kpiLabel}>Total Niveles</span>
            <span className={styles.kpiValue}>{kpis.total}</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIcon} ${styles.kpiIconGreen}`}>
            <Power size={20} />
          </div>
          <div className={styles.kpiMeta}>
            <span className={styles.kpiLabel}>Niveles Activos</span>
            <span className={styles.kpiValue}>{kpis.active}</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon}>
            <Crown size={20} />
          </div>
          <div className={styles.kpiMeta}>
            <span className={styles.kpiLabel}>Nivel Más Alto</span>
            <span className={styles.kpiValue}>{kpis.highestTierName}</span>
          </div>
        </div>
      </div>

      {/* GRID DE NIVELES */}
      {tiers.length === 0 ? (
        <div className={styles.emptyTiers}>
          <Sparkles size={36} style={{ color: '#eab308' }} />
          <p>No se encontraron niveles de clientes configurados.</p>
          <button
            type="button"
            className={styles.createTierBtn}
            onClick={handleOpenCreateModal}
          >
            <Plus size={16} /> Crear Primer Nivel
          </button>
        </div>
      ) : (
        <div className={styles.tiersGrid}>
          {tiers.map((tier) => {
            const isBase = Boolean(tier.is_default);
            const isActive = Boolean(tier.is_active);

            return (
              <div
                key={tier.id}
                className={`${styles.tierCard} ${!isActive ? styles.tierCardInactive : ''}`}
              >
                {/* BARRA SUPERIOR DE COLOR */}
                <div
                  className={styles.tierCardHighlightBar}
                  style={{ backgroundColor: tier.color || '#eab308' }}
                />

                <div>
                  {/* HEADER */}
                  <div className={styles.tierHeader}>
                    <div className={styles.tierIdentity}>
                      <div
                        className={styles.tierIconWrap}
                        style={{
                          backgroundColor: `${tier.color || '#eab308'}22`,
                          border: `1px solid ${tier.color || '#eab308'}55`
                        }}
                      >
                        {renderTierIcon(tier)}
                      </div>
                      <div className={styles.tierNameGroup}>
                        <h3 className={styles.tierTitle}>
                          {tier.name}
                        </h3>
                        <span className={styles.tierSlug}>slug: {tier.slug}</span>
                      </div>
                    </div>

                    <div className={styles.tierBadgesCol}>
                      {isActive ? (
                        <span className={styles.badgeStatusActive}>Activo</span>
                      ) : (
                        <span className={styles.badgeStatusPaused}>Pausado</span>
                      )}
                      {isBase && (
                        <span className={styles.badgeDefault}>Nivel Base</span>
                      )}
                    </div>
                  </div>

                  {/* CRITERIOS */}
                  <div className={styles.criteriaBox}>
                    <div className={styles.criteriaRow}>
                      <span className={styles.criteriaLabel}>
                        <TrendingUp size={13} /> Gasto Mínimo:
                      </span>
                      <span className={styles.criteriaValue}>
                        ${Number(tier.min_spent || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                      </span>
                    </div>

                    <div className={styles.criteriaRow}>
                      <span className={styles.criteriaLabel}>
                        <ShoppingBag size={13} /> Pedidos Mínimos:
                      </span>
                      <span className={styles.criteriaValue}>
                        {tier.min_orders} {tier.min_orders === 1 ? 'pedido' : 'pedidos'}
                      </span>
                    </div>

                    <div className={styles.criteriaRow}>
                      <span className={styles.criteriaLabel}>
                        <Calendar size={13} /> Ventana de Evaluación:
                      </span>
                      <span className={styles.criteriaValue}>
                        {tier.period_days ? `Últimos ${tier.period_days} días` : 'Histórico'}
                      </span>
                    </div>

                    <div className={styles.criteriaRow}>
                      <span className={styles.criteriaLabel}>
                        <Award size={13} /> Prioridad de Rango:
                      </span>
                      <span className={styles.criteriaValue}>
                        {tier.rank_priority}
                      </span>
                    </div>
                  </div>

                  {/* DESCRIPCIÓN */}
                  <p className={styles.benefitText}>
                    {tier.benefit_description || 'Sin descripción de beneficios.'}
                  </p>
                </div>

                {/* ACCIONES */}
                <div className={styles.tierActions}>
                  <div className={styles.tierActionsLeft}>
                    <button
                      type="button"
                      className={styles.btnAction}
                      onClick={() => handleOpenEditModal(tier)}
                      title="Editar parámetros del nivel"
                    >
                      <Pencil size={13} /> Editar
                    </button>
                    {!isBase && (
                      <button
                        type="button"
                        className={styles.btnToggle}
                        onClick={() => handleToggleStatus(tier)}
                        disabled={Boolean(togglingTierId)}
                        title={isActive ? 'Pausar nivel' : 'Activar nivel'}
                      >
                        <Power size={13} /> {togglingTierId === tier.id ? 'Cambiando...' : (isActive ? 'Pausar' : 'Activar')}
                      </button>
                    )}
                  </div>

                  {!isBase && (
                    <button
                      type="button"
                      className={styles.btnDelete}
                      onClick={() => setDeletingTier(tier)}
                      title="Eliminar este nivel"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL CREAR / EDITAR */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={handleCloseModal}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                <Crown size={18} style={{ color: formData.color || '#eab308' }} />
                {editingTier ? `Editar Nivel: ${editingTier.name}` : 'Crear Nuevo Nivel de Cliente'}
              </h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={handleCloseModal}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveTier}>
              <div className={styles.modalBody}>
                {/* NOMBRE Y SLUG */}
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Nombre del Nivel *</label>
                    <input
                      type="text"
                      placeholder="Ej: Platino, VIP, Frecuente"
                      value={formData.name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      required
                    />
                    <span className={styles.formHint}>Nombre visible en badges y catálogo</span>
                  </div>

                  <div className={styles.formGroup}>
                    <label>Identificador (Slug) *</label>
                    <input
                      type="text"
                      placeholder="Ej: platino"
                      value={formData.slug}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '_')
                      }))}
                      required
                      disabled={Boolean(editingTier)}
                    />
                    <span className={styles.formHint}>
                      {editingTier
                        ? 'El slug no se puede modificar una vez creado para proteger productos asignados.'
                        : 'Identificador interno único (minúsculas, ej: oro_plus)'}
                    </span>
                  </div>
                </div>

                {/* GASTO Y PEDIDOS */}
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Consumo Mínimo ($ MXN) *</label>
                    <input
                      type="number"
                      step="50"
                      min="0"
                      placeholder="0.00"
                      value={formData.min_spent}
                      onChange={(e) => setFormData(prev => ({ ...prev, min_spent: e.target.value }))}
                      required
                    />
                    <span className={styles.formHint}>Monto total acumulado requerido</span>
                  </div>

                  <div className={styles.formGroup}>
                    <label>Pedidos Mínimos *</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      placeholder="0"
                      value={formData.min_orders}
                      onChange={(e) => setFormData(prev => ({ ...prev, min_orders: e.target.value }))}
                      required
                    />
                    <span className={styles.formHint}>Número de órdenes completadas</span>
                  </div>
                </div>

                {/* VENTANA DE DÍAS Y PRIORIDAD */}
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label>Ventana de Evaluación (Días) *</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      placeholder="90"
                      value={formData.period_days}
                      onChange={(e) => setFormData(prev => ({ ...prev, period_days: e.target.value }))}
                      required
                    />
                    <span className={styles.formHint}>Días de compras considerados (ej: 90 días)</span>
                  </div>

                  <div className={styles.formGroup}>
                    <label>Prioridad de Rango (Jerarquía) *</label>
                    <input
                      type="number"
                      step="1"
                      placeholder="100"
                      value={formData.rank_priority}
                      onChange={(e) => setFormData(prev => ({ ...prev, rank_priority: e.target.value }))}
                      required
                    />
                    <span className={styles.formHint}>Mayor número = mayor nivel jerárquico</span>
                  </div>
                </div>

                {/* COLOR PRESETS */}
                <div className={styles.formGroup}>
                  <label>Color Identificador del Nivel</label>
                  <div className={styles.colorPickerRow}>
                    {COLOR_PRESETS.map((p) => (
                      <div
                        key={p.value}
                        className={`${styles.colorDot} ${formData.color === p.value ? styles.colorDotSelected : ''}`}
                        style={{ backgroundColor: p.value }}
                        onClick={() => setFormData(prev => ({ ...prev, color: p.value }))}
                        title={p.label}
                      />
                    ))}
                    <input
                      type="color"
                      className={styles.colorCustomInput}
                      value={formData.color}
                      onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                      title="Elegir color personalizado"
                    />
                  </div>
                </div>

                {/* DESCRIPCIÓN DE BENEFICIOS */}
                <div className={styles.formGroup}>
                  <label>Descripción de Beneficios / Requisitos</label>
                  <textarea
                    rows={2}
                    placeholder="Ej: Consumo > $3,000 o > 15 pedidos. Acceso a platillos de edición especial y regalos."
                    value={formData.benefit_description}
                    onChange={(e) => setFormData(prev => ({ ...prev, benefit_description: e.target.value }))}
                  />
                  <span className={styles.formHint}>Texto explicativo visible para el cliente y admin</span>
                </div>

                {/* TOGGLES */}
                <div className={styles.checkboxGroup}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                    />
                    <span>¿Nivel Activo? (Permite calificar clientes y asignar productos)</span>
                  </label>

                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={formData.is_default}
                      onChange={(e) => setFormData(prev => ({ ...prev, is_default: e.target.checked }))}
                    />
                    <span>¿Es el nivel base por defecto? (Asignado a clientes sin nivel superior)</span>
                  </label>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelModalBtn}
                  onClick={handleCloseModal}
                  disabled={isSaving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={styles.saveModalBtn}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    'Guardando...'
                  ) : (
                    <>
                      <Check size={16} /> {editingTier ? 'Guardar Cambios' : 'Crear Nivel'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMAR ELIMINACIÓN */}
      {deletingTier && (
        <div className={styles.modalOverlay} onClick={() => setDeletingTier(null)}>
          <div className={styles.modalBox} style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle} style={{ color: '#ef4444' }}>
                <AlertTriangle size={18} /> Eliminar Nivel
              </h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setDeletingTier(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                ¿Estás seguro de que deseas eliminar el nivel <strong>"{deletingTier.name}"</strong>?
              </p>
              <p style={{ margin: '8px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Los productos que tengan asignado este nivel perderán la restricción para este tier. Esta acción no se puede deshacer.
              </p>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.cancelModalBtn}
                onClick={() => setDeletingTier(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                style={{
                  background: isDeleting ? '#9ca3af' : '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontWeight: 600,
                  cursor: isDeleting ? 'not-allowed' : 'pointer'
                }}
                disabled={isDeleting}
                onClick={handleDeleteConfirm}
              >
                {isDeleting ? 'Eliminando...' : 'Sí, Eliminar Nivel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
