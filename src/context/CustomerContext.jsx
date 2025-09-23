// src/context/CustomerContext.jsx (ACTUALIZADO)

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
  const [isFirstAddressRequired, setIsFirstAddressRequired] = useState(false); // <-- NUEVO ESTADO

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

  const checkAndLogin = async (newPhone) => {
    if (!/^\d{10}$/.test(newPhone)) return false;

    const { data: customer, error } = await supabase
        .from('customers').select('id').eq('phone', newPhone).maybeSingle();
    
    if (error) {
        console.error("Error checking customer:", error);
        return false;
    }

    if (customer) {
        localStorage.setItem(CUSTOMER_PHONE_KEY, newPhone);
        setPhone(newPhone);
        setPhoneModalOpen(false);
        if (onSuccessCallback) {
            onSuccessCallback();
            setOnSuccessCallback(null);
        }
        return true;
    }
    
    return false;
};

  const registerNewCustomer = async (newPhone, newName) => {
    const { data, error } = await supabase
      .from('customers').insert({ name: newName, phone: newPhone }).select().single();

    if (error) {
      console.error("Error creating customer:", error);
      return false;
    }

    if (data) {
      localStorage.setItem(CUSTOMER_PHONE_KEY, newPhone);
      setPhone(newPhone);
      setPhoneModalOpen(false);
      setIsFirstAddressRequired(true); // <-- Dispara el modal de dirección
      if (onSuccessCallback) {
        onSuccessCallback();
        setOnSuccessCallback(null);
      }
      return true;
    }
    return false;
  };

  const savePhone = (newPhone) => {
    if (/^\d{10,12}$/.test(newPhone)) {
        localStorage.setItem(CUSTOMER_PHONE_KEY, newPhone);
        setPhone(newPhone);
        setPhoneModalOpen(false);

        if (onSuccessCallback) {
            onSuccessCallback();
            setOnSuccessCallback(null);
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
    registerNewCustomer, // <-- NUEVO
    savePhone,
    clearPhone,
    isPhoneModalOpen,
    setPhoneModalOpen: togglePhoneModal,
    isCheckoutModalOpen,
    setCheckoutModalOpen: toggleCheckoutModal,
    checkoutMode,
    isFirstAddressRequired, // <-- NUEVO
    setIsFirstAddressRequired, // <-- NUEVO
  };

  return (
    <CustomerContext.Provider value={value}>
      {children}
    </CustomerContext.Provider>
  );
};