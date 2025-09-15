// src/context/CustomerContext.jsx

import React, { createContext, useState, useContext, useEffect } from 'react';

const CustomerContext = createContext();

const CUSTOMER_PHONE_KEY = 'customer_phone';

export const useCustomer = () => useContext(CustomerContext);

export const CustomerProvider = ({ children }) => {
  const [phone, setPhone] = useState('');
  const [isPhoneModalOpen, setPhoneModalOpen] = useState(false);

  useEffect(() => {
    const savedPhone = localStorage.getItem(CUSTOMER_PHONE_KEY);
    if (savedPhone) {
      setPhone(savedPhone);
    } else {
      // Solo muestra el modal una vez por sesión del navegador.
      if (!sessionStorage.getItem('phoneModalShown')) {
        setPhoneModalOpen(true);
        sessionStorage.setItem('phoneModalShown', 'true');
      }
    }
  }, []);

  const savePhone = (newPhone) => {
    if (/^\d{10,12}$/.test(newPhone)) {
      localStorage.setItem(CUSTOMER_PHONE_KEY, newPhone);
      setPhone(newPhone);
      setPhoneModalOpen(false);
      return true;
    }
    return false;
  };

  const clearPhone = () => {
    localStorage.removeItem(CUSTOMER_PHONE_KEY);
    setPhone('');
  };

  const value = {
    phone,
    savePhone,
    clearPhone,
    isPhoneModalOpen,
    setPhoneModalOpen,
  };

  return (
    <CustomerContext.Provider value={value}>
      {children}
    </CustomerContext.Provider>
  );
};