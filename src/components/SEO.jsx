import React from 'react';

const SEO = ({ title, description, name, type, schemaMarkup, canonicalUrl, image }) => {
  const siteUrl = 'https://ea-panel.vercel.app';
  const metaImage = image 
    ? (image.startsWith('http') ? image : `${siteUrl}${image}`) 
    : `${siteUrl}/banner-social.png`;

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      
      {/* Open Graph */}
      <meta property="og:type" content={type || 'website'} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={metaImage} />
      <meta property="og:url" content={canonicalUrl || siteUrl} />
      
      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" /> 
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={metaImage} />

      {/* Canonical URL */}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
      
      {/* Schema Markup (JSON-LD) */}
      {schemaMarkup && (
        <script type="application/ld+json">
          {JSON.stringify(schemaMarkup)}
        </script>
      )}
    </>
  );
};

// Mantén tu objeto restaurantSchema igual que antes
export const restaurantSchema = {
    "@context": "http://schema.org",
    "@type": "Restaurant",
    "name": "Entre Alas",
    "description": "El mejor lugar para disfrutar alitas, boneless, hamburguesas y papas. Ofrecemos una variedad de sabores y un trato acogedor para toda la familia.",
    "url": "https://ea-panel.vercel.app",
    "telephone": "+529631834700",
    "address": {
        "@type": "PostalAddress",
        "streetAddress": "Ejido 20 de Abril",
        "addressLocality": "La Trinitaria",
        "addressRegion": "Chiapas",
        "postalCode": "30165",
        "addressCountry": "MX"
    },
    "servesCuisine": "Alitas, Boneless, Hamburguesas, Papas a la francesa",
    "keywords": "alitas, boneless, papas, hamburguesas, restaurante, comida rapida, La Trinitaria, Chiapas",
    "priceRange": "$$",
    "openingHoursSpecification": [
        {
            "@type": "OpeningHoursSpecification",
            "dayOfWeek": [
                "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
            ],
            "opens": "06:00",
            "closes": "22:00"
        }
    ],
    "hasMenu": {
        "@type": "Menu",
        "name": "Menú Principal",
        "url": "https://ea-panel.vercel.app"
    },
    "potentialAction": {
      "@type": "OrderAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": "https://ea-panel.vercel.app",
        "inLanguage": "es-MX",
        "actionPlatform": [
          "http://schema.org/DesktopWebPlatform",
          "http://schema.org/IOSPlatform",
          "http://schema.org/AndroidPlatform"
        ]
      },
      "deliveryMethod": [
        "http://purl.org/goodrelations/v1#DeliveryModeOwnFleet"
      ]
    }
};

export default SEO;