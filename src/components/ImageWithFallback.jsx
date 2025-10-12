<<<<<<< HEAD
import React, { useState, useEffect } from 'react';
import styles from './ImageWithFallback.module.css';

const PLACEHOLDER_IMAGE = 'https://placehold.co/300x200?text=Imagen+no+disponible';

export default function ImageWithFallback({ src, alt, className, ...props }) {
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
        if (retries === 0) {
            // Intenta recargar la imagen con un parámetro para evitar el caché
            const retrySrc = `${src}?t=${new Date().getTime()}`;
            setImageSrc(retrySrc);
            setRetries(prev => prev + 1);
        } else {
            // Si el reintento también falla, muestra el placeholder
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

    return (
        <img
            src={imageSrc}
            alt={alt}
            // Combina las clases existentes con la de la animación
            className={`${styles.image} ${className}`}
            onError={handleError}
            loading="lazy" // <-- Carga diferida para mejorar el rendimiento
            {...props}
        />
    );
}
=======
import React, { useState, useEffect } from 'react';
import styles from './ImageWithFallback.module.css';

const PLACEHOLDER_IMAGE = 'https://placehold.co/300x200?text=Imagen+no+disponible';

export default function ImageWithFallback({ src, alt, className, ...props }) {
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
        if (retries === 0) {
            // Intenta recargar la imagen con un parámetro para evitar el caché
            const retrySrc = `${src}?t=${new Date().getTime()}`;
            setImageSrc(retrySrc);
            setRetries(prev => prev + 1);
        } else {
            // Si el reintento también falla, muestra el placeholder
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

    return (
        <img
            src={imageSrc}
            alt={alt}
            // Combina las clases existentes con la de la animación
            className={`${styles.image} ${className}`}
            onError={handleError}
            loading="lazy" // <-- Carga diferida para mejorar el rendimiento
            {...props}
        />
    );
}
>>>>>>> 901f8aa95ca640c871ec1f2bf6437b2b2a625efc
