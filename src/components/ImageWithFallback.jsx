import React, { useState, useEffect, useMemo } from 'react';
import styles from './ImageWithFallback.module.css';

const PLACEHOLDER_IMAGE = 'https://placehold.co/300x200?text=Imagen+no+disponible';

/**
 * Genera una URL de transformación de Supabase Storage.
 * Añade el parámetro 'width' a la URL existente.
 */
const getSupabaseTransformUrl = (src, width) => {
  if (typeof src !== 'string' || !src) {
    return src;
  }

  // Si la URL ya tiene parámetros de transformación, no la modificamos.
  if (src.includes('?transform=') || src.includes('&transform=')) {
    return src;
  }

  // No transformar placeholders o URLs que ya sean inválidas
  if (src.includes('placehold.co')) {
    return src;
  }

  try {
    const url = new URL(src);
    // Usamos 'width' para el redimensionamiento
    url.searchParams.set('width', width.toString());
    return url.toString();
  } catch {
    // Si no es una URL válida, devolver el original
    return src;
  }
};

const addCacheBuster = (src) => {
  if (typeof src !== 'string' || !src) return src;
  const cacheBuster = Date.now().toString();

  try {
    const url = new URL(src);
    url.searchParams.set('t', cacheBuster);
    return url.toString();
  } catch {
    return `${src}${src.includes('?') ? '&' : '?'}t=${cacheBuster}`;
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

  useEffect(() => {
    setImageSrc(src || PLACEHOLDER_IMAGE);
    setHasError(!src);
    setRetries(0);
  }, [src]);

  const handleError = () => {
    // Solo reintentamos una vez si había un 'src' original
    if (retries === 0 && typeof src === 'string' && src) {
      const retrySrc = addCacheBuster(src);
      setImageSrc(retrySrc);
      setRetries(prev => prev + 1);
    } else {
      // Si el reintento falla o no había src, mostrar placeholder
      setHasError(true);
      setImageSrc(PLACEHOLDER_IMAGE);
    }
  };

  const srcSet = useMemo(() => {
    if (!Array.isArray(imageSizes) || imageSizes.length === 0 || typeof src !== 'string') {
      return null;
    }

    return imageSizes
      .map(width => `${getSupabaseTransformUrl(src, width)} ${width}w`)
      .join(', ');
  }, [src, imageSizes]);

  if (hasError) {
    // Muestra un div con estilo de placeholder si la imagen final falla
    const placeholderClassName = [styles.placeholder, className].filter(Boolean).join(' ');
    return (
      <div className={placeholderClassName} {...props}>
        <span>{alt}</span>
      </div>
    );
  }

  return (
    <img
      // El 'src' por defecto será la versión más grande que pedimos (o 800px)
      src={getSupabaseTransformUrl(imageSrc, imageSizes ? imageSizes[imageSizes.length - 1] : 800)}
      srcSet={retries === 0 ? srcSet : undefined}
      sizes={sizes}
      alt={alt}
      className={[styles.image, className].filter(Boolean).join(' ')}
      onError={handleError}
      loading={priority ? 'eager' : 'lazy'} // Carga prioritaria si 'priority' es true
      fetchPriority={priority ? 'high' : 'auto'} // Pista al navegador
      {...props}
    />
  );
}
