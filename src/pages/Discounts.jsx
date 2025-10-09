import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import { useAlert } from "../context/AlertContext";
import styles from "./Discounts.module.css";
import { useAdminAuth } from '../context/AdminAuthContext';

export default function Discounts() {
    const { showAlert } = useAlert();
    const { hasPermission } = useAdminAuth();
    const [discounts, setDiscounts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newDiscount, setNewDiscount] = useState({
        code: "",
        type: "global",
        value: "",
        target_id: null,
        start_date: "",
        end_date: "",
        is_active: true
    });
    
    const canEdit = hasPermission('descuentos.edit');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const discountsPromise = supabase.from("discounts").select("*").order("created_at", { ascending: false });
            const categoriesPromise = supabase.from("categories").select("*");
            const productsPromise = supabase.from("products").select("id, name");

            const [discountsRes, categoriesRes, productsRes] = await Promise.all([discountsPromise, categoriesPromise, productsPromise]);

            if (discountsRes.error) throw discountsRes.error;
            if (categoriesRes.error) throw categoriesRes.error;
            if (productsRes.error) throw productsRes.error;
            
            setDiscounts(discountsRes.data);
            setCategories(categoriesRes.data);
            setProducts(productsRes.data);

        } catch (error) {
            showAlert(`Error al cargar datos: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }, [showAlert]);

    useEffect(() => {
        fetchData();
        const channel = supabase.channel('public:discounts')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'discounts' }, (payload) => {
            console.log('Change detected in discounts!', payload);
            fetchData();
          })
          .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchData]);

    const validateDiscount = () => {
        if (!newDiscount.code || !newDiscount.value) {
            showAlert("El código y el valor en % son obligatorios.");
            return false;
        }
        if (newDiscount.type !== "global" && !newDiscount.target_id) {
            showAlert("Debe seleccionar un producto o categoría para este tipo de descuento.");
            return false;
        }
        if (newDiscount.start_date && newDiscount.end_date && newDiscount.end_date < newDiscount.start_date) {
            showAlert("La fecha final no puede ser anterior a la inicial.");
            return false;
        }
        return true;
    };

    const addDiscount = async () => {
        if (!canEdit) return;
        if (!validateDiscount()) return;
        
        const dataToInsert = { ...newDiscount, target_id: newDiscount.target_id || null };
        
        const { error } = await supabase.from("discounts").insert([dataToInsert]);
        if (error) {
            showAlert(`Error al crear el descuento: ${error.message}`);
        } else {
            showAlert("¡Descuento creado con éxito!");
            setNewDiscount({ code: "", type: "global", value: "", target_id: null, start_date: "", end_date: "", is_active: true });
            fetchData();
        }
    };

    const toggleActive = async (id, isActive) => {
        if (!canEdit) return;
        const { error } = await supabase.from("discounts").update({ is_active: !isActive }).eq("id", id);
        if (error) {
            showAlert(`Error al actualizar: ${error.message}`);
        } else {
            showAlert("Estado del descuento actualizado.");
            fetchData();
        }
    };
    
    const getTargetName = (d) => {
        if (d.type === "global") return "Toda la tienda";
        if (d.type === "category") return categories.find(c => c.id === d.target_id)?.name || "Categoría no encontrada";
        if (d.type === "product") return products.find(p => p.id === d.target_id)?.name || "Producto no encontrado";
        return "N/A";
    }

    if (loading) return <LoadingSpinner />;

    return (
        <div className={styles.container}>
            <h1>Gestión de Descuentos</h1>
            
            {canEdit && (
                <div className="form-container">
                    <h3>Crear Nuevo Descuento</h3>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label htmlFor="code">Código</label>
                            <input id="code" type="text" placeholder="Ej: BIENVENIDO10" value={newDiscount.code} onChange={(e) => setNewDiscount({ ...newDiscount, code: e.target.value.toUpperCase() })} />
                        </div>
                         <div className={styles.formGroup}>
                            <label htmlFor="value">Valor (%)</label>
                            <input id="value" type="number" placeholder="Ej: 15" value={newDiscount.value} onChange={(e) => setNewDiscount({ ...newDiscount, value: e.target.value })} />
                        </div>
                        <div className={styles.formGroup}>
                            <label htmlFor="type">Tipo de Descuento</label>
                            <select id="type" value={newDiscount.type} onChange={(e) => setNewDiscount({ ...newDiscount, type: e.target.value, target_id: "" })}>
                                <option value="global">Global</option>
                                <option value="category">Por Categoría</option>
                                <option value="product">Por Producto</option>
                            </select>
                        </div>
                        {newDiscount.type !== "global" && (
                            <div className={styles.formGroup}>
                               <label htmlFor="target_id">{newDiscount.type === 'category' ? 'Categoría' : 'Producto'}</label>
                               <select id="target_id" value={newDiscount.target_id} onChange={(e) => setNewDiscount({ ...newDiscount, target_id: e.target.value })}>
                                   <option value="">Selecciona una opción</option>
                                   {(newDiscount.type === 'category' ? categories : products).map(item => (
                                       <option key={item.id} value={item.id}>{item.name}</option>
                                   ))}
                               </select>
                            </div>
                        )}
                         <div className={styles.formGroup}>
                            <label htmlFor="start_date">Fecha de Inicio (Opcional)</label>
                            <input id="start_date" type="date" value={newDiscount.start_date} onChange={(e) => setNewDiscount({ ...newDiscount, start_date: e.target.value })} />
                        </div>
                        <div className={styles.formGroup}>
                            <label htmlFor="end_date">Fecha de Fin (Opcional)</label>
                            <input id="end_date" type="date" value={newDiscount.end_date} onChange={(e) => setNewDiscount({ ...newDiscount, end_date: e.target.value })} />
                        </div>

                        <button onClick={addDiscount} className={styles.addButton}>Crear Descuento</button>
                    </div>
                </div>
            )}
            
            <div className="table-wrapper">
                <table className="products-table">
                    <thead>
                        <tr>
                            <th>Código</th>
                            <th>Valor</th>
                            <th>Tipo</th>
                            <th>Objetivo</th>
                            <th>Fechas de validez</th>
                            <th>Estado</th>
                            {canEdit && <th>Acciones</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {discounts.map(d => (
                            <tr key={d.id}>
                                <td><strong>{d.code}</strong></td>
                                <td>{d.value}%</td>
                                <td>
                                    <span className={`${styles.statusBadge} ${styles.typeBadge}`}>
                                        {d.type}
                                    </span>
                                </td>
                                <td>{getTargetName(d)}</td>
                                <td>{d.start_date || "N/A"} - {d.end_date || "N/A"}</td>
                                <td>
                                    <span className={`${styles.statusBadge} ${d.is_active ? styles.statusActive : styles.statusInactive}`}>
                                        {d.is_active ? "Activo" : "Inactivo"}
                                    </span>
                                </td>
                                {canEdit && (
                                    <td>
                                        <button onClick={() => toggleActive(d.id, d.is_active)} className={`${styles.toggleButton} ${d.is_active ? styles.inactive : styles.active}`}>
                                            {d.is_active ? "Desactivar" : "Activar"}
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

        </div>
    );
}