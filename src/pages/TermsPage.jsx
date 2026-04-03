import React, { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import SEO from '../components/SEO';
import LoadingSpinner from '../components/LoadingSpinner';
import { supabase } from '../lib/supabaseClient';
import { joinSiteUrl } from '../seo/config';
import { notifySeoReady } from '../seo/prerender';
import styles from './TermsPage.module.css';

export default function TermsPage() {
    const [terms, setTerms] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLatestTerms = async () => {
            const { data, error } = await supabase
                .from('terms_and_conditions')
                .select('content, published_at')
                .order('version', { ascending: false })
                .limit(1)
                .single();

            if (error) {
                console.error(error);
            } else {
                setTerms(data);
            }

            setLoading(false);
        };

        fetchLatestTerms();
    }, []);

    useEffect(() => {
        if (!loading) {
            notifySeoReady();
        }
    }, [loading]);

    if (loading) return <LoadingSpinner />;

    const cleanHTML = terms ? DOMPurify.sanitize(terms.content.replace(/\n/g, '<br />')) : '';

    return (
        <>
            <SEO
                title="Términos y Condiciones | Entre Alas"
                description="Lee los términos y condiciones de servicio, compra y uso de la plataforma de Entre Alas."
                type="website"
                canonicalUrl={joinSiteUrl('/terminos')}
            />
            <div className={styles.container}>
                <h1>Términos y Condiciones</h1>
                {terms ? (
                    <>
                        <p className={styles.meta}>
                            Última actualización: {new Date(terms.published_at).toLocaleDateString()}
                        </p>
                        <div className={styles.content} dangerouslySetInnerHTML={{ __html: cleanHTML }} />
                    </>
                ) : (
                    <p>No se pudieron cargar los términos y condiciones.</p>
                )}
            </div>
        </>
    );
}
