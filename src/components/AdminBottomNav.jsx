// src/components/AdminBottomNav.jsx
import React from "react";
import styles from "./AdminBottomNav.module.css";
import { NavLink } from "react-router-dom";

// Asegúrate de tener instalada la librería react-icons (npm install react-icons)
// O reemplaza estos íconos por los que prefieras.
import { IoCalendarNumberOutline } from "react-icons/io5";
import { VscInbox } from "react-icons/vsc";
import { FaRegUserCircle } from "react-icons/fa";
import { FiSettings } from "react-icons/fi";
// Importa un nuevo ícono para el botón de acción
import { TiPlus } from "react-icons/ti"; 

const AdminBottomNav = () => {
  const links = [
    { id: 1, name: "Citas", icon: <IoCalendarNumberOutline /> },
    { id: 2, name: "Inbox", icon: <VscInbox /> },
    { id: 3, name: "Acción", icon: <TiPlus />, isAction: true }, // Definimos el central
    { id: 4, name: "Perfil", icon: <FaRegUserCircle /> },
    { id: 5, name: "Ajustes", icon: <FiSettings /> },
  ];

  return (
    <div className={styles.container}>
      <nav className={styles.bottomNav}>
        {/* Este contenedor es necesario para la forma curva y el desenfoque */}
        <div className={styles.navShapeWrapper}>
          <div className={styles.navShape} />
        </div>

        <div className={styles.itemsWrapper}>
          {links.map((link) => (
            link.isAction ? (
              // El botón central de acción (Acción en tu imagen)
              <div key={link.id} className={styles.centralActionButtonContainer}>
                <button className={styles.centralActionButton}>
                  <div className={styles.centralIcon}>{link.icon}</div>
                  {/* Generalmente el central no lleva texto para este diseño, lo ocultamos visualmente */}
                  <span className={styles.labelHidden}>{link.name}</span>
                </button>
              </div>
            ) : (
              // Los enlaces estándar
              <NavLink
                key={link.id}
                to="/test" // Dummy route para testing
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.active : ""}`
                }
              >
                <div className={styles.icon}>{link.icon}</div>
                <span className={styles.label}>{link.name}</span>
              </NavLink>
            )
          ))}
        </div>
      </nav>
    </div>
  );
};

export default AdminBottomNav;
