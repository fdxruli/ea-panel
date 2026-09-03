import React, { memo, useEffect, useMemo } from 'react';
import SEO from '../../components/SEO';
import {
    defaultSeoImageAlt,
    homeDescription,
    homeTitle,
    joinSiteUrl,
    restaurantSchema,
    resolveSeoImage,
    siteName,
    websiteSchema,
} from '../../seo/config';
import { notifySeoReady } from '../../seo/prerender';
import fallbackImage from '../../assets/images/fallback-product.svg';
import { getProductDisplayImage } from './menuUtils';

const MenuSeo = memo(({
    activeProduct,
    categories,
    defaultCatalogImage,
    error,
    isMissingProductRoute,
    loading,
    productSlug,
}) => {
    const seoData = useMemo(() => {
        const selectedProductCategoryName = activeProduct
            ? categories.find((category) => category.id === activeProduct.category_id)?.name
            : null;
        const productDescription = activeProduct?.description?.trim()
            || (activeProduct
                ? `Pide ${activeProduct.name} de ${selectedProductCategoryName?.toLowerCase() || 'nuestro menu'} en ${siteName}. Servicio a domicilio en La Trinitaria, Chiapas.`
                : '');
        const canonicalUrl = activeProduct
            ? joinSiteUrl(`/producto/${activeProduct.slug}`)
            : isMissingProductRoute
                ? joinSiteUrl(`/producto/${productSlug}`)
                : joinSiteUrl('/');
        const seoImage = resolveSeoImage(
            getProductDisplayImage(activeProduct) || defaultCatalogImage || fallbackImage
        );
        const currentSchema = activeProduct ? {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: activeProduct.name,
            description: productDescription,
            image: [seoImage],
            category: selectedProductCategoryName || undefined,
            seller: {
                '@type': 'Restaurant',
                name: siteName,
                url: joinSiteUrl('/'),
            },
            offers: {
                '@type': 'Offer',
                priceCurrency: 'MXN',
                price: Number(activeProduct.price || 0).toFixed(2),
                availability: 'https://schema.org/InStock',
                url: canonicalUrl,
                seller: {
                    '@type': 'Organization',
                    name: siteName,
                },
            },
        } : isMissingProductRoute ? null : [restaurantSchema, websiteSchema];

        return {
            canonicalUrl,
            currentSchema,
            pageDescription: activeProduct
                ? productDescription
                : isMissingProductRoute
                    ? 'El producto que buscas no existe o ya no esta disponible en Entre Alas.'
                    : homeDescription,
            pageTitle: activeProduct
                ? `${activeProduct.name} | ${siteName}`
                : isMissingProductRoute
                    ? `Producto no encontrado | ${siteName}`
                    : homeTitle,
            seoImage,
            seoImageAlt: activeProduct
                ? `${activeProduct.name} de ${siteName}`
                : defaultSeoImageAlt,
        };
    }, [activeProduct, categories, defaultCatalogImage, isMissingProductRoute, productSlug]);

    useEffect(() => {
        if (loading) return;

        if (!productSlug || activeProduct || isMissingProductRoute || error) {
            notifySeoReady();
        }
    }, [activeProduct, error, isMissingProductRoute, loading, productSlug]);

    if (isMissingProductRoute) {
        return (
            <SEO
                title={seoData.pageTitle}
                description={seoData.pageDescription}
                type="website"
                canonicalUrl={seoData.canonicalUrl}
                image={seoData.seoImage}
                imageAlt={seoData.seoImageAlt}
                noindex
            />
        );
    }

    return (
        <SEO
            title={seoData.pageTitle}
            description={seoData.pageDescription}
            type={loading ? 'website' : activeProduct ? 'product' : 'website'}
            schemaMarkup={seoData.currentSchema}
            canonicalUrl={seoData.canonicalUrl}
            image={seoData.seoImage}
            imageAlt={seoData.seoImageAlt}
            noindex={isMissingProductRoute}
        />
    );
});

MenuSeo.displayName = 'MenuSeo';

export default MenuSeo;
