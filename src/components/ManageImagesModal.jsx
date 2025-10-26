import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import styles from './ManageImagesModal.module.css';
import { useAlert } from '../context/AlertContext';
import ImageWithFallback from './ImageWithFallback';
import imageCompression from 'browser-image-compression';

export default function ManageImagesModal({ product, isOpen, onClose, onImagesUpdate }) {
  const { showAlert } = useAlert();
  const [images, setImages] = useState([]);
  const [imageFile, setImageFile] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (product) {
      const allImages = [
        { id: 'main', image_url: product.image_url, is_main: true },
        ...(product.product_images || []).map(img => ({ ...img, is_main: false }))
      ].filter(img => img.image_url);
      setImages(allImages);
    }
  }, [product, isOpen]);

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
      const options = {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1024,
        useWebWorker: true,
        fileType: 'image/webp',
        initialQuality: 0.8
      };

      showAlert("Comprimiendo y convirtiendo imagen...");
      const compressedFile = await imageCompression(imageFile, options);
      const fileName = `${product.id}-${Date.now()}.webp`;
      const filePath = `products/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, compressedFile, { contentType: 'image/webp' });

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

      onImagesUpdate();
      showAlert("Imagen añadida con éxito.");
    } catch (error) {
      showAlert(`Error al añadir la imagen: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const deleteImage = async (imageId, isMain) => {
    if (isMain) {
      showAlert("No puedes eliminar la imagen principal. Edita el producto para cambiarla.");
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
        <div className={styles.modalHeader}>
          <h2>Gestionar Imágenes - {product?.name}</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <div className={styles.addImageSection}>
          <h3>Añadir Nueva Imagen</h3>
          <div className={styles.fileInputWrapper}>
            <input
              id="image-upload-input"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className={styles.fileInput}
              disabled={loading}
            />
            <label htmlFor="image-upload-input" className={styles.fileInputLabel}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              {imageFile ? imageFile.name : 'Seleccionar imagen'}
            </label>
            {imageFile && (
              <div className={styles.fileName}>
                ✓ Archivo seleccionado: {imageFile.name}
              </div>
            )}
          </div>
          <button 
            className={styles.addButton} 
            onClick={addImage} 
            disabled={loading || !imageFile}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            {loading ? 'Subiendo...' : 'Añadir Imagen'}
          </button>
        </div>

        {images.length > 0 ? (
          <div className={styles.imageList}>
            {images.map((img) => (
              <div key={img.id} className={styles.imageItem}>
                <div className={styles.imageWrapper}>
                  {img.is_main && (
                    <div className={styles.mainBadge}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                      </svg>
                      Principal
                    </div>
                  )}
                  <ImageWithFallback
                    src={img.image_url}
                    alt={`Imagen ${img.id}`}
                  />
                </div>
                <div className={styles.imageActions}>
                  <button
                    className={styles.deleteButton}
                    onClick={() => deleteImage(img.id, img.is_main)}
                    disabled={loading || img.is_main}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
            <p>Este producto aún no tiene imágenes</p>
          </div>
        )}
      </div>
    </div>
  );
}
