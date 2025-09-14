// src/components/ProtectedRoute.jsx
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Navigate, Outlet } from 'react-router-dom';

export default function ProtectedRoute() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setLoading(false);
    };

    fetchSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <p>Cargando...</p>; // O un spinner
  }

  // Si hay sesión, muestra el contenido de la ruta (el panel de admin).
  // Si no, redirige a la página de login.
  return session ? <Outlet /> : <Navigate to="/login" />;
}