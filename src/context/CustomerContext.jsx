// src/context/CustomerContext.jsx (CORREGIDO Y CON ESTADO DE CARGA)

import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const CustomerContext = createContext();

const CUSTOMER_PHONE_KEY = 'customer_phone';

export const useCustomer = () => useContext(CustomerContext);

// Función para generar código de referido (sin cambios)
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
            // Considera una mejor estrategia de fallback si es crítico
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

  // --- NUEVO ---
  // 1. Añadimos el estado de carga de la sesión
  const [isCustomerLoading, setIsCustomerLoading] = useState(true);
  // --- FIN NUEVO ---

  const checkAndLogin = async (phoneToLogin) => {
    if (!phoneToLogin || phoneToLogin.length < 10) {
      console.warn("Intento de login con número inválido.");
      return false;
    }
    
    try {
        // (Tu lógica de RPC 'get_customer_details_by_phone' se elimina según el archivo)
        // Asumimos que la lógica es buscar al cliente
        const { data, error } = await supabase
            .from('customers')
            .select('*') // O las columnas que necesites
            .eq('phone', phoneToLogin)
            .maybeSingle();

        if (error) {
            console.error('Error en checkAndLogin (buscando cliente):', error);
            clearPhone();
            return false;
        }

        if (data) {
            // Cliente encontrado
            setCustomer(data);
            localStorage.setItem(CUSTOMER_PHONE_KEY, phoneToLogin);
            setPhone(phoneToLogin);
            
            // Cierra el modal y ejecuta callback si existe
            if (isPhoneModalOpen) {
                setPhoneModalOpen(false);
            }
            if (onSuccessCallback) {
                onSuccessCallback();
                setOnSuccessCallback(null);
            }
            return true;
        } else {
            // Cliente NO encontrado
            console.log("Cliente no encontrado, limpiando sesión.");
            clearPhone(); // Limpia si el teléfono en localStorage es inválido
            return false;
        }

    } catch (error) {
        console.error('Error inesperado en checkAndLogin:', error);
        clearPhone();
        return false;
    }
  };

  // --- MODIFICADO ---
  // 2. Modificamos el useEffect de inicialización
  useEffect(() => {
    const initializeSession = async () => {
      const savedPhone = localStorage.getItem(CUSTOMER_PHONE_KEY);
      
      if (savedPhone) {
        // Intenta validar el teléfono y cargar los datos del cliente
        await checkAndLogin(savedPhone);
      }
      
      // Informa que la comprobación de sesión ha terminado,
      // exista o no un teléfono.
      setIsCustomerLoading(false);
    };

    initializeSession();
  }, []); // El array vacío es correcto, solo se ejecuta al montar
  // --- FIN MODIFICADO ---


  // Función registerNewCustomer (sin cambios)
  const registerNewCustomer = async (name, phone) => {
    // ... (Tu lógica interna sin cambios)
    const referralCode = await generateUniqueReferralCode(name, phone);

    const { data: newCustomer, error } = await supabase
      .from('customers')
      .insert({
        name: name,
        phone: phone,
        referral_code: referralCode,
        referral_level_id: 1, // Asignar nivel 1 por defecto
        referrals_count: 0 // Iniciar contador en 0
      })
      .select()
      .single();

    if (error) {
      console.error('Error registrando nuevo cliente:', error);
      return null;
    }

    return newCustomer;
  };

  // Función savePhoneAndContinue (sin cambios)
  const savePhoneAndContinue = async (phoneToSave, name = null) => {
    // ... (Tu lógica interna sin cambios)
    let customerData = null;
    const existingCustomer = await checkAndLogin(phoneToSave);

    if (existingCustomer) {
        customerData = customer; // checkAndLogin ya lo habrá seteado
    } else if (name) {
        // Si no existe Y nos dieron un nombre, lo registramos
        customerData = await registerNewCustomer(name, phoneToSave);
        if (customerData) {
            setCustomer(customerData);
            setPhone(phoneToSave);
            localStorage.setItem(CUSTOMER_PHONE_KEY, phoneToSave);
        }
    } else {
        // No existe y no hay nombre (ej. solo ingresó teléfono)
        // Guardamos el teléfono para usarlo al finalizar la compra
        setPhone(phoneToSave);
        localStorage.setItem(CUSTOMER_PHONE_KEY, phoneToSave);
    }
    
    // Si la función fue llamada desde el modal (ej. 'mis pedidos')
    // y tuvo éxito (encontramos o creamos cliente), cerramos modal y ejecutamos callback
    if (customerData && isPhoneModalOpen) {
        setPhoneModalOpen(false);
        if (onSuccessCallback) {
            onSuccessCallback();
            setOnSuccessCallback(null); // Limpia el callback
        }
        return true;
    }
    // Si solo guardamos teléfono (sin nombre) o no hay callback
    return false;
  }

  // Función clearPhone (sin cambios)
  const clearPhone = () => {
    localStorage.removeItem(CUSTOMER_PHONE_KEY);
    setPhone('');
    setCustomer(null);
  };

  // Función togglePhoneModal (sin cambios)
  const togglePhoneModal = (value) => {
    // ... (lógica interna sin cambios)
    if (typeof value === 'function') {
      setOnSuccessCallback(() => value); // Guarda la función callback
      setPhoneModalOpen(true);
    } else {
      setOnSuccessCallback(null); // Limpia el callback si no es una función
      setPhoneModalOpen(!!value); // Abre/cierra según el valor booleano
    }
  };

  // Función toggleCheckoutModal (sin cambios)
  const toggleCheckoutModal = (isOpen, mode = 'checkout') => {
    setCheckoutMode(mode);
    setCheckoutModalOpen(isOpen);
  }

  // --- MODIFICADO ---
  // 3. Añadimos isCustomerLoading al valor del contexto
  const value = {
    phone,
    customer,
    isCustomerLoading, // <-- ¡Añadido!
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
  // --- FIN MODIFICADO ---

  return (
    <CustomerContext.Provider value={value}>
      {children}
    </CustomerContext.Provider>
  );
};
