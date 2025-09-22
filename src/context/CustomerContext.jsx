// src/context/CustomerContext.jsx

import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient'; // Importa supabase

const CustomerContext = createContext();

const CUSTOMER_PHONE_KEY = 'customer_phone';

export const useCustomer = () => useContext(CustomerContext);

export const CustomerProvider = ({ children }) => {
  const [phone, setPhone] = useState('');
  const [isPhoneModalOpen, setPhoneModalOpen] = useState(false);
  const [isCheckoutModalOpen, setCheckoutModalOpen] = useState(false); // Estado para el modal de checkout
  const [checkoutMode, setCheckoutMode] = useState('checkout'); // Estado para el modo de checkout
  const [onSuccessCallback, setOnSuccessCallback] = useState(null);

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

  // 👇 NUEVA FUNCIÓN PARA VERIFICAR Y LOGUEAR AUTOMÁTICAMENTE
const checkAndLogin = async (newPhone) => {
    if (!/^\d{10}$/.test(newPhone)) return false; // Solo verifica con 10 dígitos

    const { data: customer, error } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', newPhone)
        .maybeSingle();
    
    if (error) {
        console.error("Error checking customer:", error);
        return false; // Si hay error, procede de forma manual
    }

    if (customer) {
        // Si el cliente existe, lo logueamos y cerramos el modal
        localStorage.setItem(CUSTOMER_PHONE_KEY, newPhone);
        setPhone(newPhone);
        setPhoneModalOpen(false);
        if (onSuccessCallback) {
            onSuccessCallback();
            setOnSuccessCallback(null);
        }
        return true;
    }
    
    return false; // El cliente no existe
};

   // 👇 FUNCIÓN SIMPLIFICADA PARA GUARDAR UN NUEVO NÚMERO
const savePhone = (newPhone) => {
    if (/^\d{10,12}$/.test(newPhone)) {
        localStorage.setItem(CUSTOMER_PHONE_KEY, newPhone);
        setPhone(newPhone);
        setPhoneModalOpen(false);

        if (onSuccessCallback) {
            onSuccessCallback();
            setOnSuccessCallback(null);
        } else {
            // Como es un cliente nuevo, siempre abrimos el modal de perfil
            setCheckoutMode('profile');
            setCheckoutModalOpen(true);
        }
        return true;
    }
    return false;
};

  const clearPhone = () => {
    localStorage.removeItem(CUSTOMER_PHONE_KEY);
    setPhone('');
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
    checkAndLogin,
    savePhone,
    clearPhone,
    isPhoneModalOpen,
    setPhoneModalOpen: togglePhoneModal,
    isCheckoutModalOpen,
    setCheckoutModalOpen: toggleCheckoutModal,
    checkoutMode,
  };

  return (
    <CustomerContext.Provider value={value}>
      {children}
    </CustomerContext.Provider>
  );
};
