// src/utils/imageUtils.js

/**
 * Genera una URL de thumbnail para imágenes de Supabase Storage.
 * @param {string} url - La URL original de la imagen en Supabase.
 * @param {number} width - El ancho deseado para el thumbnail.
 * @param {number} height - El alto deseado para el thumbnail.
 * @returns {string} - La nueva URL con parámetros de transformación.
 */
export const getThumbnailUrl = (url, width = 150, height = 150) => {
  // Si la URL está vacía o no es de Supabase, devuélvela tal cual.
  if (!url || !url.includes('supabase.co')) {
    return url;
  }

  // Añadimos los parámetros de transformación de Supabase
  // 'c_fill' (o 'cover') se asegura de rellenar el cuadro de 150x150 y recorta lo que sobre.
  // 'q_75' es una calidad de 75, que es excelente para thumbnails.
  return `${url}?transform=w_${width},h_${height},c_fill,q_75`;
};