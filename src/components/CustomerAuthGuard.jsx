import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useCustomer } from '../context/CustomerContext';
import LoadingSpinner from './LoadingSpinner';

export default function CustomerAuthGuard({ children }) {
  const { isCustomerLoading, isAuthenticated } = useCustomer();
  if (isCustomerLoading) return <div className="fullscreen-loader"><LoadingSpinner /></div>;
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return children || <Outlet />;
}
