import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const CustomerContext = createContext();

const CUSTOMER_PHONE_KEY = 'customer_phone';
const CUSTOMER_DATA_KEY = 'customer_data';

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
      return null; // Cambiado a null en lugar de false
    }

    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', phoneToLogin)
        .maybeSingle();

      if (error) {
        console.error('Error de red o DB en checkAndLogin:', error);
        // NO HAGAS clearPhone() AQUÍ. Si es error de red, mantenemos la sesión cacheada intacta.
        return null;
      }

      if (data) {
        setCustomer(data);
        localStorage.setItem(CUSTOMER_PHONE_KEY, phoneToLogin);
        localStorage.setItem(CUSTOMER_DATA_KEY, JSON.stringify(data)); // Actualizar caché
        setPhone(phoneToLogin);

        if (isPhoneModalOpen) setPhoneModalOpen(false);
        if (onSuccessCallback) {
          onSuccessCallback();
          setOnSuccessCallback(null);
        }
        return data; // Retorna la data en lugar de true
      } else {
        // Solo aquí sabemos CON CERTEZA que la DB respondió pero el usuario no existe.
        console.log("Cliente explícitamente no encontrado, limpiando sesión.");
        clearPhone();
        return null;
      }

    } catch (error) {
      console.error('Error inesperado en checkAndLogin:', error);
      // NO HAGAS clearPhone() AQUÍ TAMPOCO.
      return null;
    }
  };

  useEffect(() => {
    const initializeSession = async () => {
      const savedPhone = localStorage.getItem(CUSTOMER_PHONE_KEY);
      const savedCustomerData = localStorage.getItem(CUSTOMER_DATA_KEY);

      // 1. Hidratar el estado local inmediatamente si hay caché, sin esperar a la red
      if (savedCustomerData) {
        try {
          setCustomer(JSON.parse(savedCustomerData));
        } catch (e) {
          console.error('Error leyendo la caché del cliente:', e);
        }
      }

      // 2. Intentar validar en segundo plano. Si no hay internet, simplemente fallará sin borrar la caché.
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
    let customerData = await checkAndLogin(phoneToSave); // Usa los datos retornados directamente

    if (!customerData && name) {
      customerData = await registerNewCustomer(phoneToSave, name);
      if (customerData) {
        setCustomer(customerData);
        setPhone(phoneToSave);
        localStorage.setItem(CUSTOMER_PHONE_KEY, phoneToSave);
        localStorage.setItem(CUSTOMER_DATA_KEY, JSON.stringify(customerData)); // Cachear registro nuevo
      }
    } else if (!customerData && !name) {
      // Escenario fallback si solo se guardaba el teléfono sin nombre
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
  };

  const clearPhone = () => {
    localStorage.removeItem(CUSTOMER_PHONE_KEY);
    localStorage.removeItem(CUSTOMER_DATA_KEY); // Limpiar caché también
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