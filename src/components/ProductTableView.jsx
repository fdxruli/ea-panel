/* src/components/ProductTableView.jsx */
import React, { memo } from 'react';
import styles from '../pages/Products.module.css';
import { useAdminAuth } from '../context/AdminAuthContext';
import ImageWithFallback from './ImageWithFallback';
import { Eye, Edit3, Camera, Power, TrendingUp, Users, Globe } from 'lucide-react';

const renderMatrixBadge = (matrixClass) => {
  switch (matrixClass) {
    case 'star':
      return <span className={`${styles.matrixBadge} ${styles.badgeStar}`}>⭐ Estrella</span>;
    case 'workhorse':
      return <span className={`${styles.matrixBadge} ${styles.badgeWorkhorse}`}>🐎 Caballo</span>;
    case 'puzzle':
      return <span className={`${styles.matrixBadge} ${styles.badgePuzzle}`}>🧩 Oportunidad</span>;
    default:
      return <span className={`${styles.matrixBadge} ${styles.badgeDog}`}>⚠️ Por Revisar</span>;
  }
};

const renderStockBadge = (status, maxPreparable) => {
  switch (status) {
    case 'out_of_stock':
      return <span className={`${styles.stockBadge} ${styles.stockOutOfStock}`}>🚫 Agotado</span>;
    case 'low_stock':
      return <span className={`${styles.stockBadge} ${styles.stockLow}`}>⚠️ Quedan {maxPreparable || 0}</span>;
    case 'in_stock':
      return <span className={`${styles.stockBadge} ${styles.stockInStock}`}>🟢 {maxPreparable !== null ? `${maxPreparable} porc.` : 'En Stock'}</span>;
    default:
      return <span className={`${styles.stockBadge} ${styles.stockUntracked}`}>⚪ Sin Receta</span>;
  }
};

export default memo(function ProductTableView({
  products = [],
  categoryMap = {},
  onSelect,
  onEdit,
  onManageImages,
  onManageAudience,
  onToggle
}) {
  const { hasPermission } = useAdminAuth();
  const canEdit = hasPermission('productos.edit');

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.productsTable}>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Categoría</th>
            <th className={styles.textRight}>Precio / Costo</th>
            <th className={styles.textRight}>Margen</th>
            <th className={styles.textCenter}>Inventario</th>
            <th className={styles.textRight}>Ventas</th>
            <th className={styles.textCenter}>Matriz</th>
            <th className={styles.textCenter}>Audiencia</th>
            <th className={styles.textCenter}>Estado</th>
            <th className={styles.textCenter}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const price = Number(p.price || 0);
            const cost = Number(p.effective_cost ?? p.cost ?? 0);
            const marginAmount = price - cost;
            const marginPercent = Number(p.margin_percent ?? (price > 0 ? ((marginAmount / price) * 100) : 0));

            const marginClass = marginPercent >= 55 
              ? styles.marginHigh 
              : marginPercent >= 40 
                ? styles.marginMedium 
                : styles.marginLow;

            return (
              <tr 
                key={p.id} 
                className={`${styles.tableRow} ${!p.is_active ? styles.rowInactive : ''}`}
                onClick={() => onSelect && onSelect(p)}
              >
                {/* Producto */}
                <td>
                  <div className={styles.tableProductCell}>
                    <ImageWithFallback 
                      src={p.image_url || 'https://placehold.co/80x80'} 
                      alt={p.name} 
                      className={styles.tableProductThumb} 
                    />
                    <div className={styles.tableProductInfo}>
                      <span className={styles.tableProductName}>{p.name}</span>
                      {p.description && (
                        <span className={styles.tableProductDesc}>
                          {p.description.slice(0, 60)}...
                        </span>
                      )}
                    </div>
                  </div>
                </td>

                {/* Categoría */}
                <td>
                  <span className={styles.tableCategoryTag}>
                    {categoryMap[p.category_id] || p.category_name || 'Sin categoría'}
                  </span>
                </td>

                {/* Precio / Costo */}
                <td className={styles.textRight}>
                  <div className={styles.tablePriceCol}>
                    <strong className={styles.tablePrice}>${price.toFixed(2)}</strong>
                    <span className={styles.tableCost}>Costo: ${cost.toFixed(2)}</span>
                  </div>
                </td>

                {/* Margen */}
                <td className={styles.textRight}>
                  <div className={styles.tableMarginCol}>
                    <span className={`${styles.marginBadge} ${marginClass}`}>
                      {marginPercent.toFixed(0)}%
                    </span>
                    <span className={styles.tableMarginAmount}>+${marginAmount.toFixed(2)}</span>
                  </div>
                </td>

                {/* Inventario */}
                <td className={styles.textCenter}>
                  {renderStockBadge(p.stock_status, p.max_preparable)}
                </td>

                {/* Ventas */}
                <td className={styles.textRight}>
                  <div className={styles.tableSalesCol}>
                    <span className={styles.tableTotalSold}>{p.total_sold || 0} uds</span>
                    <span className={styles.tableRevenue}>
                      ${Number(p.total_revenue || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </td>

                {/* Matriz */}
                <td className={styles.textCenter}>
                  {renderMatrixBadge(p.menu_matrix_class)}
                </td>

                {/* Audiencia */}
                <td className={styles.textCenter} onClick={(e) => e.stopPropagation()}>
                  <button
                    className={`${styles.tableAudienceBadge} ${p.is_exclusive ? styles.tableAudienceSpecial : styles.tableAudiencePublic}`}
                    onClick={() => onManageAudience && onManageAudience(p)}
                    title={p.is_exclusive ? `Exclusivo para ${p.target_customers_count || 0} cliente(s) - Clic para gestionar` : "Público general - Clic para restringir acceso"}
                    style={{ cursor: canEdit ? 'pointer' : 'default', border: 'none' }}
                  >
                    {p.is_exclusive ? (
                      <>
                        <Users size={12} style={{ marginRight: 3 }} />
                        {p.target_customers_count ? `${p.target_customers_count} clientes` : 'Especial'}
                      </>
                    ) : (
                      <>
                        <Globe size={12} style={{ marginRight: 3 }} />
                        Público
                      </>
                    )}
                  </button>
                </td>

                {/* Estado Activo/Inactivo */}
                <td className={styles.textCenter}>
                  {canEdit ? (
                    <button
                      className={`${styles.statusToggleBtn} ${p.is_active ? styles.statusActive : styles.statusInactive}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggle(p.id, p.is_active);
                      }}
                      title={p.is_active ? "Clic para desactivar" : "Clic para activar"}
                    >
                      <Power size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                      {p.is_active ? 'Activo' : 'Inactivo'}
                    </button>
                  ) : (
                    <span className={p.is_active ? styles.statusActive : styles.statusInactive}>
                      {p.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  )}
                </td>

                {/* Acciones */}
                <td className={styles.textCenter} onClick={(e) => e.stopPropagation()}>
                  <div className={styles.tableActionButtons}>
                    <button
                      className={styles.iconActionBtn}
                      onClick={() => onSelect && onSelect(p)}
                      title="Ver analítica 360°"
                    >
                      <Eye size={15} />
                    </button>
                    {canEdit && (
                      <>
                        <button
                          className={styles.iconActionBtn}
                          onClick={() => onEdit && onEdit(p)}
                          title="Editar producto"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          className={styles.iconActionBtn}
                          onClick={() => onManageImages && onManageImages(p)}
                          title="Gestionar fotos"
                        >
                          <Camera size={15} />
                        </button>
                        <button
                          className={styles.iconActionBtn}
                          onClick={() => onManageAudience && onManageAudience(p)}
                          title="Gestionar clientes y audiencia"
                        >
                          <Users size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
