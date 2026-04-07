// src/components/AdminBottomNav.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import styles from './AdminBottomNav.module.css';

// --- Iconos ---
const DashboardIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>;
const CreateIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>;
const OrdersIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>;
const ProductsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>;
// Icono para el botón de menú
const MenuIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>;

const navLinks = [
    { to: "/admin", icon: <DashboardIcon />, label: "Dashboard", permissionKey: "dashboard.view" },
    { to: "/admin/crear-pedido", icon: <CreateIcon />, label: "Crear", permissionKey: "crear-pedido.view" },
    { to: "/admin/pedidos", icon: <OrdersIcon />, label: "Pedidos", permissionKey: "pedidos.view" },
    { to: "/admin/productos", icon: <ProductsIcon />, label: "Productos", permissionKey: "productos.view" },
    // Eliminamos el de Configuración de aquí
];

// Añadimos toggleMobileMenu como prop
export default function AdminBottomNav({ toggleMobileMenu }) {
    const { hasPermission } = useAdminAuth();

    return (
        <nav className={styles.bottomNav}>
            {navLinks.map(link => (
                hasPermission(link.permissionKey) && (
                    <NavLink
                        key={link.to}
                        to={link.to}
                        end={link.to === "/admin"}
                        className={({ isActive }) =>
                            `${styles.navLink} ${isActive ? styles.active : ''}`
                        }
                    >
                        {link.icon}
                        <span>{link.label}</span>
                    </NavLink>
                )
            ))}
            {/* Botón para abrir el menú móvil */}
            <button onClick={toggleMobileMenu} className={styles.navLink}>
                <MenuIcon />
                <span>Menú</span>
            </button>
        </nav>
    );
}