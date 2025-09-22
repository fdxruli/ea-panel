// src/pages/Products.jsx (CON PRECIOS ESPECIALES Y DESCRIPCIÓN EN LA TABLA)

import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import ManageImagesModal from "../components/ManageImagesModal";
import { useAlert } from "../context/AlertContext";
import { useAdminAuth } from "../context/AdminAuthContext";

export default function Products() {
  const { showAlert } = useAlert();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [specialPrices, setSpecialPrices] = useState([]); // <-- 1. Estado para precios especiales
  const [loading, setLoading] = useState(true);
  const { hasPermission } = useAdminAuth();

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

  // --- 👇 2. FUNCIÓN PARA OBTENER PRECIOS ESPECIALES ---
  const fetchSpecialPrices = async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('special_prices')
      .select('*')
      .lte('start_date', today)
      .gte('end_date', today);
    
    if (error) {
      console.error('Error fetching special prices:', error);
    } else {
      setSpecialPrices(data);
    }
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from("products")
      .select(`*, product_images(*)`)
      .order("created_at", { ascending: false });

    if (error) console.error(error);
    else setProducts(data);
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
    constfetchAllData = async () => {
      setLoading(true);
      await Promise.all([
        fetchCategories(),
        fetchProducts(),
        fetchSpecialPrices() // <-- 3. Llamar a la función
      ]);
      setLoading(false);
    }
    fetchAllData();
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

  // --- 👇 4. FUNCIÓN PARA CALCULAR EL PRECIO VIGENTE ---
  const getVigentePrice = (product) => {
    // Primero, busca un precio especial para el producto específico
    const productPrice = specialPrices.find(p => p.product_id === product.id);

    if (productPrice) {
      return (
        <>
          <span style={{ textDecoration: 'line-through', marginRight: '10px', color: '#888' }}>
            ${parseFloat(product.price).toFixed(2)}
          </span>
          <strong style={{ color: 'green' }}>${parseFloat(productPrice.override_price).toFixed(2)}</strong>
        </>
      );
    }
    
    // Si no hay precio para el producto, busca para su categoría
    const categoryPrice = specialPrices.find(p => p.category_id === product.category_id);

    if (categoryPrice) {
      return (
        <>
          <span style={{ textDecoration: 'line-through', marginRight: '10px', color: '#888' }}>
            ${parseFloat(product.price).toFixed(2)}
          </span>
          <strong style={{ color: 'green' }}>${parseFloat(categoryPrice.override_price).toFixed(2)}</strong>
        </>
      );
    }
    
    // Si no hay ningún precio especial, muestra el precio base
    return `$${parseFloat(product.price).toFixed(2)}`;
  };


  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <h1>Productos</h1>

      {hasPermission('productos.edit') && (
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
      )}

      <table className="products-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Descripción</th>
            <th>Categoría</th>
            <th>Precio</th>
            <th>Costo</th>
            {(hasPermission('productos.edit') || hasPermission('productos.delete')) && (
              <>
                <th>Imágenes</th>
                <th>Acciones</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.description || 'N/A'}</td>
              <td>{categories.find(c => c.id === p.category_id)?.name || 'N/A'}</td>
              {/* --- 👇 5. USAMOS LA FUNCIÓN PARA MOSTRAR EL PRECIO --- */}
              <td>{getVigentePrice(p)}</td>
              <td>${parseFloat(p.cost).toFixed(2)}</td>
              {(hasPermission('productos.edit') || hasPermission('productos.delete')) && (
                <>
                  <td>
                    Principal + {p.product_images.length}
                    {hasPermission('productos.edit') &&
                      <button onClick={() => openImageManager(p)} style={{marginLeft: '10px'}}>Gestionar</button>
                    }
                  </td>
                  <td>
                    {hasPermission('productos.delete') &&
                      <button onClick={() => toggleActive(p.id, p.is_active)}>
                        {p.is_active ? "Desactivar" : "Activar"}
                      </button>
                    }
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {isModalOpen && ( <ManageImagesModal product={selectedProduct} onClose={() => setIsModalOpen(false)} onImagesUpdate={() => { fetchProducts(); setIsModalOpen(false); }} /> )}
    </div>
  );
}
