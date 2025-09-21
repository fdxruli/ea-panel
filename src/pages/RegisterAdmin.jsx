// src/pages/RegisterAdmin.jsx (CORREGIDO Y MEJORADO)

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAlert } from '../context/AlertContext';
import LoadingSpinner from '../components/LoadingSpinner';

// --- COMPONENTE PARA LA MATRIZ DE PERMISOS ---
const PermissionsMatrix = ({ permissions, setPermissions }) => {
    const sections = [
        { key: 'dashboard', label: 'Dashboard' },
        { key: 'pedidos', label: 'Pedidos' },
        { key: 'productos', label: 'Productos' },
        { key: 'clientes', label: 'Clientes' },
        { key: 'descuentos', label: 'Descuentos' },
        { key: 'terminos', label: 'Términos y Cond.' },
        { key: 'registrar-admin', label: 'Gestionar Admins' },
    ];

    const actions = ['view', 'edit', 'delete'];

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
        <table className="products-table" style={{ marginBottom: '1.5rem' }}>
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
                            <td key={action} style={{ textAlign: 'center' }}>
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
    );
};

// --- COMPONENTE PARA EL MODAL DE EDICIÓN ---
const EditPermissionsModal = ({ admin, onClose, onSave }) => {
    const [permissions, setPermissions] = useState(admin.permissions || {});

    const handleSave = () => {
        onSave(admin.id, permissions);
    };

    return (
        <div className="modalOverlay">
            <div className="modalContent">
                <h2>Editando permisos de {admin.name}</h2>
                <PermissionsMatrix permissions={permissions} setPermissions={setPermissions} />
                <div className="modalActions">
                    <button onClick={onClose}>Cancelar</button>
                    <button onClick={handleSave}>Guardar Cambios</button>
                </div>
            </div>
        </div>
    );
};


export default function RegisterAdmin() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('staff');
    const [loading, setLoading] = useState(false);
    const { showAlert } = useAlert();

    const initialPermissions = {
        dashboard: { view: true },
        pedidos: { view: true },
    };
    const [permissions, setPermissions] = useState(initialPermissions);

    const [admins, setAdmins] = useState([]);
    const [loadingAdmins, setLoadingAdmins] = useState(true);
    const [editingAdmin, setEditingAdmin] = useState(null);

    const fetchAdmins = async () => {
        setLoadingAdmins(true);
        const { data, error } = await supabase.from('admins').select('*');
        if (error) {
            showAlert(`Error al cargar administradores: ${error.message}`);
        } else {
            setAdmins(data);
        }
        setLoadingAdmins(false);
    };

    useEffect(() => {
        fetchAdmins();
    }, []);

    const handleRegister = async (e) => {
        e.preventDefault();
        setLoading(true);
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    role: role,
                    name: name,
                    permissions: permissions
                }
            }
        });
        if (error) {
            showAlert(`Error: ${error.message}`);
        } else {
            showAlert(`¡Usuario ${data.user.email} creado!`);
            setName('');
            setEmail('');
            setPassword('');
            setPermissions(initialPermissions);
            fetchAdmins();
        }
        setLoading(false);
    };

    const handleUpdatePermissions = async (adminId, newPermissions) => {
        const { error } = await supabase
            .from('admins')
            .update({ permissions: newPermissions })
            .eq('id', adminId);

        if (error) {
            showAlert(`Error al actualizar permisos: ${error.message}`);
        } else {
            showAlert('Permisos actualizados con éxito.');
            setEditingAdmin(null);
            fetchAdmins();
        }
    };


    return (
        <div style={{ maxWidth: '700px', margin: '2rem auto' }}>
            <h1>Gestionar Administradores</h1>

            <div className="form-container" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <h3>Crear Nuevo Administrador</h3>
                <input type="text" placeholder="Nombre completo" value={name} onChange={(e) => setName(e.target.value)} required />
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />

                <label>Rol principal:</label>
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="staff">Staff</option>
                    <option value="admin">Admin (Acceso total)</option>
                </select>

                <h4 style={{ marginTop: '2rem' }}>Permisos Específicos:</h4>
                <PermissionsMatrix permissions={permissions} setPermissions={setPermissions} />

                <button onClick={handleRegister} disabled={loading}>
                    {loading ? 'Creando...' : 'Crear Usuario'}
                </button>
            </div>

            <div style={{ marginTop: '3rem' }}>
                <h2>Administradores Actuales</h2>
                {loadingAdmins ? <LoadingSpinner /> : (
                    <table className="products-table">
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Email</th>
                                <th>Rol</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {admins.map((admin) => (
                                <tr key={admin.id}>
                                    <td>{admin.name}</td>
                                    <td>{admin.email}</td>
                                    <td>{admin.role}</td>
                                    <td>
                                        <button onClick={() => setEditingAdmin(admin)}>
                                            Editar Permisos
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {editingAdmin && (
                <EditPermissionsModal
                    admin={editingAdmin}
                    onClose={() => setEditingAdmin(null)}
                    onSave={handleUpdatePermissions}
                />
            )}
        </div>
    );
}