// src/components/AdminMobileMenu.jsx (Modificado)
import React, { useEffect, useState } from 'react'; // <-- Añadido useState
import { Link, useNavigate } from 'react-router-dom'; // <-- Añadido useNavigate
import { supabase } from '../lib/supabaseClient'; // <-- Añadido supabase
import { useAdminAuth } from '../context/AdminAuthContext';
import ConfirmModal from './ConfirmModal'; // <-- Añadido ConfirmModal
import styles from './AdminMobileMenu.module.css';

// Lista completa de enlaces como antes
const adminLinks = [
    { to: "/admin", label: "Dashboard", permissionKey: "dashboard.view" },
    { to: "/admin/crear-pedido", label: "Crear Pedido", permissionKey: "crear-pedido.view" },
    { to: "/admin/pedidos", label: "Pedidos", permissionKey: "pedidos.view" },
    { to: "/admin/clientes", label: "Clientes", permissionKey: "clientes.view" },
    { to: "/admin/referidos", label: "Referidos", permissionKey: "referidos.view" },
    { to: "/admin/productos", label: "Productos", permissionKey: "productos.view" },
    { to: "/admin/horarios", label: "Horarios", permissionKey: "horarios.view" },
    { to: "/admin/descuentos", label: "Descuentos", permissionKey: "descuentos.view" },
    { to: "/admin/terminos", label: "Términos y Cond.", permissionKey: "terminos.view" },
    { to: "/admin/registrar-admin", label: "Registrar Admin", permissionKey: "registrar-admin.view" },
    { to: "/admin/special-prices", label: "Precios Especiales", permissionKey: "special-prices.view" },
    { to: "/admin/configuracion", label: "Configuración", permissionKey: "configuracion.view" },
];

// Define los labels de los enlaces que YA están en la barra inferior
const bottomNavLabels = ["Dashboard", "Crear Pedido", "Pedidos", "Productos"];

export default function AdminMobileMenu({ isOpen, closeMenu }) {
    const { hasPermission } = useAdminAuth();
    const navigate = useNavigate(); // <-- Hook para navegar
    const [isLogoutModalOpen, setLogoutModalOpen] = useState(false); // <-- Estado del modal

    // Filtra los enlaces
    const filteredMenuLinks = adminLinks.filter(link => !bottomNavLabels.includes(link.label));

    // Efecto para el scroll (sin cambios)
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    // --- Lógica de Logout ---
    const confirmLogout = async () => {
        const { error } = await supabase.auth.signOut();
        setLogoutModalOpen(false); // Cerramos el modal
        closeMenu(); // Cerramos el menú móvil
        if (error) {
            console.error("Error al cerrar sesión:", error);
        } else {
            navigate('/login'); // Redirigimos al login
        }
    };

    const handleLogoutClick = () => {
        setLogoutModalOpen(true);
    };
    // --- Fin Lógica de Logout ---

    if (!isOpen) {
        return null;
    }

    return (
        // Envolvemos todo en un Fragment para poder poner el Modal al final
        <>
            <div className={`${styles.overlay} ${isOpen ? styles.open : ''}`} onClick={closeMenu}>
                <div className={`${styles.menuContent} ${isOpen ? styles.open : ''}`} onClick={(e) => e.stopPropagation()}>
                    <div className={styles.menuHeader}>
                        <h4>Menú Principal</h4>
                        <button onClick={closeMenu} className={styles.closeButton}>×</button>
                    </div>
                    <nav className={styles.links}>
                        {/* Mapea sobre los enlaces FILTRADOS */}
                        {filteredMenuLinks.map(link => (
                            hasPermission(link.permissionKey) && (
                                <Link key={link.to} to={link.to} onClick={closeMenu}>
                                    {link.label}
                                </Link>
                            )
                        ))}
                        {/* Mensaje si no quedan más links */}
                        {filteredMenuLinks.filter(link => hasPermission(link.permissionKey)).length === 0 && (
                            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '1rem' }}>No hay más secciones disponibles.</p>
                        )}
                    </nav>
                    {/* --- Botón de Cerrar Sesión --- */}
                    {/* Usamos la clase CSS definida previamente en App.css */}
                    <button className={styles.LogoutButton} onClick={handleLogoutClick}>
                        Cerrar Sesión
                    </button>
                    {/* --- Fin Botón --- */}
                </div>
            </div>

            {/* --- Modal de Confirmación (fuera del overlay y menuContent) --- */}
            <ConfirmModal
                isOpen={isLogoutModalOpen}
                onClose={() => setLogoutModalOpen(false)}
                onConfirm={confirmLogout}
                title="¿Cerrar Sesión?"
            >
                ¿Estás seguro de que quieres cerrar tu sesión de administrador?
            </ConfirmModal>
            {/* --- Fin Modal --- */}
        </>
    );
}