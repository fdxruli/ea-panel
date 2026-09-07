import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useCustomer } from '../context/CustomerContext';
import LoadingSpinner from './LoadingSpinner';

export default function CustomerAuthGuard({ children }) {
  const { authInitialized, isCustomerLoading, isAuthenticated, isLinked } = useCustomer();
  if (!authInitialized || isCustomerLoading) return <div className="fullscreen-loader"><LoadingSpinner /></div>;
  if (!isAuthenticated || !isLinked) return <Navigate to="/" replace />;
  return children || <Outlet />;
}
