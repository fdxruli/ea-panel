/**
 * whatsappService.js
 * Pure functions for building WhatsApp order messages and generating URLs.
 * No React, no Supabase, no side effects.
 */
import { formatScheduledTime } from '../utils/checkoutDateUtils';
import { BUSINESS_PHONE } from '../config/constantes';

/**
 * Builds a WhatsApp-compatible text message for a guest (non-registered) order.
 *
 * @param {object} params
 * @param {string} params.orderCode
 * @param {Array}  params.cartItems - [{ name, quantity }]
 * @param {number} params.total
 * @returns {string}
 */
export const buildGuestOrderMessage = ({ orderCode, cartItems, total }) => {
  let message = 'Hola, quiero hacer el siguiente pedido:\n';
  message += `*Pedido N°: ${orderCode}*\n\n`;

  cartItems.forEach((item) => {
    message += `• ${item.quantity}x ${item.name}\n`;
  });

  message += `\n*Total: $${total.toFixed(2)}*`;
  return message;
};

/**
 * Builds a WhatsApp-compatible text message for a registered customer order.
 *
 * @param {object} params
 * @param {string} params.orderCode
 * @param {Array}  params.cartItems - [{ name, quantity }]
 * @param {number} params.subtotal
 * @param {number} params.total
 * @param {object|null} params.discount - { code, amount } or null
 * @param {string|null} params.scheduledISO - ISO string or null for "as soon as possible"
 * @param {object} params.customer - { name }
 * @param {object|null} params.address - { address_reference } or null
 * @returns {string}
 */
export const buildCustomerOrderMessage = ({
  orderCode,
  cartItems,
  subtotal,
  total,
  discount,
  scheduledISO,
  customer,
  address,
}) => {
  let message = '¡Hola! 👋 Quiero confirmar mi pedido:\n';
  message += `*Pedido N°: ${orderCode}*\n\n`;

  cartItems.forEach((item) => {
    message += `• ${item.quantity}x ${item.name}\n`;
  });

  if (discount) {
    message += `\n*Subtotal:* $${subtotal.toFixed(2)}`;
    message += `\n*Descuento (${discount.code}):* -$${discount.amount.toFixed(2)}`;
    message += `\n*Total a pagar: $${total.toFixed(2)}*\n`;
  } else {
    message += `\n*Total a pagar: $${total.toFixed(2)}*\n`;
  }

  if (scheduledISO) {
    const formattedDate = formatScheduledTime(scheduledISO);
    message += `\n\n*Programado para entregar:*\n${formattedDate}\n`;
  }

  message += `\n*Datos del cliente:*\n*Nombre:* ${customer?.name}\n`;

  if (address?.address_reference) {
    message += `*Referencia de domicilio:* ${address.address_reference}`;
  }

  return message;
};

/**
 * Builds the appropriate WhatsApp order message based on customer type.
 *
 * @param {object} params
 * @param {boolean} params.isGuest
 * @param {string} params.orderCode
 * @param {Array}  params.cartItems
 * @param {number} params.subtotal
 * @param {number} params.total
 * @param {object|null} params.discount
 * @param {string|null} params.scheduledISO
 * @param {object|null} params.customer
 * @param {object|null} params.address
 * @returns {string}
 */
export const buildOrderMessage = (params) => {
  if (params.isGuest) {
    return buildGuestOrderMessage({
      orderCode: params.orderCode,
      cartItems: params.cartItems,
      total: params.total,
    });
  }

  return buildCustomerOrderMessage({
    orderCode: params.orderCode,
    cartItems: params.cartItems,
    subtotal: params.subtotal,
    total: params.total,
    discount: params.discount,
    scheduledISO: params.scheduledISO,
    customer: params.customer,
    address: params.address,
  });
};

/**
 * Generates a WhatsApp URL for the given message and phone number.
 * Falls back to the configured business phone if none provided.
 *
 * @param {string} message
 * @param {string} [phoneNumber] - optional, defaults to BUSINESS_PHONE
 * @returns {string}
 */
export const getWhatsAppUrl = (message, phoneNumber) => {
  const phone = phoneNumber || BUSINESS_PHONE;
  return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
};
