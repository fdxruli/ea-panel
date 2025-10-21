import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAlert } from '../context/AlertContext';
import LoadingSpinner from '../components/LoadingSpinner';
import DOMPurify from 'dompurify';
import styles from './RegisterAdmin.module.css';
import { useAdminAuth } from '../context/AdminAuthContext'; // Importar hook

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
    { key: 'configuracion', label: 'Configuración General'}
];
const actions = ['view', 'edit', 'delete'];

const PermissionsMatrix = ({ permissions, setPermissions }) => {
    const handlePermissionChange = (section, action) => {
        setPermissions(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                [action]: !prev[section]?.[action]
            }
        }));
    };

    return (
        <div className="table-wrapper">
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
                        <tr key={section.key}>
                            <td>{section.label}</td>
                            {actions.map(action => (
                                <td key={action}>
                                    <input
                                        type="checkbox"
                                        checked={!!permissions[section.key]?.[action]}
                                        onChange={() => handlePermissionChange(section.key, action)}
                                    />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const EditPermissionsModal = ({ admin, onClose, onSave }) => {
    const [permissions, setPermissions] = useState(admin.permissions || {});

    const handleSave = () => {
        onSave(admin.id, permissions);
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <h2>Editando permisos de {admin.name}</h2>
                <div className={styles.modalBody}>
                    <PermissionsMatrix permissions={permissions} setPermissions={setPermissions} />
                </div>
                <div className={styles.modalActions}>
                    <button onClick={onClose} className={styles.cancelButton}>Cancelar</button>
                    <button onClick={handleSave} className={styles.saveButton}>Guardar Cambios</button>
                </div>
            </div>
        </div>
    );
};


export default function RegisterAdmin() {
    const { showAlert } = useAlert();
    const { hasPermission } = useAdminAuth(); // Usar hook
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('staff');
    const [loading, setLoading] = useState(false);

    const initialPermissions = { dashboard: { view: true }, pedidos: { view: true } };
    const [permissions, setPermissions] = useState(initialPermissions);

    const [admins, setAdmins] = useState([]);
    const [loadingAdmins, setLoadingAdmins] = useState(true);
    const [editingAdmin, setEditingAdmin] = useState(null);

    const canEdit = hasPermission('registrar-admin.edit');

    const fetchAdmins = useCallback(async () => {
        setLoadingAdmins(true);
        const { data, error } = await supabase.from('admins').select('*');
        if (error) {
            showAlert(`Error al cargar administradores: ${error.message}`);
        } else {
            setAdmins(data);
        }
        setLoadingAdmins(false);
    }, [showAlert]);

    useEffect(() => {
        fetchAdmins();
        const channel = supabase.channel('public:admins')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'admins' }, (payload) => {
                console.log('Admin list changed:', payload);
                fetchAdmins();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchAdmins]);

    const handleRegister = async (e) => {
        e.preventDefault();
        if (!canEdit) return;
        setLoading(true);

        const { data: { session: adminSession } } = await supabase.auth.getSession();
        if (!adminSession) {
            showAlert('Error: Tu sesión ha expirado. Por favor, inicia sesión de nuevo.');
            setLoading(false);
            return;
        }

        const cleanName = DOMPurify.sanitize(name);

        const { data: newUserData, error: signUpError } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    role: role,
                    name: cleanName,
                }
            }
        });

        if (signUpError) {
            await supabase.auth.setSession({
                access_token: adminSession.access_token,
                refresh_token: adminSession.refresh_token,
            });
            showAlert(`Error al crear usuario: ${signUpError.message}`);
            setLoading(false);
            return;
        }

        const { error: updateError } = await supabase
            .from('admins')
            .update({ permissions: permissions })
            .eq('id', newUserData.user.id);

        await supabase.auth.setSession({
            access_token: adminSession.access_token,
            refresh_token: adminSession.refresh_token,
        });

        if (updateError) {
            showAlert(`Usuario creado, pero hubo un error al guardar los permisos: ${updateError.message}. Por favor, edítalos manualmente.`);
        } else {
            showAlert(`¡Usuario ${newUserData.user.email} creado con éxito! Revisa el correo para confirmar la cuenta.`);
            setName('');
            setEmail('');
            setPassword('');
            setPermissions(initialPermissions);
            fetchAdmins();
        }
        
        setLoading(false);
    };

    const handleUpdatePermissions = async (adminId, newPermissions) => {
        if (!canEdit) return;
        const { error } = await supabase.from('admins').update({ permissions: newPermissions }).eq('id', adminId);
        if (error) {
            showAlert(`Error al actualizar permisos: ${error.message}`);
        } else {
            showAlert('Permisos actualizados con éxito.');
            setEditingAdmin(null);
            fetchAdmins();
        }
    };

    return (
        <div className={styles.container}>
            <h1>Gestión de Administradores</h1>

            {canEdit && (
                <div className={styles.formCard}>
                    <h2 className={styles.cardTitle}>Crear Nuevo Administrador</h2>
                    <form onSubmit={handleRegister}>
                        <div className={styles.formGrid}>
                            <div className={styles.formGroup}>
                                <label htmlFor="name">Nombre completo</label>
                                <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="email">Email</label>
                                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="password">Contraseña</label>
                                <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="role">Rol principal</label>
                                <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
                                    <option value="staff">Staff (Permisos limitados)</option>
                                    <option value="admin">Admin (Acceso total)</option>
                                </select>
                            </div>
                        </div>

                        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                            <h3 className={styles.permissionsTitle}>Permisos Específicos (para rol Staff)</h3>
                            <PermissionsMatrix permissions={permissions} setPermissions={setPermissions} />
                        </div>

                        <button type="submit" disabled={loading} className={styles.createButton}>
                            {loading ? 'Creando...' : 'Crear Administrador'}
                        </button>
                    </form>
                </div>
            )}

            <div className={styles.listCard}>
                <h2 className={styles.cardTitle}>Administradores Actuales</h2>
                {loadingAdmins ? <LoadingSpinner /> : (
                    <div className="table-wrapper">
                        <table className="products-table">
                            <thead>
                                <tr>
                                    <th>Nombre</th>
                                    <th>Email</th>
                                    <th>Rol</th>
                                    {canEdit && <th>Acciones</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {admins.map((admin) => (
                                    <tr key={admin.id}>
                                        <td>{admin.name}</td>
                                        <td>{admin.email}</td>
                                        <td>{admin.role}</td>
                                        {canEdit && (
                                            <td>
                                                <button onClick={() => setEditingAdmin(admin)} className="admin-button-secondary">
                                                    Editar Permisos
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {editingAdmin && canEdit && (
                <EditPermissionsModal
                    admin={editingAdmin}
                    onClose={() => setEditingAdmin(null)}
                    onSave={handleUpdatePermissions}
                />
            )}
        </div>
    );
}