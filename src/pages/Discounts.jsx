import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Discounts() {
  const [discounts, setDiscounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newDiscount, setNewDiscount] = useState({
    code: "",
    type: "global",
    value: "",
    target_id: "",
    start_date: "",
    end_date: "",
    is_active: true
  });

  // Traer descuentos
  const fetchDiscounts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("discounts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) console.error(error);
    else setDiscounts(data);
    setLoading(false);
  };

  // Traer categorías y productos
  const fetchCategories = async () => {
    const { data, error } = await supabase.from("categories").select("*");
    if (error) console.error(error);
    else setCategories(data);
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase.from("products").select("*");
    if (error) console.error(error);
    else setProducts(data);
  };

  useEffect(() => {
    fetchDiscounts();
    fetchCategories();
    fetchProducts();
  }, []);

  // Validación simple antes de agregar
  const validateDiscount = () => {
    if (!newDiscount.code || !newDiscount.value) {
      alert("Código y valor son obligatorios");
      return false;
    }
    if (newDiscount.type !== "global" && !newDiscount.target_id) {
      alert("Debe seleccionar un producto o categoría para este tipo de descuento");
      return false;
    }
    if (newDiscount.start_date && newDiscount.end_date && newDiscount.end_date < newDiscount.start_date) {
      alert("La fecha final no puede ser anterior a la inicial");
      return false;
    }
    return true;
  };

  // Agregar descuento
  const addDiscount = async () => {
    if (!validateDiscount()) return;
    const { error } = await supabase.from("discounts").insert([newDiscount]);
    if (error) console.error(error);
    else {
      setNewDiscount({
        code: "",
        type: "global",
        value: "",
        target_id: "",
        start_date: "",
        end_date: "",
        is_active: true
      });
      fetchDiscounts();
    }
  };

  // Activar/desactivar
  const toggleActive = async (id, isActive) => {
    const { error } = await supabase
      .from("discounts")
      .update({ is_active: !isActive })
      .eq("id", id);
    if (error) console.error(error);
    else fetchDiscounts();
  };

  if (loading) return <p>Cargando descuentos...</p>;

  return (
    <div>
      <h1>Descuentos</h1>

      {/* Formulario agregar descuento */}
      <div className="form-container">
        <h3>Agregar nuevo descuento</h3>
        <input
          type="text"
          placeholder="Código"
          value={newDiscount.code}
          onChange={(e) => setNewDiscount({ ...newDiscount, code: e.target.value.toUpperCase() })}
        />
        <select
          value={newDiscount.type}
          onChange={(e) => setNewDiscount({ ...newDiscount, type: e.target.value, target_id: "" })}
        >
          <option value="global">Global</option>
          <option value="category">Por categoría</option>
          <option value="product">Por producto</option>
        </select>
        {(newDiscount.type === "category") && (
          <select
            value={newDiscount.target_id}
            onChange={(e) => setNewDiscount({ ...newDiscount, target_id: e.target.value })}
          >
            <option value="">Selecciona categoría</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        {(newDiscount.type === "product") && (
          <select
            value={newDiscount.target_id}
            onChange={(e) => setNewDiscount({ ...newDiscount, target_id: e.target.value })}
          >
            <option value="">Selecciona producto</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        <input
          type="number"
          placeholder="Valor del descuento"
          value={newDiscount.value}
          onChange={(e) => setNewDiscount({ ...newDiscount, value: e.target.value })}
        />
        <input
          type="date"
          value={newDiscount.start_date}
          onChange={(e) => setNewDiscount({ ...newDiscount, start_date: e.target.value })}
        />
        <input
          type="date"
          value={newDiscount.end_date}
          onChange={(e) => setNewDiscount({ ...newDiscount, end_date: e.target.value })}
        />
        <button onClick={addDiscount}>Agregar</button>
      </div>

      {/* Tabla descuentos */}
      <table className="products-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Tipo</th>
            <th>Objetivo</th>
            <th>Valor</th>
            <th>Activo</th>
            <th>Fechas</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {discounts.map(d => (
            <tr key={d.id}>
              <td>{d.code}</td>
              <td>{d.type}</td>
              <td>
                {d.type === "global" ? "Todos" :
                 d.type === "category" ? categories.find(c => c.id === d.target_id)?.name || "N/A" :
                 products.find(p => p.id === d.target_id)?.name || "N/A"}
              </td>
              <td>{d.value}</td>
              <td>{d.is_active ? "Sí" : "No"}</td>
              <td>{d.start_date || "—"} / {d.end_date || "—"}</td>
              <td>
                <button onClick={() => toggleActive(d.id, d.is_active)}>
                  {d.is_active ? "Desactivar" : "Activar"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
