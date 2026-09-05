/* src/components/ProductAudienceModal.jsx */
import React, { useState, useEffect, useMemo, memo, useRef } from 'react';
import { useCustomersBasicCache } from '../hooks/useCustomersBasicCache';
import { updateProductAudience } from '../lib/productAdminQueries';
import { useAlert } from '../context/AlertContext';
import ImageWithFallback from './ImageWithFallback';
import styles from './ProductAudienceModal.module.css';
import { 
  Users, 
  Globe, 
  Search, 
  X, 
  Check, 
  Lock, 
  Sparkles,
  UserCheck
} from 'lucide-react';

const ProductAudienceModal = memo(({
  isOpen,
  onClose,
  product,
  categoryName = 'General',
  onSaveSuccess
}) => {
  const { showAlert } = useAlert();
  const { data: customersData, isLoading: loadingCustomers } = useCustomersBasicCache();
  const allCustomers = useMemo(() => customersData || [], [customersData]);

  // Estados locales
  const [audienceType, setAudienceType] = useState('public'); // 'public' | 'special'
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const searchInputRef = useRef(null);
  const searchContainerRef = useRef(null);

  // Inicializar estado cuando se abre con el producto seleccionado
  useEffect(() => {
    if (isOpen && product) {
      const hasSpecial = Boolean(
        product.target_customer_ids && 
        product.target_customer_ids.length > 0
      );
      setAudienceType(hasSpecial ? 'special' : 'public');
      setSelectedIds(hasSpecial ? [...product.target_customer_ids] : []);
      setSearchQuery('');
      setIsDropdownOpen(false);
    }
  }, [isOpen, product]);

  // Manejar cierre con Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Clientes filtrados para autocompletado
  const filteredCustomers = useMemo(() => {
    if (!searchQuery || searchQuery.trim().length === 0) return [];
    const query = searchQuery.trim().toLowerCase();
    return allCustomers
      .filter((c) => {
        if (selectedIds.includes(c.id)) return false;
        const matchName = c.name && c.name.toLowerCase().includes(query);
        const matchPhone = c.phone && c.phone.includes(query);
        return matchName || matchPhone;
      })
      .slice(0, 10);
  }, [allCustomers, searchQuery, selectedIds]);

  // Mapa de clientes seleccionados con datos completos
  const selectedCustomers = useMemo(() => {
    const customerMap = new Map(allCustomers.map(c => [c.id, c]));
    return selectedIds.map(id => {
      const found = customerMap.get(id);
      return found || { id, name: 'Cliente (' + id.slice(0, 8) + '...)', phone: '' };
    });
  }, [selectedIds, allCustomers]);

  const handleAddCustomer = (customer) => {
    if (!selectedIds.includes(customer.id)) {
      setSelectedIds(prev => [...prev, customer.id]);
    }
    setSearchQuery('');
    setIsDropdownOpen(false);
    searchInputRef.current?.focus();
  };

  const handleRemoveCustomer = (customerId) => {
    setSelectedIds(prev => prev.filter(id => id !== customerId));
  };

  const handleSave = async () => {
    if (audienceType === 'special' && selectedIds.length === 0) {
      showAlert('Debes seleccionar al menos un cliente especial o marcar la opción "Público en general".', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      const targetIdsToSave = audienceType === 'public' ? null : selectedIds;
      await updateProductAudience(product.id, targetIdsToSave);

      showAlert(
        audienceType === 'public'
          ? `El producto "${product.name}" ahora es visible para todo el público.`
          : `El producto "${product.name}" ahora es exclusivo para ${selectedIds.length} cliente(s).`,
        'success'
      );

      if (onSaveSuccess) {
        onSaveSuccess(product.id, targetIdsToSave);
      }
      onClose();
    } catch (err) {
      console.error('Error actualizando audiencia:', err);
      showAlert(`Error al guardar audiencia: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !product) return null;

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>
            <Users size={20} />
            Audiencia y Visibilidad
          </h2>
          <button 
            onClick={onClose} 
            className={styles.closeBtn}
            aria-label="Cerrar modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* BODY */}
        <div className={styles.body}>
          {/* BANNER DEL PRODUCTO */}
          <div className={styles.productBanner}>
            <ImageWithFallback 
              src={product.image_url || 'https://placehold.co/100x100'} 
              alt={product.name} 
              className={styles.productThumb} 
            />
            <div className={styles.productInfo}>
              <span className={styles.productName}>{product.name}</span>
              <span className={styles.productCategory}>
                {categoryName} • ${Number(product.price || 0).toFixed(2)}
              </span>
            </div>
          </div>

          {/* SELECTOR DE OPCIONES DE AUDIENCIA */}
          <div className={styles.radioGroup}>
            {/* Opción 1: Público en general */}
            <div 
              className={`${styles.radioOption} ${audienceType === 'public' ? styles.radioSelected : ''}`}
              onClick={() => setAudienceType('public')}
            >
              <div className={styles.radioHeader}>
                <Globe size={18} />
                Público en general
              </div>
              <p className={styles.radioDesc}>
                Cualquier persona puede ver y ordenar este producto en el menú (clientes e invitados).
              </p>
            </div>

            {/* Opción 2: Clientes especiales */}
            <div 
              className={`${styles.radioOption} ${audienceType === 'special' ? styles.radioSelectedSpecial : ''}`}
              onClick={() => setAudienceType('special')}
            >
              <div className={styles.radioHeader}>
                <Sparkles size={18} />
                Clientes especiales
              </div>
              <p className={styles.radioDesc}>
                Solo visible para los clientes específicos que selecciones. Queda 100% oculto para los demás.
              </p>
            </div>
          </div>

          {/* SECCIÓN DINÁMICA: SELECCIÓN DE CLIENTES ESPECIALES */}
          {audienceType === 'special' && (
            <div className={styles.specialSection}>
              <div className={styles.sectionTitle}>
                <span>Clientes con acceso exclusivo ({selectedIds.length})</span>
                {selectedIds.length > 0 && (
                  <span style={{ fontSize: '0.75rem', color: '#a78bfa' }}>
                    <Lock size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                    Acceso privado
                  </span>
                )}
              </div>

              {/* BUSCADOR AUTOCOMPLETE */}
              <div className={styles.searchBox} ref={searchContainerRef}>
                <Search size={16} className={styles.searchIcon} />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Buscar cliente por nombre o teléfono..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  className={styles.searchInput}
                />

                {/* DROPDOWN DE COINCIDENCIAS */}
                {isDropdownOpen && searchQuery.trim().length > 0 && (
                  <div className={styles.autocompleteDropdown}>
                    {filteredCustomers.length > 0 ? (
                      filteredCustomers.map((customer) => (
                        <div
                          key={customer.id}
                          className={styles.dropdownItem}
                          onClick={() => handleAddCustomer(customer)}
                        >
                          <div>
                            <div className={styles.customerItemName}>{customer.name}</div>
                            {customer.phone && (
                              <div className={styles.customerItemPhone}>{customer.phone}</div>
                            )}
                          </div>
                          <span style={{ color: '#a78bfa', fontSize: '12px', fontWeight: '600' }}>
                            + Añadir
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className={styles.noMatches}>
                        {loadingCustomers ? 'Cargando clientes...' : 'No se encontraron clientes que coincidan'}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* LISTA DE CHIPS DE CLIENTES SELECCIONADOS */}
              <div className={styles.chipsContainer}>
                {selectedCustomers.length > 0 ? (
                  selectedCustomers.map((customer) => (
                    <div key={customer.id} className={styles.chip}>
                      <UserCheck size={13} style={{ color: '#a78bfa' }} />
                      <span>{customer.name}</span>
                      {customer.phone && (
                        <span className={styles.chipPhone}>({customer.phone})</span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomer(customer.id)}
                        className={styles.removeChipBtn}
                        title="Quitar cliente"
                        aria-label={`Quitar a ${customer.name}`}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className={styles.emptyChips}>
                    Usa el buscador para seleccionar los clientes especiales que tendrán acceso a este producto.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className={styles.footer}>
          <button 
            type="button" 
            onClick={onClose} 
            className={styles.cancelBtn}
            disabled={isSaving}
          >
            Cancelar
          </button>
          <button 
            type="button" 
            onClick={handleSave} 
            className={styles.saveBtn}
            disabled={isSaving}
          >
            {isSaving ? (
              'Guardando...'
            ) : (
              <>
                <Check size={16} /> Guardar Audiencia
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
});

ProductAudienceModal.displayName = 'ProductAudienceModal';

export default ProductAudienceModal;
