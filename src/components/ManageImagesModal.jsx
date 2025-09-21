// src/components/ManageImagesModal.jsx

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import styles from './ManageImagesModal.module.css';
import { useAlert } from '../context/AlertContext'; // <-- IMPORTAR

export default function ManageImagesModal({ product, onClose, onImagesUpdate }) {
  const { showAlert } = useAlert(); // <-- INICIALIZAR
  const [images, setImages] = useState([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // La imagen principal y las secundarias se combinan para la vista
    const allImages = [
      { id: 'main', image_url: product.image_url, is_main: true },
      ...product.product_images.map(img => ({ ...img, is_main: false }))
    ].filter(img => img.image_url); // Filtra por si la principal es nula
    setImages(allImages);
  }, [product]);

  const addImage = async () => {
    if (!newImageUrl.trim()) {
      showAlert("La URL de la imagen no puede estar vacía.");
      return;
    }
    setLoading(true);
    const { error } = await supabase
      .from('product_images')
      .insert({ product_id: product.id, image_url: newImageUrl });

    if (error) {
      showAlert(`Error al añadir la imagen: ${error.message}`);
    } else {
      setNewImageUrl('');
      onImagesUpdate(); // Llama a la función para refrescar los datos en la página de Productos
    }
    setLoading(false);
  };

  const deleteImage = async (imageId, isMain) => {
    if (isMain) {
      showAlert("No puedes eliminar la imagen principal desde aquí. Puedes cambiarla editando el producto.");
      return;
    }
    if (!window.confirm("¿Estás seguro de que quieres eliminar esta imagen?")) return;

    setLoading(true);
    const { error } = await supabase
      .from('product_images')
      .delete()
      .eq('id', imageId);

    if (error) {
      showAlert(`Error al eliminar la imagen: ${error.message}`);
    } else {
      onImagesUpdate();
    }
    setLoading(false);
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className={styles.closeButton}>×</button>
        <h2>Gestionar Imágenes de: {product.name}</h2>
        
        <div className={styles.addImageForm}>
          <input
            type="text"
            placeholder="URL de la nueva imagen"
            value={newImageUrl}
            onChange={(e) => setNewImageUrl(e.target.value)}
          />
          <button onClick={addImage} disabled={loading}>
            {loading ? 'Añadiendo...' : 'Añadir Imagen'}
          </button>
        </div>

        <div className={styles.imageList}>
          {images.map(img => (
            <div key={img.id} className={styles.imageItem}>
              <img src={img.image_url} alt="Vista previa del producto" />
              <span>{img.is_main ? 'Principal' : 'Secundaria'}</span>
              {!img.is_main && (
                <button onClick={() => deleteImage(img.id, img.is_main)} disabled={loading} className={styles.deleteButton}>
                  Eliminar
                </button>
              )}
            </div>
          ))}
          {images.length === 0 && <p>Este producto aún no tiene imágenes.</p>}
        </div>
      </div>
    </div>
  );
}