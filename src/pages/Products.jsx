// src/pages/Products.jsx (CON DESCRIPCIÓN EN LA TABLA)

import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import ManageImagesModal from "../components/ManageImagesModal";
import { useAlert } from "../context/AlertContext";

export default function Products() {
    const { showAlert } = useAlert();
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

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select(`*, product_images(*)`)
      .order("created_at", { ascending: false });
      
    if (error) console.error(error);
    else setProducts(data);
    setLoading(false);
  };

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

  const validateProduct = () => {
    if (!newProduct.name || !newProduct.price || !newProduct.cost || !newProduct.category_id) {
      showAlert("Por favor completa todos los campos obligatorios (Nombre, Precio, Costo y Categoría).");
      return false;
    }
    if (parseFloat(newProduct.price) < parseFloat(newProduct.cost)) {
      showAlert("El precio no puede ser menor al costo.");
      return false;
    }
    return true;
  };
  
  const addProduct = async () => {
    if (!validateProduct()) return;
    const { error } = await supabase.from("products").insert([newProduct]);
    if (error) console.error(error);
    else {
      setNewProduct({ name: "", description: "", price: "", cost: "", category_id: "", image_url: "" });
      fetchProducts();
    }
  };

  const toggleActive = async (id, isActive) => {
    const { error } = await supabase
      .from("products")
      .update({ is_active: !isActive })
      .eq("id", id);
    if (error) console.error(error);
    else fetchProducts();
  };

  const openImageManager = (product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <h1>Productos</h1>

      {/* Formulario para agregar producto */}
      <div className="form-container">
        <h3>Agregar nuevo producto</h3>
        <input type="text" placeholder="Nombre del Producto" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} />
        <input type="text" placeholder="Descripción" value={newProduct.description} onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })} />
        <input type="number" placeholder="Precio de Venta ($)" value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })} />
        <input type="number" placeholder="Costo ($)" value={newProduct.cost} onChange={(e) => setNewProduct({ ...newProduct, cost: e.target.value })} />
        <select value={newProduct.category_id} onChange={(e) => setNewProduct({ ...newProduct, category_id: e.target.value })}>
          <option value="">-- Selecciona una Categoría --</option>
          {categories.map(category => (<option key={category.id} value={category.id}>{category.name}</option>))}
        </select>
        <input type="text" placeholder="URL Imagen Principal (Portada)" value={newProduct.image_url} onChange={(e) => setNewProduct({ ...newProduct, image_url: e.target.value })} />
        <button onClick={addProduct}>Agregar Producto</button>
      </div>

      {/* --- TABLA ACTUALIZADA CON DESCRIPCIÓN --- */}
      <table className="products-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Descripción</th>
            <th>Categoría</th>
            <th>Precio</th>
            <th>Costo</th>
            <th>Imágenes</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.description || 'N/A'}</td> {/* <-- AQUÍ SE AÑADIÓ */}
              <td>
                {categories.find(c => c.id === p.category_id)?.name || 'N/A'}
              </td>
              <td>${p.price}</td>
              <td>${p.cost}</td>
              <td>
                Principal + {p.product_images.length}
                <button onClick={() => openImageManager(p)} style={{marginLeft: '10px'}}>
                  Gestionar
                </button>
              </td>
              <td>
                <button onClick={() => toggleActive(p.id, p.is_active)}>
                  {p.is_active ? "Desactivar" : "Activar"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* ------------------------------------------- */}

      {isModalOpen && (
        <ManageImagesModal
          product={selectedProduct}
          onClose={() => setIsModalOpen(false)}
          onImagesUpdate={() => {
            fetchProducts();
            setIsModalOpen(false);
          }}
        />
      )}
    </div>
  );
}