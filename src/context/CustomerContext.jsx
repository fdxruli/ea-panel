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
  const [phone, setPhone] = useState('');
  const [customer, setCustomer] = useState(null);
  const [isPhoneModalOpen, setPhoneModalOpen] = useState(false);
  const [isCheckoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState('checkout');
  const [onSuccessCallback, setOnSuccessCallback] = useState(null);
  const [isFirstAddressRequired, setIsFirstAddressRequired] = useState(false);

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
    if (!/^\d{10}$/.test(newPhone)) {
      return { exists: false, accepted: false, customer: null };
    }

    const { data: customerData, error: customerError } = await supabase
        .from('customers').select('id, name, phone').eq('phone', newPhone).maybeSingle();

    if (customerError) {
        console.error("Error checking customer:", customerError);
        return { exists: false, accepted: false, customer: null };
    }
    
    setCustomer(customerData);

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
        
        return { exists: true, accepted: true, customer: customerData };
    }
    
    return { exists: false, accepted: false, customer: null };
  };

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

  const registerNewCustomer = async (newPhone, newName, referralCode = null) => {
    let referrerId = null;
    if (referralCode) {
        const { data: referrerData, error: referrerError } = await supabase
            .from('customers')
            .select('id')
            .eq('referral_code', referralCode.toUpperCase())
            .single();
        if (referrerData && !referrerError) {
            referrerId = referrerData.id;
        } else {
            console.warn("Código de referido no encontrado:", referralCode);
        }
    }

    const newReferralCode = await generateUniqueReferralCode(newName, newPhone);

    const { data, error } = await supabase
      .from('customers').insert({
          name: newName,
          phone: newPhone,
          referrer_id: referrerId,
          referral_code: newReferralCode
      }).select().single();

    if (error) {
      console.error("Error creating customer:", error);
      return false;
    }

    if (data) {
      await acceptTerms(data.id);
      
      if (referrerId) {
          const { error: rpcError } = await supabase.rpc('increment_referral_count', { customer_id: referrerId });
          if (rpcError) {
              console.error("Error incrementing referral count:", rpcError);
          }
      }

      savePhoneAndContinue(newPhone);
      setIsFirstAddressRequired(true);
      return true;
    }
    return false;
  };
  
  const savePhoneAndContinue = (newPhone) => {
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