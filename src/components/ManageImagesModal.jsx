// src/components/ManageImagesModal.jsx (MEJORADO CON useRef)

import React, { useState, useEffect, useRef } from 'react'; // 1. Importar useRef
import { supabase } from '../lib/supabaseClient';
import styles from './ManageImagesModal.module.css';
import { useAlert } from '../context/AlertContext';

export default function ManageImagesModal({ product, onClose, onImagesUpdate }) {
  const { showAlert } = useAlert();
  const [images, setImages] = useState([]);
  const [newImageFile, setNewImageFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const imageInputRef = useRef(null); // 2. Crear la referencia

  useEffect(() => {
    const allImages = [
      { id: 'main', image_url: product.image_url, is_main: true },
      ...product.product_images.map(img => ({ ...img, is_main: false }))
    ].filter(img => img.image_url);
    setImages(allImages);
  }, [product]);

  const handleFileChange = (event) => {
    if (event.target.files && event.target.files[0]) {
        setNewImageFile(event.target.files[0]);
    }
  };

  const addImage = async () => {
    if (!newImageFile) {
      showAlert("Por favor, selecciona un archivo de imagen.");
      return;
    }
    setLoading(true);

    try {
        const fileExt = newImageFile.name.split('.').pop();
        const fileName = `${product.id}-${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('imagenes-productos')
            .upload(filePath, newImageFile);
        if (uploadError) throw uploadError;

        const { data } = supabase.storage
            .from('imagenes-productos')
            .getPublicUrl(filePath);
        
        const { error: insertError } = await supabase
            .from('product_images')
            .insert({ product_id: product.id, image_url: data.publicUrl });
        if (insertError) throw insertError;

        setNewImageFile(null);
        // 4. Usar la referencia para limpiar de forma segura
        if (imageInputRef.current) {
            imageInputRef.current.value = '';
        }

        await onImagesUpdate(); // Esperamos a que se actualicen los datos
        showAlert("¡Imagen subida y añadida con éxito!");

    } catch (error) {
        showAlert(`Error al añadir la imagen: ${error.message}`);
    } finally {
        setLoading(false);
    }
  };

  // La función deleteImage no necesita cambios
  const deleteImage = async (imageId, imageUrl) => {
    if (imageId === 'main') {
        showAlert("No puedes eliminar la imagen principal. Puedes cambiarla editando el producto.");
        return;
    }
    if (!window.confirm("¿Estás seguro de que quieres eliminar esta imagen?")) return;
    setLoading(true);
    try {
        const fileName = imageUrl.split('/').pop();
        await supabase.storage.from('imagenes-productos').remove([fileName]);
        await supabase.from('product_images').delete().eq('id', imageId);
        await onImagesUpdate();
        showAlert("Imagen eliminada correctamente.");
    } catch (error) {
        showAlert(`Error al eliminar la imagen: ${error.message}`);
    } finally {
        setLoading(false);
    }
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
            accept="image/png, image/jpeg, image/webp"
            onChange={handleFileChange}
            style={{flexGrow: 1}}
            ref={imageInputRef} // 3. Asignar la referencia
          />
          <button onClick={addImage} disabled={loading}>
            {loading ? 'Subiendo...' : 'Añadir Imagen'}
          </button>
        </div>

        {/* La lista de imágenes no cambia */}
        <div className={styles.imageList}>
          {images.map(img => (
            <div key={img.id} className={styles.imageItem}>
              <img src={img.image_url} alt="Vista previa del producto" />
              <span>{img.is_main ? 'Principal' : 'Secundaria'}</span>
              {!img.is_main && (
                <button onClick={() => deleteImage(img.id, img.image_url)} disabled={loading} className={styles.deleteButton}>
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