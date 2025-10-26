import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAlert } from '../context/AlertContext';
import LoadingSpinner from '../components/LoadingSpinner';
import DOMPurify from 'dompurify';
import styles from './RegisterAdmin.module.css';
import { useAdminAuth } from '../context/AdminAuthContext';

const sections = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'crear-pedido', label: 'Crear Pedido' },
  { key: 'pedidos', label: 'Pedidos' },
  { key: 'productos', label: 'Productos' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'referidos', label: 'Referidos' },
  { key: 'horarios', label: 'Horarios' },
  { key: 'descuentos', label: 'Descuentos' },
  { key: 'terminos', label: 'Términos y Cond.' },
  { key: 'registrar-admin', label: 'Gestionar Admins' },
  { key: 'special-prices', label: 'Precios Especiales' },
  { key: 'configuracion', label: 'Configuración General' }
];

const actions = ['view', 'edit', 'delete'];

// OPTIMIZACIÓN 1: Memoizar fila de permisos individual
const PermissionRow = memo(({ section, permissions, onPermissionChange }) => {
  return (
    <tr>
      <td>{section.label}</td>
      {actions.map(action => (
        <td key={action}>
          <input
            type="checkbox"
            checked={permissions[section.key]?.[action] || false}
            onChange={() => onPermissionChange(section.key, action)}
            className={styles.checkbox}
          />
        </td>
      ))}
    </tr>
  );
});

PermissionRow.displayName = 'PermissionRow';

// OPTIMIZACIÓN 2: Separar componente de matriz de permisos
const PermissionsMatrix = memo(({ permissions, setPermissions }) => {
  // Memoizar handler para evitar recreación en cada render
  const handlePermissionChange = useCallback((section, action) => {
    setPermissions(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [action]: !prev[section]?.[action]
      }
    }));
  }, [setPermissions]);

  return (
    <div className={styles.permissionsContainer}>
      <h3>Permisos</h3>
      <div className={styles.tableWrapper}>
        <table className={styles.permissionsTable}>
          <thead>
            <tr>
              <th>Sección</th>
              <th>Ver</th>
              <th>Editar/Crear</th>
              <th>Eliminar</th>
            </tr>
          </thead>
          <tbody>
            {sections.map(section => (
              <PermissionRow
                key={section.key}
                section={section}
                permissions={permissions}
                onPermissionChange={handlePermissionChange}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

PermissionsMatrix.displayName = 'PermissionsMatrix';

// OPTIMIZACIÓN 3: Componente de tarjeta de admin memoizado
const AdminCard = memo(({ admin, canEdit, onEdit, onDelete }) => {
  return (
    <div className={styles.adminCard}>
      <div className={styles.adminInfo}>
        <div className={styles.adminHeader}>
          <h3>{admin.name}</h3>
          <span className={`${styles.roleBadge} ${styles[admin.role]}`}>
            {admin.role}
          </span>
        </div>
        <p className={styles.adminEmail}>{admin.email}</p>
      </div>
      {canEdit && (
        <div className={styles.adminActions}>
          <button
            onClick={() => onEdit(admin)}
            className={styles.editButton}
            aria-label="Editar administrador"
          >
            Editar
          </button>
          <button
            onClick={() => onDelete(admin.id)}
            className={styles.deleteButton}
            aria-label="Eliminar administrador"
          >
            Eliminar
          </button>
        </div>
      )}
    </div>
  );
});

AdminCard.displayName = 'AdminCard';

export default function RegisterAdmin() {
  const { showAlert } = useAlert();
  const { hasPermission } = useAdminAuth();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'staff'
  });
  const [permissions, setPermissions] = useState({});

  // OPTIMIZACIÓN 4: Memoizar permisos
  const canEdit = useMemo(() => hasPermission('registrar-admin.edit'), [hasPermission]);
  const canDelete = useMemo(() => hasPermission('registrar-admin.delete'), [hasPermission]);

  // OPTIMIZACIÓN 5: Funciones auxiliares para permisos por defecto
  const getDefaultAdminPermissions = useCallback(() => {
    return sections.reduce((acc, section) => {
      acc[section.key] = { view: true, edit: true, delete: true };
      return acc;
    }, {});
  }, []);

  const getDefaultStaffPermissions = useCallback(() => {
    return {
      'dashboard': { view: true },
      'pedidos': { view: true, edit: true },
      'crear-pedido': { view: false },
      'productos': { view: true },
      'clientes': { view: true },
      'referidos': { view: false },
      'horarios': { view: false },
      'descuentos': { view: false },
      'terminos': { view: false },
      'registrar-admin': { view: false },
      'special-prices': { view: false },
      'configuracion': { view: false }
    };
  }, []);

  // OPTIMIZACIÓN 6: Fetch optimizado
  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('admins')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAdmins(data);
    } catch (error) {
      console.error('Error fetching admins:', error);
      showAlert(`Error al cargar administradores: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  // OPTIMIZACIÓN 7: Memoizar cambios de rol
  const handleRoleChange = useCallback((newRole) => {
    setFormData(prev => ({ ...prev, role: newRole }));
    
    // Aplicar permisos por defecto según el rol
    if (newRole === 'admin') {
      setPermissions(getDefaultAdminPermissions());
    } else {
      setPermissions(getDefaultStaffPermissions());
    }
  }, [getDefaultAdminPermissions, getDefaultStaffPermissions]);

  // OPTIMIZACIÓN 8: Handler de form optimizado
  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: DOMPurify.sanitize(value) }));
  }, []);

  // OPTIMIZACIÓN 9: Validación memoizada
  const isFormValid = useMemo(() => {
    return (
      formData.name.trim() !== '' &&
      formData.email.trim() !== '' &&
      (!editingAdmin && formData.password.length >= 6) || editingAdmin
    );
  }, [formData, editingAdmin]);

  // OPTIMIZACIÓN 10: Submit optimizado
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    
    if (!isFormValid) {
      showAlert('Por favor, completa todos los campos requeridos.');
      return;
    }

    try {
      if (editingAdmin) {
        // Actualizar admin existente
        const { error } = await supabase
          .from('admins')
          .update({
            name: formData.name,
            role: formData.role,
            permissions
          })
          .eq('id', editingAdmin.id);

        if (error) throw error;
        showAlert('Administrador actualizado exitosamente.');
      } else {
        // Crear nuevo admin
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              name: formData.name,
              role: formData.role,
              permissions
            }
          }
        });

        if (authError) throw authError;
        showAlert('Administrador creado exitosamente. Se ha enviado un correo de verificación.');
      }

      closeModal();
      fetchAdmins();
    } catch (error) {
      showAlert(`Error: ${error.message}`);
    }
  }, [formData, permissions, editingAdmin, isFormValid, fetchAdmins, showAlert]);

  // OPTIMIZACIÓN 11: Modal handlers memoizados
  const openModal = useCallback((admin = null) => {
    if (!canEdit) return;

    if (admin) {
      setEditingAdmin(admin);
      setFormData({
        name: admin.name,
        email: admin.email,
        password: '',
        role: admin.role
      });
      setPermissions(admin.permissions || {});
    } else {
      setEditingAdmin(null);
      setFormData({
        name: '',
        email: '',
        password: '',
        role: 'staff'
      });
      setPermissions(getDefaultStaffPermissions());
    }
    
    setIsModalOpen(true);
  }, [canEdit, getDefaultStaffPermissions]);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingAdmin(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      role: 'staff'
    });
    setPermissions({});
  }, []);

  const handleDelete = useCallback(async (adminId) => {
    if (!canDelete) return;

    if (!window.confirm('¿Estás seguro de que deseas eliminar este administrador?')) {
      return;
    }

    try {
      // Eliminar de auth y tabla admins
      const { error } = await supabase.auth.admin.deleteUser(adminId);
      if (error) throw error;

      showAlert('Administrador eliminado exitosamente.');
      fetchAdmins();
    } catch (error) {
      showAlert(`Error al eliminar: ${error.message}`);
    }
  }, [canDelete, fetchAdmins, showAlert]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Gestión de Administradores</h1>
        {canEdit && (
          <button 
            onClick={() => openModal()} 
            className={styles.addButton}
          >
            + Nuevo Admin
          </button>
        )}
      </div>

      {admins.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No hay administradores registrados.</p>
        </div>
      ) : (
        <div className={styles.adminsGrid}>
          {admins.map(admin => (
            <AdminCard
              key={admin.id}
              admin={admin}
              canEdit={canEdit}
              onEdit={openModal}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Modal para crear/editar */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div 
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2>
                {editingAdmin ? 'Editar Administrador' : 'Nuevo Administrador'}
              </h2>
              <button 
                onClick={closeModal}
                className={styles.closeButton}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className={styles.modalBody}>
              <div className={styles.formGroup}>
                <label htmlFor="name">Nombre Completo:</label>
                <input
                  id="name"
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  className={styles.input}
                  placeholder="Juan Pérez"
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="email">Correo Electrónico:</label>
                <input
                  id="email"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  disabled={!!editingAdmin}
                  className={styles.input}
                  placeholder="juan@ejemplo.com"
                />
              </div>

              {!editingAdmin && (
                <div className={styles.formGroup}>
                  <label htmlFor="password">Contraseña:</label>
                  <input
                    id="password"
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                    minLength={6}
                    className={styles.input}
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
              )}

              <div className={styles.formGroup}>
                <label htmlFor="role">Rol:</label>
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={(e) => handleRoleChange(e.target.value)}
                  className={styles.select}
                >
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <PermissionsMatrix 
                permissions={permissions}
                setPermissions={setPermissions}
              />

              <div className={styles.modalFooter}>
                <button 
                  type="button"
                  onClick={closeModal}
                  className={styles.cancelButton}
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className={styles.saveButton}
                  disabled={!isFormValid}
                >
                  {editingAdmin ? 'Guardar Cambios' : 'Crear Administrador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
