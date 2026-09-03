// src/store/useProductStore.js
import { create } from 'zustand';
import {
  loadDataPaginated,
  loadData,
  searchProductByBarcode,
  searchProductsInDB,
  queryByIndex,
  STORES,
  searchProductBySKU
} from '../services/database';

export const useProductStore = create((set, get) => ({
  menu: [],
  rawProducts: [], // Mantenido por compatibilidad
  categories: [],
  batchesCache: new Map(),
  isLoading: false,

  // Paginación
  menuPage: 0,
  menuPageSize: 50,
  hasMoreProducts: true,

  searchProducts: async (query) => {
    const normalizedQuery = query?.trim() || '';
    if (normalizedQuery.length < 2) {
      return get().loadInitialProducts();
    }
    set({ isLoading: true });
    try {
      // Intento 1: Buscar por código de barras (Rápido)
      const byCode = await searchProductByBarcode(normalizedQuery);
      if (byCode) {
        set({ menu: [byCode], isLoading: false, hasMoreProducts: false });
        return byCode;
      }
      // Intento 1.5: Buscar por SKU (Variante especifica)
      const bySKU = await searchProductBySKU(normalizedQuery);
      if (bySKU) {
        set({ menu: [bySKU], isLoading: false, hasMoreProducts: false });
        return bySKU;
      }
      // Intento 2: Buscar por nombre en la BD
      const results = await searchProductsInDB(normalizedQuery);
      set({ menu: results, isLoading: false, hasMoreProducts: false });
      return results;
    } catch (error) {
      console.error("Error en búsqueda:", error);
      set({ isLoading: false });
      return [];
    }
  },

  loadInitialProducts: async () => {
    set({ isLoading: true });
    try {
      // Carga paralela de productos y categorías
      const [productsPage, categories] = await Promise.all([
        // Cargamos directo de MENU. El stock ya viene sincronizado desde la BD.
        loadDataPaginated(STORES.MENU, { limit: 50, offset: 0 }),
        loadDataPaginated(STORES.CATEGORIES)
      ]);

      set({
        menu: productsPage, // ✅ CORREGIDO: Usamos la página cargada directamente
        rawProducts: productsPage,
        categories: categories || [],
        menuPage: 1,
        hasMoreProducts: productsPage.length === 50,
        isLoading: false
      });
    } catch (error) {
      console.error("Error loading products:", error);
      set({ isLoading: false });
    }
  },

  loadMoreProducts: async () => {
    const { menuPage, menuPageSize, hasMoreProducts, menu } = get();
    if (!hasMoreProducts) return;

    try {
      const nextPage = await loadDataPaginated(STORES.MENU, {
        limit: menuPageSize,
        offset: menuPage * menuPageSize
      });

      if (nextPage.length === 0) {
        set({ hasMoreProducts: false });
        return;
      }

      // ✅ OPTIMIZACIÓN: Carga directa sin recálculos lentos
      set({
        menu: [...menu, ...nextPage],
        menuPage: menuPage + 1,
        hasMoreProducts: nextPage.length === menuPageSize
      });
    } catch (error) {
      console.error("Error paginando:", error);
    }
  },

  loadBatchesForProduct: async (productId) => {
    const { batchesCache } = get();
    // Solo cargamos lotes cuando el usuario abre el modal de "Detalles/Lotes"
    const batches = await queryByIndex(STORES.PRODUCT_BATCHES, 'productId', productId);

    const newCache = new Map(batchesCache);
    newCache.set(productId, batches);

    set({ batchesCache: newCache });
    return batches;
  },

  refreshCategories: async () => {
    // Usamos loadData para traer todas las categorías (no solo una página)
    const cats = await loadData(STORES.CATEGORIES);
    set({ categories: cats || [] });
  },

  getLowStockProducts: () => {
    const { menu } = get();
    
    // Filtramos productos activos, que controlan stock y están bajo el mínimo
    return menu.filter(p => 
      p.isActive !== false &&
      p.trackStock && 
      p.minStock > 0 && 
      p.stock <= p.minStock
    ).map(p => {
      // Si no hay MaxStock definido, sugerimos pedir el doble del mínimo para tener inventario
      const targetStock = p.maxStock && p.maxStock > p.minStock 
        ? p.maxStock 
        : (p.minStock * 2);
        
      const deficit = targetStock - p.stock;

      return {
        id: p.id,
        name: p.name,
        currentStock: p.stock,
        minStock: p.minStock,
        maxStock: p.maxStock || targetStock, // Para mostrar el calculado si falta
        suggestedOrder: Math.ceil(deficit), // Redondeamos hacia arriba
        supplierName: p.supplier || 'Proveedor General', // Agrupación por defecto
        unit: p.saleType === 'bulk' ? (p.bulkData?.purchase?.unit || 'kg') : 'pza'
      };
    });
  }
}));
