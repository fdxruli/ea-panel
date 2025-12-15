import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const CustomerContext = createContext();

const CUSTOMER_PHONE_KEY = 'customer_phone';

export const useCustomer = () => useContext(CustomerContext);

const generateUniqueReferralCode = async (name, phone) => {
  const namePart = name.substring(0, 2).toUpperCase();
  const phonePart = phone.slice(-2);
  const baseCode = `EA-${namePart}-${phonePart}`;

  let finalCode = baseCode;
  let counter = 1;
  let isUnique = false;

  while (!isUnique) {
    const { data, error } = await supabase
      .from('customers')
      .select('id')
      .eq('referral_code', finalCode)
      .maybeSingle();

    if (error) {
      console.error("Error checking for unique code:", error);
      return `EA-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    }

    if (!data) {
      isUnique = true;
    } else {
      counter++;
      finalCode = `${baseCode}-${counter}`;
    }
  }
  return finalCode;
};


export const CustomerProvider = ({ children }) => {
  const [phone, setPhone] = useState(localStorage.getItem(CUSTOMER_PHONE_KEY) || '');
  const [customer, setCustomer] = useState(null);
  const [isPhoneModalOpen, setPhoneModalOpen] = useState(false);
  const [isCheckoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState('checkout'); // 'checkout' o 're-order'
  const [onSuccessCallback, setOnSuccessCallback] = useState(null);

  const [isCustomerLoading, setIsCustomerLoading] = useState(true);

  const checkAndLogin = async (phoneToLogin) => {
    if (!phoneToLogin || phoneToLogin.length < 10) {
      console.warn("Intento de login con número inválido.");
      return false;
    }

    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', phoneToLogin)
        .maybeSingle();

      if (error) {
        console.error('Error en checkAndLogin (buscando cliente):', error);
        clearPhone();
        return false;
      }

      if (data) {
        setCustomer(data);
        localStorage.setItem(CUSTOMER_PHONE_KEY, phoneToLogin);
        setPhone(phoneToLogin);

        if (isPhoneModalOpen) {
          setPhoneModalOpen(false);
        }
        if (onSuccessCallback) {
          onSuccessCallback();
          setOnSuccessCallback(null);
        }
        return true;
      } else {
        console.log("Cliente no encontrado, limpiando sesión.");
        clearPhone();
        return false;
      }

    } catch (error) {
      console.error('Error inesperado en checkAndLogin:', error);
      clearPhone();
      return false;
    }
  };

  useEffect(() => {
    const initializeSession = async () => {
      const savedPhone = localStorage.getItem(CUSTOMER_PHONE_KEY);

      if (savedPhone) {
        await checkAndLogin(savedPhone);
      }

      setIsCustomerLoading(false);
    };

    initializeSession();
  }, []);


  const registerNewCustomer = async (phone, name, inviterCode = null) => {

    const newClientReferralCode = await generateUniqueReferralCode(name, phone);

    let referrerId = null;

    if (inviterCode) {
      const { data: referrerData } = await supabase
        .from('customers')
        .select('id')
        .eq('referral_code', inviterCode)
        .maybeSingle();

      if (referrerData) {
        referrerId = referrerData.id;
      }
    }

    const { data: newCustomer, error } = await supabase
      .from('customers')
      .insert({
        name: name,
        phone: phone,
        referral_code: newClientReferralCode,
        referrer_id: referrerId,
        referral_count: 0,
        has_made_first_purchase: false
      })
      .select()
      .single();

    if (error) {
      console.error('Error registrando nuevo cliente:', error);
      return null;
    }

    return newCustomer;
  };

  const savePhoneAndContinue = async (phoneToSave, name = null) => {
    let customerData = null;
    const existingCustomer = await checkAndLogin(phoneToSave);

    if (existingCustomer) {
      customerData = customer;
    } else if (name) {
      customerData = await registerNewCustomer(name, phoneToSave);
      if (customerData) {
        setCustomer(customerData);
        setPhone(phoneToSave);
        localStorage.setItem(CUSTOMER_PHONE_KEY, phoneToSave);
      }
    } else {
      setPhone(phoneToSave);
      localStorage.setItem(CUSTOMER_PHONE_KEY, phoneToSave);
    }

    if (customerData && isPhoneModalOpen) {
      setPhoneModalOpen(false);
      if (onSuccessCallback) {
        onSuccessCallback();
        setOnSuccessCallback(null);
      }
      return true;
    }
    return false;
  }

  const clearPhone = () => {
    localStorage.removeItem(CUSTOMER_PHONE_KEY);
    setPhone('');
    setCustomer(null);
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
    customer,
    isCustomerLoading,
    checkAndLogin,
    registerNewCustomer,
    savePhoneAndContinue,
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