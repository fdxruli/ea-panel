import React, { useState, useEffect } from 'react';
import styles from './ImageWithFallback.module.css';

const PLACEHOLDER_IMAGE = 'https://placehold.co/300x200?text=Imagen+no+disponible';

/**
 * Genera una URL de transformación de Supabase Storage.
 * Añade el parámetro 'width' a la URL existente.
 */
const getSupabaseTransformUrl = (src, width) => {
  // No transformar placeholders o URLs que ya sean inválidas
  if (!src || src.includes('placehold.co') || typeof src !== 'string') {
    return src;
  }
  
  try {
    const url = new URL(src);
    // Usamos 'width' para el redimensionamiento
    url.searchParams.set('width', width.toString());
    return url.toString();
  } catch (e) {
    // Si no es una URL válida, devolver el original
    return src;
  }
};

export default function ImageWithFallback({
  src,
  alt,
  className,
  imageSizes, // Array de anchos, ej: [200, 400, 600]
  sizes,      // String de CSS, ej: "(max-width: 600px) 50vw, 33vw"
  priority = false, // true para imágenes LCP (Largest Contentful Paint)
  ...props
}) {
  const [imageSrc, setImageSrc] = useState(src || PLACEHOLDER_IMAGE);
  const [hasError, setHasError] = useState(!src);
  const [retries, setRetries] = useState(0);

  // Reinicia el estado si la imagen de origen (src) cambia
  useEffect(() => {
    setImageSrc(src || PLACEHOLDER_IMAGE);
    setHasError(!src);
    setRetries(0);
  }, [src]);

  const handleError = () => {
    // Solo reintentamos una vez si había un 'src' original
    if (retries === 0 && src) {
      const retrySrc = `${src}?t=${new Date().getTime()}`;
      setImageSrc(retrySrc);
      setRetries(prev => prev + 1);
    } else {
      // Si el reintento falla o no había src, mostrar placeholder
      setHasError(true);
      setImageSrc(PLACEHOLDER_IMAGE);
    }
  };

  if (hasError) {
    // Muestra un div con estilo de placeholder si la imagen final falla
    return (
      <div className={`${styles.placeholder} ${className}`} {...props}>
        <span>{alt}</span>
      </div>
    );
  }

  // --- Lógica de SrcSet ---
  let srcSet = null;
  if (imageSizes && Array.isArray(imageSizes) && imageSizes.length > 0) {
    srcSet = imageSizes
      .map(width => `${getSupabaseTransformUrl(src, width)} ${width}w`)
      .join(', ');
  }
  // --- Fin Lógica ---

  return (
    <img
      // El 'src' por defecto será la versión más grande que pedimos (o 800px)
      src={getSupabaseTransformUrl(src, imageSizes ? imageSizes[imageSizes.length - 1] : 800)}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      className={`${styles.image} ${className}`}
      onError={handleError}
      // --- Lógica de Prioridad de Carga ---
      loading={priority ? undefined : 'lazy'} // Quitar lazy loading si es prioritaria
      fetchPriority={priority ? 'high' : undefined} // <-- CORREGIDO A camelCase
      {...props}
    />
  );
}