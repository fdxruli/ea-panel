import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import styles from './TermsPage.module.css';
import DOMPurify from 'dompurify';

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

    if (loading) return <LoadingSpinner />;

    const cleanHTML = terms ? DOMPurify.sanitize(terms.content.replace(/\n/g, '<br />')) : '';

    return (
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
    );
}