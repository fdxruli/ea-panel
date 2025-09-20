// src/context/CustomerContext.jsx (CORREGIDO)

import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient'; 

const CustomerContext = createContext();

const CUSTOMER_PHONE_KEY = 'customer_phone';

export const useCustomer = () => useContext(CustomerContext);

export const CustomerProvider = ({ children }) => {
  const [phone, setPhone] = useState('');
  const [isPhoneModalOpen, setPhoneModalOpen] = useState(false);
  const [isCheckoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState('checkout');
  const [onSuccessCallback, setOnSuccessCallback] = useState(null);
  
  // --- 👇 1. NUEVO ESTADO PARA GESTIONAR EL FLUJO ---
  const [isNewUserPendingAddress, setNewUserPendingAddress] = useState(false);


  useEffect(() => {
    const savedPhone = localStorage.getItem(CUSTOMER_PHONE_KEY);
    if (savedPhone) {
      setPhone(savedPhone);
    } else {
      if (!sessionStorage.getItem('phoneModalShown')) {
        setPhoneModalOpen(true);
        sessionStorage.setItem('phoneModalShown', 'true');
      }
    }
  }, []);

   // --- 👇 2. LÓGICA DE GUARDADO ACTUALIZADA ---
   const savePhone = async (newPhone, customerName = null) => {
    if (!/^\d{10,12}$/.test(newPhone)) {
        return { success: false, message: 'Por favor, ingresa un número de WhatsApp válido (10-12 dígitos).' };
    }
    
    // Si se proveyó un nombre, es un cliente nuevo.
    if (customerName) {
        const { error } = await supabase.from('customers').insert({ name: customerName, phone: newPhone });
        if (error) {
            return { success: false, message: `Error al crear el perfil: ${error.message}` };
        }
        // Activamos la bandera para que otro componente se encargue de abrir el modal.
        setNewUserPendingAddress(true); 
    }
    
    // Guardamos el teléfono al final para disparar la carga de datos del usuario.
    localStorage.setItem(CUSTOMER_PHONE_KEY, newPhone);
    setPhone(newPhone);
    setPhoneModalOpen(false);
    
    if (onSuccessCallback) {
        onSuccessCallback();
        setOnSuccessCallback(null);
    }

    return { success: true };
  };
  // --- 👆 FIN DE LA ACTUALIZACIÓN ---

  const clearPhone = () => {
    localStorage.removeItem(CUSTOMER_PHONE_KEY);
    setPhone('');
    setNewUserPendingAddress(false); // Limpiamos la bandera al cerrar sesión
  };

  const togglePhoneModal = (value) => {
    if (typeof value === 'function') {
      setOnSuccessCallback(() => value);
      setPhoneModalOpen(true);
    } else {
      setOnSuccessCallback(null);
      setPhoneModalOpen(!!value);
    }
  };

  const toggleCheckoutModal = (isOpen, mode = 'checkout') => {
    setCheckoutMode(mode); 
    setCheckoutModalOpen(isOpen);
  }

  const value = {
    phone,
    savePhone,
    clearPhone,
    isPhoneModalOpen,
    setPhoneModalOpen: togglePhoneModal,
    isCheckoutModalOpen,
    setCheckoutModalOpen: toggleCheckoutModal,
    checkoutMode,
    // --- 👇 3. EXPONEMOS LA NUEVA BANDERA Y SU FUNCIÓN ---
    isNewUserPendingAddress,
    setNewUserPendingAddress
  };

  return (
    <CustomerContext.Provider value={value}>
      {children}
    </CustomerContext.Provider>
  );
};