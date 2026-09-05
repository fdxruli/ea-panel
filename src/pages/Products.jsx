/* src/pages/Products.jsx (Modernizado con Fases 1, 2, 3 y 4) */

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import styles from "./Products.module.css";
import { useAlert } from "../context/AlertContext";
import { useAdminAuth } from "../context/AdminAuthContext";
import { useCacheAdmin } from "../context/CacheAdminContext";
import { useCategoriesCache } from "../hooks/useCategoriesCache";
import { 
  fetchAdminProductsDirectory, 
  fetchAdminProductsKPIs, 
  getProductsDirectoryCacheKey, 
  ADMIN_PRODUCTS_KPIS_CACHE_KEY 
} from "../lib/productAdminQueries";
import { exportProductsCatalogToCSV } from "../utils/productExportUtils";
import { subscribeToTableChanges } from "../lib/sharedAdminRealtime";
import { broadcastStoreChange } from "../lib/broadcastRealtime";

import ProductCard from "../components/ProductCard";
import ProductTableView from "../components/ProductTableView";
import ProductDetailDrawer from "../components/ProductDetailDrawer";
import ProductFormModal from "../components/ProductFormModal";
import ManageImagesModal from "../components/ManageImagesModal";
import ManageCategoriesModal from "../components/ManageCategoriesModal";
import ProductAudienceModal from "../components/ProductAudienceModal";

import { 
  Package, 
  DollarSign, 
  TrendingUp, 
  AlertTriangle, 
  LayoutGrid, 
  Table as TableIcon, 
  Download, 
  Plus, 
  ArrowUpDown,
  Search,
  Layers,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

function useDebounce(value, delay = 350) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function Products() {
  const { showAlert } = useAlert();
  const { hasPermission } = useAdminAuth();
  const { invalidate, setCached, getCached } = useCacheAdmin();

  // Permisos
  const canView = hasPermission('productos.view');
  const canEdit = hasPermission('productos.edit');

  // Categorías
  const { data: categoriesData, isLoading: loadingCategories } = useCategoriesCache();
  const categories = useMemo(() => categoriesData || [], [categoriesData]);
  const categoryMap = useMemo(() => {
    return categories.reduce((acc, cat) => ({ ...acc, [cat.id]: cat.name }), {});
  }, [categories]);

  // Estados de Filtros y Ordenamiento
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 350);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stockStatusFilter, setStockStatusFilter] = useState("all");
  const [menuMatrixFilter, setMenuMatrixFilter] = useState("all");
  const [audienceFilter, setAudienceFilter] = useState("all"); // 'all' | 'public' | 'special'
  const [sortBy, setSortBy] = useState("sales_desc");
  const [viewMode, setViewMode] = useState("grid"); // 'grid' | 'table'

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 48;

  // Datos principales
  const [products, setProducts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modales y Drawer
  const [drawerProduct, setDrawerProduct] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [audienceProduct, setAudienceProduct] = useState(null);
  const [isAudienceModalOpen, setIsAudienceModalOpen] = useState(false);
  const [isFormModalOpen, setFormModalOpen] = useState(false);
  const [isImagesModalOpen, setImagesModalOpen] = useState(false);
  const [isCategoriesModalOpen, setCategoriesModalOpen] = useState(false);

  // Carga de KPIs
  const loadKPIs = useCallback(async (force = false) => {
    try {
      if (!force) {
        const cached = getCached(ADMIN_PRODUCTS_KPIS_CACHE_KEY);
        if (cached && !cached.isExpired && cached.data) {
          setKpis(cached.data);
          return;
        }
      }

      const freshKpis = await fetchAdminProductsKPIs();
      setKpis(freshKpis);
      setCached(ADMIN_PRODUCTS_KPIS_CACHE_KEY, freshKpis, 5 * 60 * 1000); // 5 min TTL
    } catch (err) {
      console.error("[Products] Error cargando KPIs globales:", err);
    }
  }, [getCached, setCached]);

  // Carga del Directorio
  const loadDirectory = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const offset = (currentPage - 1) * limit;
      const queryParams = {
        search: debouncedSearchTerm,
        categoryId: selectedCategory,
        status: statusFilter,
        stockStatus: stockStatusFilter,
        menuMatrix: menuMatrixFilter,
        audience: audienceFilter,
        sortBy,
        limit,
        offset
      };

      const cacheKey = getProductsDirectoryCacheKey(queryParams);

      if (!force) {
        const cached = getCached(cacheKey);
        if (cached && !cached.isExpired && cached.data) {
          setProducts(cached.data.products || []);
          setTotalCount(cached.data.totalCount || 0);
          setLoading(false);
          return;
        }
      }

      const { products: freshProducts, totalCount: freshTotal } = await fetchAdminProductsDirectory(queryParams);

      setProducts(freshProducts);
      setTotalCount(freshTotal);
      setCached(cacheKey, { products: freshProducts, totalCount: freshTotal }, 3 * 60 * 1000); // 3 min TTL
    } catch (err) {
      console.error("[Products] Error cargando catálogo de productos:", err);
      showAlert(`Error al cargar productos: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [
    debouncedSearchTerm,
    selectedCategory,
    statusFilter,
    stockStatusFilter,
    menuMatrixFilter,
    audienceFilter,
    sortBy,
    currentPage,
    limit,
    getCached,
    setCached,
    showAlert
  ]);

  // Carga inicial y cambios en filtros
  useEffect(() => {
    loadKPIs();
  }, [loadKPIs]);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  // Reset a página 1 al cambiar filtros de búsqueda o categoría
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, selectedCategory, statusFilter, stockStatusFilter, menuMatrixFilter, audienceFilter, sortBy]);

  // Suscripción Realtime a tablas clave
  useEffect(() => {
    const invalidateAndReload = () => {
      invalidate(ADMIN_PRODUCTS_KPIS_CACHE_KEY);
      invalidate(/^admin:products:dir:/);
      loadKPIs(true);
      loadDirectory(true);
    };

    const unsubProducts = subscribeToTableChanges("products", () => {
      console.log("[Products Realtime] Cambio en products detectado.");
      invalidateAndReload();
    });

    const unsubRecipes = subscribeToTableChanges("product_recipes", () => {
      console.log("[Products Realtime] Cambio en recetas detectado.");
      invalidateAndReload();
    });

    const unsubIngredients = subscribeToTableChanges("ingredients", () => {
      console.log("[Products Realtime] Cambio en inventario de ingredientes.");
      invalidateAndReload();
    });

    const unsubCategories = subscribeToTableChanges("categories", () => {
      console.log("[Products Realtime] Cambio en categorías.");
      invalidate("categories");
      invalidateAndReload();
    });

    const unsubOrders = subscribeToTableChanges("orders", (payload) => {
      if (payload.new?.status === 'completado' || payload.old?.status === 'completado') {
        invalidateAndReload();
      }
    });

    return () => {
      if (unsubProducts) unsubProducts();
      if (unsubRecipes) unsubRecipes();
      if (unsubIngredients) unsubIngredients();
      if (unsubCategories) unsubCategories();
      if (unsubOrders) unsubOrders();
    };
  }, [invalidate, loadKPIs, loadDirectory]);

  // Acción: Activar / Desactivar Producto
  const toggleActive = useCallback(async (id, isActive) => {
    try {
      const nextActive = !isActive;

      // Actualización optimista local
      setProducts(prev => prev.map(p => p.id === id ? { ...p, is_active: nextActive } : p));
      if (drawerProduct?.id === id) {
        setDrawerProduct(prev => prev ? { ...prev, is_active: nextActive } : null);
      }

      const { error } = await supabase
        .from("products")
        .update({ is_active: nextActive })
        .eq("id", id);

      if (error) throw error;

      showAlert(`Producto ${nextActive ? "activado" : "desactivado"} correctamente.`, "success");

      // Invalidar cachés
      invalidate(ADMIN_PRODUCTS_KPIS_CACHE_KEY);
      invalidate(/^admin:products:dir:/);

      broadcastStoreChange("catalog_updated", { entity: "products", action: "toggle_active", id });
    } catch (error) {
      console.error("[Products] Error en toggleActive:", error);
      showAlert(`Error: ${error.message}`, "error");
      loadDirectory(true);
    }
  }, [showAlert, invalidate, drawerProduct?.id, loadDirectory]);

  // Acción: Guardar Producto y Receta (atómico vía RPC)
  const handleSaveProduct = useCallback(async ({ productData, recipeData }) => {
    try {
      const {
        total_sold, total_revenue, avg_rating, reviews_count,
        favorites_count, image_count, margin_amount, margin_percent,
        effective_cost, max_preparable, menu_matrix_class, stock_status,
        product_images, ...dataToUpsert
      } = productData;

      const { error } = await supabase.rpc("save_product_with_recipe", {
        p_product: dataToUpsert,
        p_recipe_items: recipeData || []
      });

      if (error) throw error;

      showAlert(`Producto ${dataToUpsert.id ? "actualizado" : "creado"} con éxito.`, "success");

      // Invalidar cachés
      invalidate(ADMIN_PRODUCTS_KPIS_CACHE_KEY);
      invalidate(/^admin:products:dir:/);
      invalidate(/^admin:product:detail:/);

      broadcastStoreChange("catalog_updated", { 
        entity: "products", 
        action: dataToUpsert.id ? "update" : "create" 
      });

      setFormModalOpen(false);
      setSelectedProduct(null);

      // Si el Drawer estaba abierto para este producto, refrescarlo
      if (drawerProduct?.id === dataToUpsert.id) {
        setDrawerProduct(prev => ({ ...prev, ...dataToUpsert }));
      }

      loadKPIs(true);
      loadDirectory(true);
    } catch (error) {
      console.error("[Products] Error guardando producto y receta:", error);
      showAlert(`Error: ${error.message}`, "error");
      throw error;
    }
  }, [showAlert, invalidate, drawerProduct?.id, loadKPIs, loadDirectory]);

  // Exportar Catálogo a CSV
  const handleExportCSV = useCallback(() => {
    try {
      if (!products || products.length === 0) {
        showAlert("No hay productos disponibles para exportar.", "warning");
        return;
      }
      exportProductsCatalogToCSV(products);
      showAlert("Catálogo de productos exportado a CSV.", "success");
    } catch (error) {
      showAlert(`Error al exportar: ${error.message}`, "error");
    }
  }, [products, showAlert]);

  // Handlers para abrir modales
  const openFormModal = useCallback((prod = null) => {
    setSelectedProduct(prod);
    setFormModalOpen(true);
  }, []);

  const openImagesModal = useCallback((prod) => {
    setSelectedProduct(prod);
    setImagesModalOpen(true);
  }, []);

  const openAudienceModal = useCallback((prod) => {
    setAudienceProduct(prod);
    setIsAudienceModalOpen(true);
  }, []);

  const handleAudienceUpdated = useCallback((savedData) => {
    invalidate(ADMIN_PRODUCTS_KPIS_CACHE_KEY);
    invalidate(/^admin:products:dir:/);
    loadDirectory(true);
    if (drawerProduct && drawerProduct.id === savedData?.productId) {
      setDrawerProduct(prev => prev ? {
        ...prev,
        target_customer_ids: savedData.targetCustomerIds,
        target_customers_count: savedData.targetCustomerIds?.length || 0,
        is_exclusive: (savedData.targetCustomerIds?.length || 0) > 0
      } : null);
    }
  }, [invalidate, loadDirectory, drawerProduct]);

  const openDrawer = useCallback((prod) => {
    setDrawerProduct(prod);
    setIsDrawerOpen(true);
  }, []);

  if (!canView) {
    return (
      <div className={styles.container}>
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: "16px" }}>
            No tienes permisos suficientes para ver el catálogo de productos.
          </p>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(totalCount / limit) || 1;

  return (
    <div className={styles.container}>
      {/* HEADER PRINCIPAL */}
      <div className={styles.header}>
        <div>
          <h1>Catálogo de Productos</h1>
          <p className={styles.subtitle}>
            Administración profesional de menú, costeo de recetas y rendimiento comercial
          </p>
        </div>

        <div className={styles.headerActions}>
          <button 
            onClick={handleExportCSV}
            className={styles.exportButton}
            title="Descargar catálogo con costos y márgenes en Excel"
          >
            <Download size={16} /> Exportar CSV
          </button>

          {canEdit && (
            <>
              <button
                onClick={() => setCategoriesModalOpen(true)}
                className={styles.manageButton}
              >
                <Layers size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                Categorías
              </button>

              <button
                onClick={() => openFormModal(null)}
                className={styles.addButton}
              >
                <Plus size={16} /> Nuevo Producto
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI CARDS (MÉTRICAS EJECUTIVAS EN TIEMPO REAL) */}
      <div className={styles.kpisContainer}>
        {/* Total Productos */}
        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIcon} ${styles.kpiIconBlue}`}>
            <Package size={22} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiTitle}>Total Productos</span>
            <span className={styles.kpiValue}>{kpis ? kpis.total_products : "-"}</span>
            <span className={styles.kpiSubtitle}>
              {kpis ? `${kpis.active_products} activos • ${kpis.inactive_products} inactivos` : "Cargando..."}
            </span>
          </div>
        </div>

        {/* Facturación Catálogo */}
        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIcon} ${styles.kpiIconGreen}`}>
            <DollarSign size={22} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiTitle}>Facturación Catálogo</span>
            <span className={styles.kpiValue}>
              {kpis ? `$${Number(kpis.total_catalog_revenue || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-"}
            </span>
            <span className={styles.kpiSubtitle}>
              {kpis ? `${kpis.total_units_sold} unidades vendidas` : "Calculando..."}
            </span>
          </div>
        </div>

        {/* Margen Promedio */}
        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIcon} ${styles.kpiIconGold}`}>
            <TrendingUp size={22} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiTitle}>Margen Promedio</span>
            <span className={styles.kpiValue}>{kpis ? `${kpis.avg_profit_margin}%` : "-"}</span>
            <span className={styles.kpiSubtitle}>
              {kpis?.top_seller?.name ? `Top: ${kpis.top_seller.name}` : "Rentabilidad del menú"}
            </span>
          </div>
        </div>

        {/* Alertas de Stock */}
        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIcon} ${styles.kpiIconOrange}`}>
            <AlertTriangle size={22} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiTitle}>Alertas de Stock</span>
            <span className={styles.kpiValue}>
              {kpis ? kpis.out_of_stock_count + kpis.low_stock_count : "-"}
            </span>
            <span className={styles.kpiSubtitle}>
              {kpis ? `${kpis.out_of_stock_count} agotados • ${kpis.low_stock_count} stock bajo` : "Verificando..."}
            </span>
          </div>
        </div>
      </div>

      {/* BARRA DE CONTROLES: BÚSQUEDA, FILTROS, ORDEN Y VISTA */}
      <div className={styles.controlsBar}>
        <div className={styles.searchAndSortRow}>
          {/* Búsqueda */}
          <div className={styles.searchWrapper}>
            <input
              type="text"
              placeholder="Buscar por nombre, descripción o categoría..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          {/* Filtros Dropdowns y Toggle */}
          <div className={styles.filterGroup}>
            {/* Categoría */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className={styles.selectFilter}
              aria-label="Filtrar por categoría"
            >
              <option value="all">Todas las categorías</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>

            {/* Estado */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={styles.selectFilter}
              aria-label="Filtrar por estado"
            >
              <option value="all">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>

            {/* Disponibilidad de Stock */}
            <select
              value={stockStatusFilter}
              onChange={(e) => setStockStatusFilter(e.target.value)}
              className={styles.selectFilter}
              aria-label="Filtrar por inventario"
            >
              <option value="all">Todo el inventario</option>
              <option value="in_stock">🟢 En Stock</option>
              <option value="low_stock">⚠️ Stock Bajo</option>
              <option value="out_of_stock">🚫 Agotados</option>
              <option value="untracked">⚪ Sin Receta</option>
            </select>

            {/* Audiencia / Visibilidad */}
            <select
              value={audienceFilter}
              onChange={(e) => setAudienceFilter(e.target.value)}
              className={styles.selectFilter}
              aria-label="Filtrar por audiencia"
            >
              <option value="all">👥 Toda la audiencia</option>
              <option value="public">🌐 Público General</option>
              <option value="special">🔒 Clientes Especiales</option>
            </select>

            {/* Ordenamiento */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className={styles.sortSelect}
              aria-label="Ordenar catálogo por"
            >
              <option value="sales_desc">Más Vendidos</option>
              <option value="revenue_desc">Mayor Facturación ($)</option>
              <option value="margin_desc">Mayor Margen (%)</option>
              <option value="margin_asc">Menor Margen (%)</option>
              <option value="price_desc">Mayor Precio</option>
              <option value="price_asc">Menor Precio</option>
              <option value="stock_asc">Menor Stock (Porciones)</option>
              <option value="name_asc">Nombre (A - Z)</option>
              <option value="created_desc">Más Recientes</option>
            </select>

            {/* Toggle de Vista: Grid vs Table */}
            <div className={styles.viewToggleGroup}>
              <button
                className={`${styles.viewToggleBtn} ${viewMode === "grid" ? styles.viewToggleBtnActive : ""}`}
                onClick={() => setViewMode("grid")}
                title="Vista de Cuadrícula"
                aria-label="Vista de cuadrícula"
              >
                <LayoutGrid size={18} />
              </button>
              <button
                className={`${styles.viewToggleBtn} ${viewMode === "table" ? styles.viewToggleBtnActive : ""}`}
                onClick={() => setViewMode("table")}
                title="Vista de Tabla Densa"
                aria-label="Vista de tabla"
              >
                <TableIcon size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* PILLS DE MATRIZ DE MENÚ (INGENIERÍA DE MENÚ) */}
        <div className={styles.segmentPills}>
          <button
            className={`${styles.segmentPill} ${menuMatrixFilter === "all" ? styles.segmentPillActive : ""}`}
            onClick={() => setMenuMatrixFilter("all")}
          >
            Todos <span className={styles.pillBadge}>{kpis ? kpis.total_products : products.length}</span>
          </button>
          <button
            className={`${styles.segmentPill} ${menuMatrixFilter === "star" ? styles.segmentPillActive : ""}`}
            onClick={() => setMenuMatrixFilter("star")}
          >
            ⭐ Estrellas <span className={styles.pillBadge}>{kpis ? kpis.star_count : 0}</span>
          </button>
          <button
            className={`${styles.segmentPill} ${menuMatrixFilter === "workhorse" ? styles.segmentPillActive : ""}`}
            onClick={() => setMenuMatrixFilter("workhorse")}
          >
            🐎 Caballos de Batalla <span className={styles.pillBadge}>{kpis ? kpis.workhorse_count : 0}</span>
          </button>
          <button
            className={`${styles.segmentPill} ${menuMatrixFilter === "puzzle" ? styles.segmentPillActive : ""}`}
            onClick={() => setMenuMatrixFilter("puzzle")}
          >
            🧩 Oportunidad <span className={styles.pillBadge}>{kpis ? kpis.puzzle_count : 0}</span>
          </button>
          <button
            className={`${styles.segmentPill} ${menuMatrixFilter === "dog" ? styles.segmentPillActive : ""}`}
            onClick={() => setMenuMatrixFilter("dog")}
          >
            ⚠️ Por Revisar <span className={styles.pillBadge}>{kpis ? kpis.dog_count : 0}</span>
          </button>
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL (GRID O TABLA) */}
      {loading ? (
        <div style={{ padding: "80px 20px" }}>
          <LoadingSpinner />
        </div>
      ) : products.length === 0 ? (
        <div className={styles.emptyState} style={{ padding: "60px 20px", textAlign: "center" }}>
          <Package size={48} style={{ color: "var(--text-secondary)", marginBottom: "12px" }} />
          <h3 style={{ margin: "0 0 6px 0", color: "var(--text-primary)" }}>No se encontraron productos</h3>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Intenta cambiar los filtros o el término de búsqueda actual.
          </p>
        </div>
      ) : viewMode === "grid" ? (
        <div className={styles.productGrid}>
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              categoryName={categoryMap[p.category_id] || p.category_name || "General"}
              onToggle={toggleActive}
              onEdit={openFormModal}
              onManageImages={openImagesModal}
              onManageAudience={openAudienceModal}
              onSelect={openDrawer}
            />
          ))}
        </div>
      ) : (
        <ProductTableView
          products={products}
          categoryMap={categoryMap}
          onSelect={openDrawer}
          onEdit={openFormModal}
          onManageImages={openImagesModal}
          onManageAudience={openAudienceModal}
          onToggle={toggleActive}
        />
      )}

      {/* PAGINACIÓN */}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            className={styles.pageBtn}
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1 || loading}
          >
            <ChevronLeft size={16} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
            Anterior
          </button>

          <span className={styles.pageInfo}>
            Página {currentPage} de {totalPages} ({totalCount} productos)
          </span>

          <button
            className={styles.pageBtn}
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages || loading}
          >
            Siguiente
            <ChevronRight size={16} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
          </button>
        </div>
      )}

      {/* DRAWER ANALÍTICO 360° */}
      <ProductDetailDrawer
        isOpen={isDrawerOpen}
        productId={drawerProduct?.id}
        initialProduct={drawerProduct}
        onClose={() => {
          setIsDrawerOpen(false);
          setDrawerProduct(null);
        }}
        onEdit={openFormModal}
        onManageImages={openImagesModal}
        onManageAudience={openAudienceModal}
        onToggleActive={toggleActive}
        canEdit={canEdit}
      />

      {/* MODAL RÁPIDO DE AUDIENCIA Y CLIENTES */}
      <ProductAudienceModal
        isOpen={isAudienceModalOpen}
        onClose={() => {
          setIsAudienceModalOpen(false);
          setAudienceProduct(null);
        }}
        product={audienceProduct}
        onAudienceUpdated={handleAudienceUpdated}
      />

      {/* MODALES TRADICIONALES: EDICIÓN, IMÁGENES Y CATEGORÍAS */}
      <ProductFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setFormModalOpen(false);
          setSelectedProduct(null);
        }}
        onSave={handleSaveProduct}
        categories={categories}
        product={selectedProduct}
      />

      {selectedProduct && (
        <ManageImagesModal
          product={selectedProduct}
          isOpen={isImagesModalOpen}
          onClose={() => {
            setImagesModalOpen(false);
            setSelectedProduct(null);
          }}
          onImagesUpdate={() => {
            invalidate(ADMIN_PRODUCTS_KPIS_CACHE_KEY);
            invalidate(/^admin:products:dir:/);
            loadDirectory(true);
          }}
        />
      )}

      <ManageCategoriesModal
        isOpen={isCategoriesModalOpen}
        onClose={() => setCategoriesModalOpen(false)}
        onCategoriesUpdate={() => {
          invalidate("categories");
          invalidate(ADMIN_PRODUCTS_KPIS_CACHE_KEY);
          invalidate(/^admin:products:dir:/);
          loadDirectory(true);
        }}
      />
    </div>
  );
}
