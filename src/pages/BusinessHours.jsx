import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAlert } from '../context/AlertContext';
import styles from './BusinessHours.module.css';
import { useAdminAuth } from '../context/AdminAuthContext';

const weekDays = [
    { id: 0, name: 'Domingo' },
    { id: 1, name: 'Lunes' },
    { id: 2, name: 'Martes' },
    { id: 3, name: 'Miércoles' },
    { id: 4, name: 'Jueves' },
    { id: 5, name: 'Viernes' },
    { id: 6, name: 'Sábado' },
];

export default function BusinessHours() {
    const { showAlert } = useAlert();
    const { hasPermission } = useAdminAuth();
    const [hours, setHours] = useState([]);
    const [exceptions, setExceptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [newException, setNewException] = useState({
        date: '',
        is_closed: true,
        open_time: '',
        close_time: '',
        reason: ''
    });

    const canEdit = hasPermission('horarios.edit');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const { data: hoursData, error: hoursError } = await supabase
                .from('business_hours')
                .select('*')
                .order('day_of_week', { ascending: true });
            if (hoursError) throw hoursError;

            const fullHours = weekDays.map(day => {
                const dbHour = hoursData.find(h => h.day_of_week === day.id);
                return dbHour || { day_of_week: day.id, open_time: '09:00', close_time: '17:00', is_closed: true };
            });
            setHours(fullHours);

            const { data: exceptionsData, error: exceptionsError } = await supabase
                .from('business_exceptions')
                .select('*')
                .order('date', { ascending: false });
            if (exceptionsError) throw exceptionsError;
            setExceptions(exceptionsData);

        } catch (error) {
            showAlert(`Error al cargar los datos: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }, [showAlert]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);


    const handleHourChange = (day, field, value) => {
        setHours(currentHours =>
            currentHours.map(h =>
                h.day_of_week === day ? { ...h, [field]: value } : h
            )
        );
    };

    const handleSaveChanges = async () => {
        if (!canEdit) return;
        setIsEditing(false);
        try {
            const { error } = await supabase.from('business_hours').upsert(hours, {
                onConflict: 'day_of_week'
            });

            if (error) throw error;
            showAlert('Horarios guardados con éxito.');
        } catch (error) {
            showAlert(`Error al guardar los horarios: ${error.message}`);
        }
    };
    
    const handleAddException = async () => {
        if (!canEdit) return;
        if (!newException.date) {
            showAlert('Por favor, selecciona una fecha para la excepción.');
            return;
        }
        
        try {
            const { error } = await supabase.from('business_exceptions').insert(newException);
            if (error) throw error;

            showAlert('Excepción añadida correctamente.');
            setNewException({ date: '', is_closed: true, open_time: '', close_time: '', reason: '' });
            fetchData();
        } catch(error) {
            showAlert(`Error al añadir la excepción: ${error.message}`);
        }
    };
    
    const handleDeleteException = async (exceptionId) => {
        if (!hasPermission('horarios.delete')) return;
        if (window.confirm('¿Estás seguro de que quieres eliminar esta excepción?')) {
            try {
                const { error } = await supabase.from('business_exceptions').delete().eq('id', exceptionId);
                if (error) throw error;
                showAlert('Excepción eliminada.');
                fetchData();
            } catch (error) {
                 showAlert(`Error al eliminar: ${error.message}`);
            }
        }
    };


    if (loading) return <LoadingSpinner />;

    return (
        <div className={styles.container}>
            <h1>Gestión de Horarios</h1>

            <div className={styles.card}>
                <h2>Horario Semanal</h2>
                {isEditing ? (
                    <p>Modifica los horarios y haz clic en "Guardar Cambios".</p>
                ) : (
                    <p>Estos son los horarios de apertura y cierre para cada día de la semana.</p>
                )}

                <div className={styles.hoursGrid}>
                    {hours.map(day => (
                        <div key={day.day_of_week} className={`${styles.dayRow} ${day.is_closed ? styles.closed : ''}`}>
                            <strong>{weekDays.find(d => d.id === day.day_of_week)?.name}</strong>
                            {isEditing && canEdit ? (
                                <>
                                    <div className={styles.timeInputs}>
                                        <input type="time" value={day.open_time} onChange={e => handleHourChange(day.day_of_week, 'open_time', e.target.value)} disabled={day.is_closed} />
                                        <span>-</span>
                                        <input type="time" value={day.close_time} onChange={e => handleHourChange(day.day_of_week, 'close_time', e.target.value)} disabled={day.is_closed} />
                                    </div>
                                    <label className={styles.switch}>
                                        <input type="checkbox" checked={!day.is_closed} onChange={e => handleHourChange(day.day_of_week, 'is_closed', !e.target.checked)} />
                                        <span className={styles.slider}></span>
                                    </label>
                                </>
                            ) : (
                                <span>{day.is_closed ? 'Cerrado' : `${day.open_time} - ${day.close_time}`}</span>
                            )}
                        </div>
                    ))}
                </div>
                
                {canEdit && (
                    isEditing ? (
                        <div className={styles.actions}>
                            <button onClick={() => { setIsEditing(false); fetchData(); }} className={styles.cancelButton}>Cancelar</button>
                            <button onClick={handleSaveChanges} className={styles.saveButton}>Guardar Cambios</button>
                        </div>
                    ) : (
                        <div className={styles.actions}>
                            <button onClick={() => setIsEditing(true)} className={styles.editButton}>Editar Horarios</button>
                        </div>
                    )
                )}
            </div>
            
            {canEdit && (
                <div className={styles.card}>
                    <h2>Excepciones (Feriados o Días Especiales)</h2>
                    <div className={styles.exceptionForm}>
                        <div className={styles.formGroup}>
                            <label>Fecha</label>
                            <input type="date" value={newException.date} onChange={e => setNewException({...newException, date: e.target.value})} />
                        </div>
                         <div className={styles.formGroup}>
                            <label>Motivo (Opcional)</label>
                            <input type="text" placeholder="Ej. Aniversario" value={newException.reason} onChange={e => setNewException({...newException, reason: e.target.value})} />
                         </div>
                         <button onClick={handleAddException} className={styles.addButton}>Añadir</button>
                    </div>
                    
                     <div className="table-wrapper">
                        <table className="products-table">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Estado</th>
                                    <th>Motivo</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {exceptions.map(ex => (
                                    <tr key={ex.id}>
                                        <td>{new Date(ex.date).toLocaleDateString()}</td>
                                        <td>{ex.is_closed ? 'Cerrado' : `${ex.open_time} - ${ex.close_time}`}</td>
                                        <td>{ex.reason || 'N/A'}</td>
                                        <td>
                                            {hasPermission('horarios.delete') && (
                                                <button onClick={() => handleDeleteException(ex.id)} className={styles.deleteButton}>Eliminar</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                     </div>
                </div>
            )}
        </div>
    );
}