import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner"; // <-- Importa el spinner

export default function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newProduct, setNewProduct] = useState({
    name: "",
    description: "",
    price: "",
    cost: "",
    category_id: "",
    image_url: ""
  });

  // Traer productos
  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) console.error(error);
    else setProducts(data);
    setLoading(false);
  };

  // Traer categorías
  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("name", { ascending: true });
    if (error) console.error(error);
    else setCategories(data);
  };

  useEffect(() => {
    fetchCategories();
    fetchProducts();
  }, []);

  // Validación básica antes de agregar
  const validateProduct = () => {
    if (!newProduct.name || !newProduct.price || !newProduct.cost || !newProduct.category_id) {
      alert("Por favor completa todos los campos obligatorios (Nombre, Precio, Costo y Categoría).");
      return false;
    }
    if (parseFloat(newProduct.price) < parseFloat(newProduct.cost)) {
      alert("El precio no puede ser menor al costo.");
      return false;
    }
    return true;
  };

  // Crear nuevo producto
  const addProduct = async () => {
    if (!validateProduct()) return;

    const { error } = await supabase.from("products").insert([newProduct]);
    if (error) console.error(error);
    else {
      setNewProduct({ name: "", description: "", price: "", cost: "", category_id: "", image_url: "" });
      fetchProducts();
    }
  };

  // Activar/Desactivar producto
  const toggleActive = async (id, isActive) => {
    const { error } = await supabase
      .from("products")
      .update({ is_active: !isActive })
      .eq("id", id);
    if (error) console.error(error);
    else fetchProducts();
  };

  if (loading) return <LoadingSpinner />; // <-- Usa el spinner

  return (
    <div>
      <h1>Productos</h1>

      {/* Formulario para agregar producto */}
      <div className="form-container">
        <h3>Agregar nuevo producto</h3>
        <input
          type="text"
          placeholder="Nombre"
          value={newProduct.name}
          onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
        />
        <input
          type="text"
          placeholder="Descripción"
          value={newProduct.description}
          onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
        />
        <input
          type="number"
          placeholder="Precio"
          value={newProduct.price}
          onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
        />
        <input
          type="number"
          placeholder="Costo"
          value={newProduct.cost}
          onChange={(e) => setNewProduct({ ...newProduct, cost: e.target.value })}
        />
        <select
          value={newProduct.category_id}
          onChange={(e) => setNewProduct({ ...newProduct, category_id: e.target.value })}
        >
          <option value="">Selecciona categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="URL Imagen (opcional)"
          value={newProduct.image_url}
          onChange={(e) => setNewProduct({ ...newProduct, image_url: e.target.value })}
        />
        <button onClick={addProduct}>Agregar</button>
      </div>

      {/* Tabla de productos */}
      <table className="products-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Descripción</th>
            <th>Categoría</th>
            <th>Precio</th>
            <th>Costo</th>
            <th>Activo</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.description}</td>
              <td>{categories.find((c) => c.id === p.category_id)?.name || "Sin categoría"}</td>
              <td>${p.price}</td>
              <td>${p.cost}</td>
              <td>{p.is_active ? "Sí" : "No"}</td>
              <td>
                <button onClick={() => toggleActive(p.id, p.is_active)}>
                  {p.is_active ? "Desactivar" : "Activar"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}