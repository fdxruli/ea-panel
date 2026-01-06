import React from "react";
import styles from './Navbar.module.css';

const MenuIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>;

export default function Navbar({ isSidebarOpen, toggleSidebar }) {
  return (
    <div className={styles.navbar}>
      {/* Botón visible solo en desktop */}
      <button onClick={toggleSidebar} className={styles.desktopMenuToggle}>
        <MenuIcon />
      </button>
      <h2>Panel de Administración</h2>
    </div>
  );
}