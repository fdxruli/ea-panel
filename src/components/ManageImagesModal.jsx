// src/components/ManageImagesModal.jsx

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import styles from './ManageImagesModal.module.css';
import { useAlert } from '../context/AlertContext';
import ImageWithFallback from './ImageWithFallback';

export default function ManageImagesModal({ product, isOpen, onClose, onImagesUpdate }) {
  const { showAlert } = useAlert();
  const [images, setImages] = useState([]);
  const [imageFile, setImageFile] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (product) {
      const allImages = [
        { id: 'main', image_url: product.image_url, is_main: true },
        // --- 👇 LA CORRECCIÓN ESTÁ AQUÍ ---
        // Añadimos '|| []' para que si 'product_images' es null, se use un arreglo vacío en su lugar.
        ...(product.product_images || []).map(img => ({ ...img, is_main: false }))
      ].filter(img => img.image_url);
      setImages(allImages);
    }
  }, [product, isOpen]); // Añadimos isOpen para asegurar que se recargue al abrir

  if (!isOpen) return null;

  const handleFileChange = (e) => {
      if (e.target.files && e.target.files[0]) {
          setImageFile(e.target.files[0]);
      }
  };

  const addImage = async () => {
    if (!imageFile) {
      showAlert("Por favor, selecciona un archivo de imagen.");
      return;
    }
    setLoading(true);

    try {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${product.id}-${Date.now()}.${fileExt}`;
        const filePath = `products/${fileName}`;
        
        const { error: uploadError } = await supabase.storage.from('images').upload(filePath, imageFile);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(filePath);

        const { error: insertError } = await supabase
            .from('product_images')
            .insert({ product_id: product.id, image_url: publicUrl });
        
        if (insertError) throw insertError;

        setImageFile(null);
        if (document.getElementById('image-upload-input')) {
            document.getElementById('image-upload-input').value = ""; 
        }
        onImagesUpdate(); // Esto refrescará los datos en la vista de Productos
        showAlert("Imagen añadida con éxito.");

    } catch (error) {
        showAlert(`Error al añadir la imagen: ${error.message}`);
    } finally {
        setLoading(false);
    }
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
      showAlert("Imagen eliminada.");
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
            id="image-upload-input"
            type="file"
            onChange={handleFileChange}
            accept="image/*"
          />
          <button onClick={addImage} disabled={loading}>
            {loading ? 'Subiendo...' : 'Añadir Imagen'}
          </button>
        </div>

        <div className={styles.imageList}>
          {images.map(img => (
            <div key={img.id} className={styles.imageItem}>
              <ImageWithFallback src={img.image_url} alt="Vista previa del producto" />
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