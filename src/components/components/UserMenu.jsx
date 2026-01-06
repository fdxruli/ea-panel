import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useCustomer } from '../context/CustomerContext';
import { useUserData } from '../context/UserDataContext';
import styles from './UserMenu.module.css';

const HomeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>;
const UserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>;
const ClipboardIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>;
const HeartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>;

export default function UserMenu() {
    const [isOpen, setIsOpen] = useState(false);
    const { phone, setPhoneModalOpen, setCheckoutModalOpen } = useCustomer();
    const { customer } = useUserData();
    const menuRef = useRef(null);
    const location = useLocation();

    const userInitial = customer?.name ? customer.name.charAt(0).toUpperCase() : '';

    const toggleMenu = () => setIsOpen(!isOpen);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [menuRef]);

    const renderDropdownContent = () => {
        if (!phone) {
             return (
                <div className={styles.prompt}>
                    <h4>Identifícate</h4>
                    <p>Ingresa tu número para ver tu perfil y pedidos.</p>
                    <button onClick={() => { setPhoneModalOpen(true); setIsOpen(false); }} className={styles.actionButton}>
                        Ingresar Número
                    </button>
                </div>
            );
        }
        if (!customer) {
            return (
                <div className={styles.prompt}>
                    <h4>¡Bienvenido!</h4>
                    <p>Parece que eres nuevo. Completa tu perfil para una mejor experiencia.</p>
                    <button onClick={() => { setCheckoutModalOpen(true, 'profile'); setIsOpen(false); }} className={styles.actionButton}>
                        Completar Perfil
                    </button>
                </div>
            );
        }

        const navLinks = [
            { to: "/mi-perfil", icon: <UserIcon />, label: "Mi Perfil", replace: true },
            { to: "/mi-actividad", icon: <HeartIcon />, label: "Mi Actividad", replace: true },
            { to: "/mis-pedidos", icon: <ClipboardIcon />, label: "Mis Pedidos", replace: true },
        ];

        const isUserOnMenuPage = navLinks.some(link => link.to === location.pathname);
        
        let finalLinks = navLinks.filter(link => link.to !== location.pathname);

        if (isUserOnMenuPage) {
            finalLinks.unshift({ to: "/", icon: <HomeIcon />, label: "Inicio", replace: false });
        }

        return (
            <nav className={styles.links}>
                {finalLinks.map(link => (
                    <NavLink key={link.to} to={link.to} replace={link.replace} className={styles.dropdownLink} onClick={() => setIsOpen(false)}>
                        {link.icon}<span>{link.label}</span>
                    </NavLink>
                ))}
            </nav>
        );
    };

    return (
        <div className={styles.menuContainer} ref={menuRef}>
            <button onClick={toggleMenu} className={styles.avatarButton}>
                {userInitial ? <span>{userInitial}</span> : <UserIcon />}
            </button>

            {isOpen && (
                <div className={styles.dropdown}>
                    {renderDropdownContent()}
                </div>
            )}
        </div>
    );
}