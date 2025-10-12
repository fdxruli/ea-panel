<<<<<<< HEAD
import React from 'react';
import { Helmet } from 'react-helmet-async';

const SEO = ({ title, description, name, type, schemaMarkup }) => {
  return (
    <Helmet>
      <title>{title}</title>
      <meta name='description' content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta name="twitter:creator" content={name} />
      <meta name="twitter:card" content={type} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      
      {schemaMarkup && (
        <script type="application/ld+json">
          {JSON.stringify(schemaMarkup)}
        </script>
      )}
    </Helmet>
  );
};

export const restaurantSchema = {
    "@context": "http://schema.org",
    "@type": "Restaurant",
    "name": "Entre Alas",
    "description": "El mejor lugar para disfrutar alitas. Ofrecemos una variedad de sabores y un trato acogedor para toda la familia.",
    "url": "https://ea-panel.vercel.app ",
    "telephone": "+529631834700",
    "address": {
        "@type": "PostalAddress",
        "streetAddress": "Ejido 20 de Abril",
        "addressLocality": "La Trinitaria",
        "addressRegion": "Chiapas",
        "postalCode": "30165",
        "addressCountry": "MX"
    },
    "servesCuisine": "Alitas",
    "priceRange": "$$",
    "openingHoursSpecification": [
        {
            "@type": "OpeningHoursSpecification",
            "dayOfWeek": [
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
                "Sunday"
            ],
            "opens": "06:00", // Hora de apertura
            "closes": "22:00"  // Hora de cierre
        }
    ],
    "hasMenu": {
        "@type": "Menu",
        "name": "Menú Principal",
        "url": "https://ea-panel.vercel.app"
    }
};

=======
import React from 'react';
import { Helmet } from 'react-helmet-async';

const SEO = ({ title, description, name, type, schemaMarkup }) => {
  return (
    <Helmet>
      <title>{title}</title>
      <meta name='description' content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta name="twitter:creator" content={name} />
      <meta name="twitter:card" content={type} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      
      {schemaMarkup && (
        <script type="application/ld+json">
          {JSON.stringify(schemaMarkup)}
        </script>
      )}
    </Helmet>
  );
};

export const restaurantSchema = {
    "@context": "http://schema.org",
    "@type": "Restaurant",
    "name": "Entre Alas",
    "description": "El mejor lugar para disfrutar alitas. Ofrecemos una variedad de sabores y un trato acogedor para toda la familia.",
    "url": "https://ea-panel.vercel.app ",
    "telephone": "+529631834700",
    "address": {
        "@type": "PostalAddress",
        "streetAddress": "Ejido 20 de Abril",
        "addressLocality": "La Trinitaria",
        "addressRegion": "Chiapas",
        "postalCode": "30165",
        "addressCountry": "MX"
    },
    "servesCuisine": "Alitas",
    "priceRange": "$$",
    "openingHoursSpecification": [
        {
            "@type": "OpeningHoursSpecification",
            "dayOfWeek": [
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
                "Sunday"
            ],
            "opens": "06:00", // Hora de apertura
            "closes": "22:00"  // Hora de cierre
        }
    ],
    "hasMenu": {
        "@type": "Menu",
        "name": "Menú Principal",
        "url": "https://ea-panel.vercel.app"
    }
};

>>>>>>> 901f8aa95ca640c871ec1f2bf6437b2b2a625efc
export default SEO;