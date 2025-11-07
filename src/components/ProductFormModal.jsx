/* src/components/ProductFormModal.jsx */
import React, { useEffect, useState, memo } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAlert } from "../context/AlertContext";
import DOMPurify from 'dompurify';
import imageCompression from "browser-image-compression";
import styles from "../pages/Products.module.css"; // Ajusta la ruta al CSS de tu página

const ProductFormModal = memo(({ isOpen, onClose, onSave, categories, product: initialProduct }) => {
    const { showAlert } = useAlert();
    const [formData, setFormData] = useState({ name: "", description: "", price: "", cost: "", category_id: "", image_url: "" });
    const [imageFile, setImageFile] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    useEffect(() => {
        if (initialProduct) {
            const { product_images, ...productData } = initialProduct;
            setFormData(productData);
            setPreviewImage(productData.image_url);
        } else {
            setFormData({ name: "", description: "", price: "", cost: "", category_id: "", image_url: "" });
            setImageFile(null);
            setPreviewImage(null);
        }
        setUploadProgress(0);
    }, [initialProduct, isOpen]);

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showAlert('Por favor selecciona un archivo de imagen válido.');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showAlert('La imagen es demasiado grande. Máximo 5MB.');
            return;
        }
        const options = { maxSizeMB: 1, maxWidthOrHeight: 1024, useWebWorker: true, fileType: 'image/webp', initialQuality: 0.8 };
        try {
            showAlert("Comprimiendo imagen...", 'info');
            const compressedFile = await imageCompression(file, options);
            setImageFile(compressedFile);
            const reader = new FileReader();
            reader.onloadend = () => { setPreviewImage(reader.result); };
            reader.readAsDataURL(compressedFile);
            showAlert("Imagen lista para subir!", 'success');
        } catch (error) {
            console.error('Compression error:', error);
            showAlert("Error al comprimir la imagen. Intenta con otra.");
            setImageFile(null);
            setPreviewImage(null);
        }
    };

    const uploadImageWithRetry = async (file, maxRetries = 3) => {
        const fileExt = 'webp';
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `products/${fileName}`;
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                setUploadProgress((attempt / maxRetries) * 50);
                const { error: uploadError } = await supabase.storage.from('images').upload(filePath, file, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
                if (uploadError) throw uploadError;
                setUploadProgress(75);
                const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(filePath);
                setUploadProgress(100);
                return publicUrl;
            } catch (error) {
                lastError = error;
                console.error(`Upload attempt ${attempt} failed:`, error);
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        }
        throw lastError;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (parseFloat(formData.price) <= 0 || parseFloat(formData.cost) < 0) {
            showAlert('El precio debe ser mayor a 0 y el costo no puede ser negativo.');
            return;
        }
        if (parseFloat(formData.price) < parseFloat(formData.cost)) {
            const confirm = window.confirm('El precio es menor que el costo. ¿Deseas continuar?');
            if (!confirm) return;
        }
        setIsSubmitting(true);
        setUploadProgress(0);
        try {
            let imageUrl = formData.image_url;
            if (imageFile) {
                imageUrl = await uploadImageWithRetry(imageFile);
            }
            const dataToSave = { ...formData, name: DOMPurify.sanitize(formData.name.trim()), description: DOMPurify.sanitize(formData.description.trim()), price: parseFloat(formData.price), cost: parseFloat(formData.cost), image_url: imageUrl };
            await onSave(dataToSave);
        } catch (error) {
            console.error('Submit error:', error);
            showAlert(`Error: ${error.message}`);
        } finally {
            setIsSubmitting(false);
            setUploadProgress(0);
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <h2>{initialProduct ? 'Editar' : 'Crear'} Producto</h2>
                <form onSubmit={handleSubmit} className={styles.productForm}>
                    <div className={styles.formGroup}><label htmlFor="name">Nombre del Producto *</label><input id="name" name="name" className={styles.formInput} value={formData.name} onChange={handleChange} required maxLength={100} /></div>
                    <div className={styles.formGroup}><label htmlFor="description">Descripción *</label><textarea id="description" name="description" value={formData.description} onChange={handleChange} required maxLength={500} rows={4} /></div>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}><label htmlFor="price">Precio *</label><input id="price" name="price" type="number" step="0.01" min="0.01" value={formData.price} onChange={handleChange} required /></div>
                        <div className={styles.formGroup}><label htmlFor="cost">Costo *</label><input id="cost" name="cost" type="number" step="0.01" min="0" value={formData.cost} onChange={handleChange} required /></div>
                    </div>
                    <div className={styles.formGroup}>
                        <label htmlFor="category_id">Categoría *</label>
                        <select id="category_id" name="category_id" value={formData.category_id} onChange={handleChange} required>
                            <option value="">Selecciona una Categoría</option>
                            {categories.map(cat => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
                        </select>
                    </div>
                    <div className={styles.formGroup}>
                        <label>Imagen Principal</label>
                        <div className={styles.fileInputWrapper}>
                            <input id="mainImage" name="mainImage" type="file" accept="image/*" onChange={handleFileChange} className={styles.fileInput} disabled={isSubmitting} />
                            <label htmlFor="mainImage" className={styles.fileInputLabel}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg> {imageFile ? 'Cambiar imagen' : 'Seleccionar imagen'}</label>
                        </div>
                        {previewImage && (<div className={styles.previewContainer}><img src={previewImage} alt="Vista previa" className={styles.imagePreview} /></div>)}
                        {uploadProgress > 0 && uploadProgress < 100 && (<div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${uploadProgress}%` }} /><span>{uploadProgress}%</span></div>)}
                    </div>
                    <div className={styles.modalActions}>
                        <button type="button" onClick={onClose} className={styles.cancelButton} disabled={isSubmitting}>Cancelar</button>
                        <button type="submit" className={styles.saveButton} disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Guardar'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
});
ProductFormModal.displayName = 'ProductFormModal';

export default ProductFormModal;