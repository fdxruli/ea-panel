// src/context/CustomerContext.jsx (CORREGIDO Y CON LLAMADA A RPC ELIMINADA)

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
  const [phone, setPhone] = useState('');
  const [customer, setCustomer] = useState(null);
  const [isPhoneModalOpen, setPhoneModalOpen] = useState(false);
  const [isCheckoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState('checkout');
  const [onSuccessCallback, setOnSuccessCallback] = useState(null);
  const [isFirstAddressRequired, setIsFirstAddressRequired] = useState(false);

  // Efecto para cargar el teléfono desde localStorage (sin cambios)
  useEffect(() => {
    const savedPhone = localStorage.getItem(CUSTOMER_PHONE_KEY);
    if (savedPhone) {
      setPhone(savedPhone);
    } else {
      // Abrir modal solo si no se ha mostrado antes en la sesión
      if (!sessionStorage.getItem('phoneModalShown')) {
        setPhoneModalOpen(true);
        sessionStorage.setItem('phoneModalShown', 'true');
      }
    }
  }, []);

  // Función checkAndLogin (sin cambios)
  const checkAndLogin = async (newPhone) => {
    if (!/^\d{10}$/.test(newPhone)) {
      return { exists: false, accepted: false, customer: null };
    }
    // ... (lógica interna sin cambios)
    const { data: customerData, error: customerError } = await supabase
        .from('customers').select('id, name, phone').eq('phone', newPhone).maybeSingle();

    if (customerError) {
        console.error("Error checking customer:", customerError);
        return { exists: false, accepted: false, customer: null };
    }

    if (customerData) {
        const { data: latestTerms } = await supabase
            .from('terms_and_conditions').select('id').order('version', { ascending: false }).limit(1).maybeSingle();

        if (latestTerms) {
            const { data: acceptance } = await supabase
                .from('customer_terms_acceptances').select('id')
                .eq('customer_id', customerData.id)
                .eq('terms_version_id', latestTerms.id)
                .maybeSingle();
            return { exists: true, accepted: !!acceptance, customer: customerData };
        }
        // Si no hay términos, se asume aceptado (o manejar según tu lógica)
        return { exists: true, accepted: true, customer: customerData };
    }
    return { exists: false, accepted: false, customer: null };
  };

  // Función acceptTerms (sin cambios)
  const acceptTerms = async (customerId) => {
    const { data: latestTerms, error: termsError } = await supabase
        .from('terms_and_conditions').select('id').order('version', { ascending: false }).limit(1).maybeSingle();

    if (termsError || !latestTerms) {
        console.error("No se pudieron obtener los términos para aceptar.");
        return false;
    }
    const { error } = await supabase.from('customer_terms_acceptances').insert({
        customer_id: customerId,
        terms_version_id: latestTerms.id,
    });

    if (error) {
        console.error("Error al aceptar los términos:", error);
        return false;
    }
    return true;
  }

  // --- 👇 FUNCIÓN registerNewCustomer MODIFICADA ---
  const registerNewCustomer = async (newPhone, newName, referralCode = null) => {
    let referrerId = null;
    // Buscar el referente si se proporcionó un código
    if (referralCode) {
        const { data: referrerData, error: referrerError } = await supabase
            .from('customers')
            .select('id')
            .eq('referral_code', referralCode.toUpperCase())
            .maybeSingle(); // Usar maybeSingle es más seguro
        if (referrerData && !referrerError) {
            referrerId = referrerData.id;
        } else {
            console.warn("Código de referido no encontrado o inválido:", referralCode);
            // Opcional: Podrías mostrar una alerta aquí si el código es inválido
            // showAlert('El código de referido ingresado no es válido.');
            // return false; // Podrías detener el registro si el código es inválido
        }
    }

    // Generar un código de referido único para el nuevo cliente
    const newReferralCode = await generateUniqueReferralCode(newName, newPhone);

    // Insertar el nuevo cliente en la base de datos
    const { data, error } = await supabase
      .from('customers').insert({
          name: newName,
          phone: newPhone,
          referrer_id: referrerId, // Guardar el ID del referente (si existe)
          referral_code: newReferralCode, // Guardar su propio código
          has_made_first_purchase: false // Asegurarse de que inicia en false
      }).select().single(); // Seleccionar los datos del cliente recién creado

    // Manejar errores durante la inserción
    if (error) {
      console.error("Error creating customer:", error);
       // Podrías añadir manejo específico para errores comunes como teléfono duplicado
       // if (error.code === '23505' && error.message.includes('phone')) {
       //   showAlert('Ya existe una cuenta registrada con este número de teléfono.');
       // }
      return false;
    }

    // Si la inserción fue exitosa
    if (data) {
      // Registrar la aceptación de términos
      await acceptTerms(data.id);

      // ---------------------------------------------------------------------
      // --- SECCIÓN COMENTADA/ELIMINADA ---
      // Ya no llamamos a 'increment_referral_count' desde aquí.
      // El trigger 'trigger_first_purchase_referral' en la tabla 'orders'
      // se encargará de llamar a 'increment_referral_count' cuando
      // este nuevo cliente complete su primera orden ('status' = 'completado').
      /*
      if (referrerId) {
          // Esta llamada RPC ya no es necesaria aquí
          const { error: rpcError } = await supabase.rpc('increment_referral_count', { customer_id: referrerId });
          if (rpcError) {
              // Loguear el error, pero el registro del cliente puede continuar
              console.error("Error incrementing referral count (ahora manejado por trigger):", rpcError);
          }
      }
      */
      // ---------------------------------------------------------------------

      // Actualizar el estado local y proceder
      setCustomer(data);
      savePhoneAndContinue(newPhone, data); // Guardar teléfono y cerrar modal
      setIsFirstAddressRequired(true); // Indicar que se necesita la primera dirección
      return true; // Indicar éxito
    }

    // Si 'data' es null por alguna razón inesperada
    return false;
  };

  // Función savePhoneAndContinue (sin cambios)
  const savePhoneAndContinue = (newPhone, customerData) => {
    // ... (lógica interna sin cambios)
     if (/^\d{10,12}$/.test(newPhone)) { // Ajusta regex si permites más dígitos
        localStorage.setItem(CUSTOMER_PHONE_KEY, newPhone);
        setPhone(newPhone);
        setCustomer(customerData); // Actualiza el estado del cliente
        setPhoneModalOpen(false); // Cierra el modal de teléfono

        // Ejecuta callback si existe (ej: abrir checkout)
        if (onSuccessCallback) {
            onSuccessCallback();
            setOnSuccessCallback(null); // Limpia el callback
        }
        return true;
    }
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

  // Valor del contexto (sin cambios)
  const value = {
    phone,
    customer,
    checkAndLogin,
    registerNewCustomer,
    savePhoneAndContinue,
    clearPhone,
    isPhoneModalOpen,
    setPhoneModalOpen: togglePhoneModal,
    isCheckoutModalOpen,
    setCheckoutModalOpen: toggleCheckoutModal,
    checkoutMode,
    isFirstAddressRequired,
    setIsFirstAddressRequired,
    acceptTerms,
  };

  return (
    <CustomerContext.Provider value={value}>
      {children}
    </CustomerContext.Provider>
  );
};