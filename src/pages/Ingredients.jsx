// CREAR NUEVO ARCHIVO: src/pages/Ingredients.jsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAlert } from '../context/AlertContext';
import { useAdminAuth } from '../context/AdminAuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
// Crearemos estos componentes en el siguiente paso
import IngredientFormModal from '../components/IngredientFormModal'; 
import PurchaseFormModal from '../components/PurchaseFormModal';
import StockAdjustmentModal from '../components/StockAdjustmentModal';
import PurchaseUnitsModal from '../components/PurchaseUnitsModal';
// Importaremos un CSS module que crearemos
import styles from './Ingredients.module.css'; 

// --- Iconos (puedes reemplazarlos si lo deseas) ---
const AddIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>;
const ShoppingCartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>;
const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>;
// --- Fin Iconos ---

export default function Ingredients() {
  const { showAlert } = useAlert();
  const { hasPermission } = useAdminAuth();
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados de los Modales
  const [isIngredientModalOpen, setIsIngredientModalOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [isUnitsModalOpen, setIsUnitsModalOpen] = useState(false);
  
  // El ingrediente seleccionado para editar o registrar compras
  const [selectedIngredient, setSelectedIngredient] = useState(null);

  const canEdit = hasPermission('productos.edit'); // O un nuevo permiso 'inventario.edit'

  // Cargar todos los ingredientes
  const fetchIngredients = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ingredients')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      showAlert(`Error al cargar ingredientes: ${error.message}`, 'error');
    } else {
      setIngredients(data || []);
    }
    setLoading(false);
  }, [showAlert]);

  useEffect(() => {
    fetchIngredients();
  }, [fetchIngredients]);

  // Filtrar ingredientes según la búsqueda
  const filteredIngredients = useMemo(() => {
    if (!searchTerm) return ingredients;
    const lowerSearch = searchTerm.toLowerCase();
    return ingredients.filter(ing => ing.name.toLowerCase().includes(lowerSearch));
  }, [ingredients, searchTerm]);

  // --- Handlers para abrir modales ---
  
  const handleOpenNewIngredient = () => {
    setSelectedIngredient(null);
    setIsIngredientModalOpen(true);
  };
  
  const handleOpenEditIngredient = (ingredient) => {
    setSelectedIngredient(ingredient);
    setIsIngredientModalOpen(true);
  };
  
  const handleOpenPurchase = () => {
    setIsPurchaseModalOpen(true);
  };

  const handleOpenUnits = (ingredient) => {
    setSelectedIngredient(ingredient);
    setIsUnitsModalOpen(true);
  };

  const handleOpenAdjustment = (ingredient) => {
    setSelectedIngredient(ingredient);
    setIsAdjustmentModalOpen(true);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>Gestión de Inventario</h1>
          <div className={styles.headerActions}>
            <button 
              onClick={handleOpenPurchase} 
              className={styles.primaryButton} 
              disabled={!canEdit}
            >
              <ShoppingCartIcon /> Registrar Compra
            </button>
            <button 
              onClick={handleOpenNewIngredient} 
              className={styles.secondaryButton} 
              disabled={!canEdit}
            >
              <AddIcon /> Nuevo Ingrediente
            </button>
          </div>
        </div>

        <input
          type="text"
          placeholder="Buscar ingrediente..."
          className={styles.searchInput}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <div className={styles.tableWrapper}>
          <table className={styles.ingredientsTable}>
            <thead>
              <tr>
                <th>Ingrediente</th>
                <th>Stock Actual</th>
                <th>Costo Promedio</th>
                <th>Unidad Base</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredIngredients.length === 0 ? (
                <tr>
                  <td colSpan="5" className={styles.emptyMessage}>
                    No se encontraron ingredientes.
                  </td>
                </tr>
              ) : (
                filteredIngredients.map(ing => (
                  <tr key={ing.id}>
                    <td data-label="Ingrediente">
                      <span 
                        className={styles.ingredientName} 
                        onClick={() => canEdit && handleOpenEditIngredient(ing)}
                      >
                        {ing.name}
                      </span>
                      {ing.track_inventory ? (
                        <span className={styles.badgeStock}>Rastreado</span>
                      ) : (
                        <span className={styles.badgeNoStock}>No Rastreado</span>
                      )}
                    </td>
                    <td data-label="Stock">
                      {ing.track_inventory ? (
                        <span className={ing.current_stock <= ing.low_stock_threshold ? styles.lowStock : ''}>
                          {ing.current_stock} {ing.base_unit}
                        </span>
                      ) : 'N/A'}
                    </td>
                    <td data-label="Costo Prom.">
                      ${ing.average_cost.toFixed(4)} / {ing.base_unit}
                    </td>
                    <td data-label="Unidad Base">{ing.base_unit}</td>
                    <td data-label="Acciones">
                      <div className={styles.actionButtons}>
                        <button 
                          className={styles.actionButton}
                          onClick={() => handleOpenUnits(ing)} 
                          disabled={!canEdit}
                          title="Formatos de Compra"
                        >
                          Formatos
                        </button>
                        <button 
                          className={styles.actionButton} 
                          onClick={() => handleOpenAdjustment(ing)} 
                          disabled={!canEdit || !ing.track_inventory}
                          title="Ajustar Stock"
                        >
                          Ajustar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- MODALES --- */}
      
      {isIngredientModalOpen && (
        <IngredientFormModal
          isOpen={isIngredientModalOpen}
          onClose={() => setIsIngredientModalOpen(false)}
          onSave={fetchIngredients}
          ingredient={selectedIngredient}
        />
      )}
      
      {isUnitsModalOpen && (
        <PurchaseUnitsModal
          isOpen={isUnitsModalOpen}
          onClose={() => setIsUnitsModalOpen(false)}
          ingredient={selectedIngredient}
        />
      )}
      
      {isPurchaseModalOpen && (
        <PurchaseFormModal
          isOpen={isPurchaseModalOpen}
          onClose={() => setIsPurchaseModalOpen(false)}
          onSave={fetchIngredients}
          allIngredients={ingredients}
        />
      )}

      {isAdjustmentModalOpen && (
        <StockAdjustmentModal
          isOpen={isAdjustmentModalOpen}
          onClose={() => setIsAdjustmentModalOpen(false)}
          onSave={fetchIngredients}
          ingredient={selectedIngredient}
        />
      )}
    </>
  );
}