import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react';
import { supabase } from '../lib/supabaseClient';

const AdminAuthContext = createContext(null);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parsea el campo `permissions` que puede llegar como JSONB nativo u objeto,
 * o como string JSON (legacy). Retorna null si está corrupto.
 */
function parsePermissions(raw) {
    if (!raw) return null;
    if (typeof raw !== 'string') return raw;
    try {
        return JSON.parse(raw);
    } catch {
        console.error('[AdminAuth] Permisos corruptos — no se pudieron parsear.');
        return null;
    }
}

/**
 * Consulta la tabla `admins` para un userId dado.
 * Retorna { data, isNetworkError } para que el llamador decida
 * cómo reaccionar ante errores de red vs. respuestas explícitas del servidor.
 */
async function queryAdminRecord(userId) {
    try {
        const { data, error } = await supabase
            .from('admins')
            .select('name, role, permissions')
            .eq('id', userId)
            .maybeSingle();

        if (error) {
            // Supabase lanza errores de red con message que contiene "fetch" / "network"
            // o como FetchError. Los distinguimos para resiliencia en segundo plano.
            const msg = error.message?.toLowerCase() ?? '';
            const isNetworkError =
                msg.includes('fetch') ||
                msg.includes('network') ||
                msg.includes('failed') ||
                error.code === 'NETWORK_ERROR';
            return { data: null, error, isNetworkError };
        }

        return { data, error: null, isNetworkError: false };
    } catch (err) {
        // TypeError: Failed to fetch, AbortError, etc.
        return { data: null, error: err, isNetworkError: true };
    }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const AdminAuthProvider = ({ children }) => {
    const [authState, setAuthState] = useState({
        status: 'RESOLVING', // 'RESOLVING' | 'ADMIN' | 'CLIENT' | 'UNAUTHENTICATED' | 'ERROR'
        userId: null,
        adminData: null,
        error: null,
    });

    /**
     * Ref que siempre refleja el estado actual sin generar stale closures.
     * Usado dentro de callbacks asíncronos para leer el estado sin depender
     * de la closure capturada en el montaje.
     */
    const authStateRef = useRef(authState);
    useEffect(() => {
        authStateRef.current = authState;
    }, [authState]);

    /** Guard contra setState tras desmontar el provider. */
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    /**
     * Semáforo: evita que dos revalidaciones silenciosas simultáneas
     * (ej. TOKEN_REFRESHED + visibilitychange) sobreescriban el estado
     * de forma no determinista.
     */
    const revalidatingRef = useRef(false);

    // -------------------------------------------------------------------------
    // fullResolve — Para arranque en frío o cambio real de identidad.
    // Pone status en 'RESOLVING' para mostrar el spinner global.
    // -------------------------------------------------------------------------
    const fullResolve = useCallback(async (session) => {
        if (!session) {
            if (mountedRef.current) {
                setAuthState({ status: 'UNAUTHENTICATED', userId: null, adminData: null, error: null });
            }
            return;
        }

        // Solo mostramos RESOLVING en arranque/cambio de identidad.
        if (mountedRef.current) {
            setAuthState(prev => ({ ...prev, status: 'RESOLVING', userId: session.user.id }));
        }

        const { data, error, isNetworkError } = await queryAdminRecord(session.user.id);

        if (!mountedRef.current) return;

        if (error) {
            const msg = error.message?.toLowerCase() || '';
            const isAuthError =
                error.status === 401 ||
                error.code === 'PGRST301' ||
                msg.includes('jwt') ||
                msg.includes('unauthorized') ||
                msg.includes('invalid claim');

            if (isAuthError) {
                // Token expirado o inválido: cerrar sesión automáticamente
                supabase.auth.signOut().catch(() => {});
                setAuthState({ status: 'UNAUTHENTICATED', userId: null, adminData: null, error: null });
                return;
            }

            // En arranque, si hay error de red, lo reportamos con ERROR
            setAuthState({
                status: 'ERROR',
                userId: session.user.id,
                adminData: null,
                error: isNetworkError
                    ? 'Sin conexión. Verifica tu red e intenta de nuevo.'
                    : error.message,
            });
            return;
        }

        if (!data) {
            // El usuario existe en Supabase pero NO está en la tabla admins.
            setAuthState({ status: 'CLIENT', userId: session.user.id, adminData: null, error: null });
            return;
        }

        setAuthState({
            status: 'ADMIN',
            userId: session.user.id,
            adminData: { ...data, permissions: parsePermissions(data.permissions) },
            error: null,
        });
    }, []);

    // -------------------------------------------------------------------------
    // silentRevalidate — Para TOKEN_REFRESHED, USER_UPDATED, y SIGNED_IN del
    // mismo usuario ya verificado. NO toca status, por lo que la UI permanece
    // completamente montada e interactiva.
    // -------------------------------------------------------------------------
    const silentRevalidate = useCallback(async (session) => {
        if (!session) return;

        // Semáforo: si ya hay una revalidación en curso, la descartamos.
        if (revalidatingRef.current) {
            console.warn('[AdminAuth] Revalidación silenciosa omitida — ya hay una en curso.');
            return;
        }
        revalidatingRef.current = true;

        try {
            const { data, error, isNetworkError } = await queryAdminRecord(session.user.id);

            if (!mountedRef.current) return;

            if (error) {
                if (isNetworkError) {
                    // Error de red transitorio: conservamos el estado ADMIN en caché.
                    // NO expulsamos al usuario por una pérdida momentánea de señal.
                    console.warn(
                        '[AdminAuth] Revalidación silenciosa fallida por error de red. ' +
                        'Se conserva el estado autenticado previo.',
                        error
                    );
                    return;
                }
                // Error real de DB (ej. violación RLS): también conservamos el estado
                // para no interrumpir al admin por un problema transitorio del servidor.
                console.error(
                    '[AdminAuth] Error de DB durante revalidación silenciosa. ' +
                    'Se conserva el estado autenticado previo.',
                    error
                );
                return;
            }

            if (!data) {
                // Respuesta explícita del servidor: el registro del admin fue eliminado.
                // Esta es una revocación intencional, sí debemos redirigir.
                setAuthState({
                    status: 'CLIENT',
                    userId: session.user.id,
                    adminData: null,
                    error: null,
                });
                return;
            }

            // Actualizamos adminData (permisos/rol pueden haber cambiado)
            // sin tocar status ni userId para preservar la estabilidad de AdminDraftContext.
            setAuthState(prev => ({
                ...prev,
                adminData: { ...data, permissions: parsePermissions(data.permissions) },
                error: null,
            }));
        } finally {
            revalidatingRef.current = false;
        }
    }, []);

    // -------------------------------------------------------------------------
    // Suscripción principal
    // -------------------------------------------------------------------------
    useEffect(() => {
        mountedRef.current = true;

        // 1. Carga inicial: siempre resuelve completamente (arranque en frío).
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (mountedRef.current) fullResolve(session);
        });

        // 2. Listener de eventos de Supabase
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (!mountedRef.current) return;

            // INITIAL_SESSION y SIGNED_UP los ignora el listener; los maneja getSession() arriba.
            if (event === 'INITIAL_SESSION' || event === 'SIGNED_UP') return;

            const current = authStateRef.current;
            const isSameAdminUser =
                current.status === 'ADMIN' &&
                !!session?.user?.id &&
                current.userId === session.user.id;

            switch (event) {
                case 'SIGNED_OUT':
                    // Cierre de sesión explícito: limpieza inmediata, sin consulta a DB.
                    setAuthState({ status: 'UNAUTHENTICATED', userId: null, adminData: null, error: null });
                    break;

                case 'TOKEN_REFRESHED':
                case 'USER_UPDATED':
                    // Eventos de refresco automático: el caso más común en mobile (volver de WhatsApp).
                    // Si el admin ya está verificado y es el mismo usuario → silencioso, sin parpadeo.
                    if (isSameAdminUser) {
                        silentRevalidate(session);
                    } else {
                        fullResolve(session);
                    }
                    break;

                case 'SIGNED_IN':
                    // Puede dispararse en varios escenarios (OAuth, magic link, re-auth).
                    if (isSameAdminUser) {
                        silentRevalidate(session);
                    } else {
                        // Usuario diferente o primer login real.
                        fullResolve(session);
                    }
                    break;

                default:
                    // Eventos futuros de Supabase: fallback seguro a resolución completa.
                    console.warn(`[AdminAuth] Evento desconocido de Supabase: "${event}". Resolviendo completamente.`);
                    fullResolve(session);
                    break;
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [fullResolve, silentRevalidate]);

    // -------------------------------------------------------------------------
    // Utilidades de permisos
    // -------------------------------------------------------------------------

    /**
     * Verifica si el admin autenticado tiene un permiso específico.
     * Soporta claves anidadas con notación de punto (ej. 'dashboard.view').
     */
    const hasPermission = useCallback((permissionKey) => {
        if (authState.status !== 'ADMIN' || !authState.adminData) return false;

        const { role, permissions } = authState.adminData;

        // God mode: el rol 'admin' tiene acceso total.
        if (role === 'admin') return true;

        if (!permissions) return false;

        const keys = permissionKey.split('.');
        let cursor = permissions;

        for (const key of keys) {
            cursor = cursor?.[key];
            if (cursor === undefined) return false;
        }

        // Validación estricta: solo `true` booleano concede acceso.
        return cursor === true;
    }, [authState]);

    // `loading` es true ÚNICAMENTE durante el arranque en frío o cambio de identidad.
    // TOKEN_REFRESHED y USER_UPDATED NO activan loading gracias a silentRevalidate.
    const loading = authState.status === 'RESOLVING';

    return (
        <AdminAuthContext.Provider value={{ ...authState, loading, hasPermission }}>
            {children}
        </AdminAuthContext.Provider>
    );
};

export const useAdminAuth = () => {
    const context = useContext(AdminAuthContext);
    if (!context) {
        throw new Error('useAdminAuth debe ser usado estrictamente dentro de AdminAuthProvider');
    }
    return context;
};
