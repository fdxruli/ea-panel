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

  const savePhone = async (newPhone) => {
    if (/^\d{10,12}$/.test(newPhone)) {
      localStorage.setItem(CUSTOMER_PHONE_KEY, newPhone);
      setPhone(newPhone);
      setPhoneModalOpen(false);

      if (onSuccessCallback) {
        onSuccessCallback();
        setOnSuccessCallback(null);
      } else {
        // Verifica si el cliente es nuevo solo si no hay un callback (es decir, no viene del carrito)
        const { data: customer } = await supabase
          .from('customers')
          .select('id')
          .eq('phone', newPhone)
          .maybeSingle();
        
        if (!customer) {
          // Si el cliente no existe, abre el modal de checkout en modo perfil
          setCheckoutMode('profile'); 
          setCheckoutModalOpen(true);
        }
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