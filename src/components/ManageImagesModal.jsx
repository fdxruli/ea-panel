import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import styles from './ManageImagesModal.module.css';
import { useAlert } from '../context/AlertContext';
import ImageWithFallback from './ImageWithFallback';
import imageCompression from 'browser-image-compression';

export default function ManageImagesModal({ product, isOpen, onClose, onImagesUpdate }) {
  const { showAlert } = useAlert();
  const [images, setImages] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    if (product) {
      const allImages = [
        { id: 'main', image_url: product.image_url, is_main: true },
        ...(product.product_images || []).map(img => ({ ...img, is_main: false }))
      ].filter(img => img.image_url);
      setImages(allImages);
    }
  }, [product, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      clearAllPreviews();
      setNotification(null);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      previewUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  if (!isOpen) return null;

  // Mostrar notificación temporal
  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const isDuplicateFile = (newFile, existingFiles) => {
    return existingFiles.some(existingFile => {
      return existingFile.name === newFile.name && 
             existingFile.size === newFile.size;
    });
  };

  const getFileKey = (file) => {
    return `${file.name}-${file.size}-${file.lastModified}`;
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    
    if (files.length === 0) return;

    let duplicatesFound = 0;
    let addedCount = 0;
    const newFiles = [...selectedFiles];
    const newPreviews = [...previewUrls];
    
    files.forEach(file => {
      if (isDuplicateFile(file, newFiles)) {
        duplicatesFound++;
        return;
      }
      
      newFiles.push(file);
      const url = URL.createObjectURL(file);
      newPreviews.push(url);
      addedCount++;
    });

    if (duplicatesFound > 0 && addedCount > 0) {
      showNotification(
        `${addedCount} imagen(es) agregada(s). ${duplicatesFound} duplicada(s) omitida(s)`,
        'warning'
      );
    } else if (duplicatesFound > 0) {
      showNotification(
        `${duplicatesFound} imagen(es) duplicada(s) no se agregaron`,
        'error'
      );
    } else if (addedCount > 0) {
      showNotification(`${addedCount} imagen(es) seleccionada(s)`, 'success');
    }

    setSelectedFiles(newFiles);
    setPreviewUrls(newPreviews);
    e.target.value = '';
  };

  const removePreviewAtIndex = (index) => {
    URL.revokeObjectURL(previewUrls[index]);
    
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    const newPreviews = previewUrls.filter((_, i) => i !== index);
    
    setSelectedFiles(newFiles);
    setPreviewUrls(newPreviews);
  };

  const clearAllPreviews = () => {
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    setSelectedFiles([]);
    setPreviewUrls([]);
  };

  const uploadImages = async () => {
    if (selectedFiles.length === 0) {
      showNotification("Por favor, selecciona al menos una imagen", 'error');
      return;
    }

    setLoading(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const file of selectedFiles) {
        try {
          const options = {
            maxSizeMB: 0.5,
            maxWidthOrHeight: 1024,
            useWebWorker: true,
            fileType: 'image/webp',
            initialQuality: 0.8
          };

          const compressedFile = await imageCompression(file, options);
          const fileName = `${product.id}-${Date.now()}-${Math.random().toString(36).substring(7)}.webp`;
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

          successCount++;
        } catch (error) {
          console.error(`Error al subir ${file.name}:`, error);
          failCount++;
        }
      }

      clearAllPreviews();
      onImagesUpdate();

      if (failCount === 0) {
        showNotification(`${successCount} imagen(es) subida(s) exitosamente`, 'success');
      } else {
        showNotification(`${successCount} exitosas, ${failCount} fallidas`, 'warning');
      }
    } catch (error) {
      showNotification(`Error al subir las imágenes: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const deleteImage = async (imageId, isMain) => {
    if (isMain) {
      showNotification("No puedes eliminar la imagen principal", 'error');
      return;
    }

    if (!window.confirm("¿Estás seguro de que quieres eliminar esta imagen?")) return;

    setLoading(true);
    const { error } = await supabase
      .from('product_images')
      .delete()
      .eq('id', imageId);

    if (error) {
      showNotification(`Error al eliminar la imagen: ${error.message}`, 'error');
    } else {
      onImagesUpdate();
      showNotification("Imagen eliminada correctamente", 'success');
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

        {/* Notificación inline */}
        {notification && (
          <div className={`${styles.notification} ${styles[notification.type]}`}>
            <div className={styles.notificationContent}>
              {notification.type === 'success' && (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
              )}
              {notification.type === 'error' && (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
              )}
              {notification.type === 'warning' && (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              )}
              <span>{notification.message}</span>
            </div>
            <button 
              className={styles.notificationClose}
              onClick={() => setNotification(null)}
              aria-label="Cerrar notificación"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        )}

        <div className={styles.modalBody}>
          <div className={styles.addImageSection}>
            <h3>Añadir Nuevas Imágenes</h3>
            
            <div className={styles.fileInputWrapper}>
              <input
                id="image-upload-input"
                type="file"
                accept="image/*"
                multiple
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
                {selectedFiles.length > 0 
                  ? `${selectedFiles.length} imagen(es) seleccionada(s) - Agregar más` 
                  : 'Seleccionar imágenes (múltiples)'}
              </label>
            </div>

            {selectedFiles.length > 0 && (
              <>
                <div className={styles.previewGrid}>
                  {selectedFiles.map((file, index) => (
                    <div key={getFileKey(file)} className={styles.previewCard}>
                      <div className={styles.previewImageWrapper}>
                        <img 
                          src={previewUrls[index]} 
                          alt={`Preview ${index + 1}`} 
                          className={styles.previewImage}
                        />
                        <button 
                          className={styles.removePreviewButton}
                          onClick={() => removePreviewAtIndex(index)}
                          type="button"
                          disabled={loading}
                          title="Eliminar esta imagen"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </svg>
                        </button>
                      </div>
                      <div className={styles.previewFileName}>
                        {file.name}
                      </div>
                      <div className={styles.previewFileSize}>
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                    </div>
                  ))}
                </div>

                <div className={styles.buttonGroup}>
                  <button 
                    className={styles.addButton} 
                    onClick={uploadImages} 
                    disabled={loading}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="17 8 12 3 7 8"></polyline>
                      <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                    {loading ? 'Subiendo...' : `Subir ${selectedFiles.length} imagen(es)`}
                  </button>
                  
                  {!loading && (
                    <button 
                      className={styles.cancelButton}
                      onClick={clearAllPreviews}
                      type="button"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                      Cancelar todo
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className={styles.uploadedSection}>
            <h3 className={styles.sectionTitle}>
              Imágenes del producto ({images.length})
            </h3>
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
      </div>
    </div>
  );
}
