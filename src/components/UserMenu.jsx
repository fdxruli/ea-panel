import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useCustomer } from '../context/CustomerContext';
import styles from './UserMenu.module.css';

const HomeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const UserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const ClipboardIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>;
const HeartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
const LogOutIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;

export default function UserMenu() {
    const [isOpen, setIsOpen] = useState(false);
    const { customer, isAuthenticated, isLinked, setPhoneModalOpen, setCheckoutModalOpen, signOut } = useCustomer();
    const menuRef = useRef(null);
    const location = useLocation();
    const userInitial = customer?.name ? customer.name.charAt(0).toUpperCase() : '';

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = async () => {
        await signOut();
        setIsOpen(false);
        window.location.replace('/');
    };

    const renderContent = () => {
        if (!isAuthenticated) return <div className={styles.prompt}><h4>Identifícate</h4><p>Verifica tu teléfono con un código para entrar.</p><button onClick={() => { setPhoneModalOpen(true); setIsOpen(false); }} className={styles.actionButton}>Iniciar sesión</button></div>;
        if (!isLinked || !customer) return <div className={styles.prompt}><h4>Sesión iniciada</h4><p>Tu número está autenticado, pero todavía no está vinculado a un cliente.</p><button onClick={() => { setPhoneModalOpen(true); setIsOpen(false); }} className={styles.actionButton}>Completar vínculo</button></div>;

        const navLinks = [
            { to: '/mi-perfil', icon: <UserIcon />, label: 'Mi Perfil', replace: true },
            { to: '/mi-actividad', icon: <HeartIcon />, label: 'Mi Actividad', replace: true },
            { to: '/mis-pedidos', icon: <ClipboardIcon />, label: 'Mis Pedidos', replace: true },
        ];
        const isOnMenuPage = navLinks.some(link => link.to === location.pathname);
        const finalLinks = navLinks.filter(link => link.to !== location.pathname);
        if (isOnMenuPage) finalLinks.unshift({ to: '/', icon: <HomeIcon />, label: 'Inicio', replace: false });

        return <div className={styles.menuContentWrapper}>
            <nav className={styles.links}>{finalLinks.map(link => <NavLink key={link.to} to={link.to} replace={link.replace} className={styles.dropdownLink} onClick={() => setIsOpen(false)}>{link.icon}<span>{link.label}</span></NavLink>)}</nav>
            <div className={styles.logoutSection}><button className={styles.logoutButton} onClick={handleLogout}><LogOutIcon /><span>Cerrar Sesión</span></button></div>
        </div>;
    };

    return <div className={styles.menuContainer} ref={menuRef}>
        <button onClick={() => setIsOpen(value => !value)} className={styles.avatarButton}>{userInitial ? <span>{userInitial}</span> : <UserIcon />}</button>
        {isOpen && <div className={styles.dropdown}>{renderContent()}</div>}
    </div>;
}
