import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient'; // Adjust path if needed
import LoadingSpinner from '../components/LoadingSpinner'; // Adjust path if needed
import { useAlert } from '../context/AlertContext'; // Adjust path if needed
import styles from './BusinessHours.module.css'; // Adjust path if needed
import { useAdminAuth } from '../context/AdminAuthContext'; // Adjust path if needed

const weekDays = [
    // ... (keep weekDays array as is)
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
    const [isEditingHours, setIsEditingHours] = useState(false); // Renamed for clarity
    const [newException, setNewException] = useState({
        start_date: '',
        end_date: '', // Added end_date
        is_closed: true, // Default to closed for periods
        open_time: '',
        close_time: '',
        reason: ''
    });

    const canEdit = hasPermission('horarios.edit');
    const canDelete = hasPermission('horarios.delete'); // Added delete permission check

    const fetchData = useCallback(async () => {
        // ... (fetchData remains largely the same, just ensure it fetches exceptions correctly)
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
                 // Order by start_date now
                .order('start_date', { ascending: false });
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
        // ... (handleHourChange remains the same)
        setHours(currentHours =>
            currentHours.map(h =>
                h.day_of_week === day ? { ...h, [field]: value } : h
            )
        );
    };

    const handleSaveChanges = async () => {
         // ... (handleSaveChanges remains the same)
        if (!canEdit) return;
        setIsEditingHours(false); // Use the renamed state variable
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
        if (!newException.start_date) {
            showAlert('Por favor, selecciona al menos la fecha de inicio.');
            return;
        }
        // Ensure end_date is not before start_date if both are set
        if (newException.end_date && newException.end_date < newException.start_date) {
            showAlert('La fecha de fin no puede ser anterior a la fecha de inicio.');
            return;
        }

        try {
            // Prepare data, setting end_date to null if empty
            const dataToInsert = {
                ...newException,
                end_date: newException.end_date || null, // Handle empty end_date
                 // Ensure times are null if closed
                open_time: newException.is_closed ? null : newException.open_time || null,
                close_time: newException.is_closed ? null : newException.close_time || null,
            };

            // Basic overlap check (can be improved or rely on DB constraint)
            const overlaps = exceptions.some(ex => {
                 const existingEndDate = ex.end_date || ex.start_date;
                 const newEndDate = dataToInsert.end_date || dataToInsert.start_date;
                 // Check if new range overlaps existing range
                 return dataToInsert.start_date <= existingEndDate && newEndDate >= ex.start_date;
            });

            if (overlaps) {
                showAlert('El período de excepción se superpone con uno existente. Por favor, ajústalo.');
                return;
            }


            const { error } = await supabase.from('business_exceptions').insert(dataToInsert);
            if (error) throw error;

            showAlert('Período de excepción añadido correctamente.');
            // Reset form
            setNewException({
                start_date: '', end_date: '', is_closed: true,
                open_time: '', close_time: '', reason: ''
            });
            fetchData(); // Refresh list
        } catch(error) {
            showAlert(`Error al añadir la excepción: ${error.message}`);
        }
    };

    const handleDeleteException = async (exceptionId) => {
        // ... (handleDeleteException remains the same, check permission)
        if (!canDelete) return;
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

    // Helper function to format date display
    const formatExceptionDate = (ex) => {
        const startDate = new Date(ex.start_date + 'T00:00:00'); // Adjust for timezone if needed
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        if (ex.end_date && ex.end_date !== ex.start_date) {
            const endDate = new Date(ex.end_date + 'T00:00:00');
            return `${startDate.toLocaleDateString('es-MX', options)} - ${endDate.toLocaleDateString('es-MX', options)}`;
        }
        return startDate.toLocaleDateString('es-MX', options);
    };

    if (loading) return <LoadingSpinner />;

    return (
        <div className={styles.container}>
            <h1>Gestión de Horarios</h1>

            {/* --- Horario Semanal Card --- */}
            <div className={styles.card}>
                <h2>Horario Semanal Regular</h2>
                {isEditingHours ? ( // Use renamed state variable
                    <p>Modifica los horarios y haz clic en "Guardar Cambios".</p>
                ) : (
                    <p>Estos son los horarios de apertura y cierre para cada día de la semana.</p>
                )}

                <div className={styles.hoursGrid}>
                    {hours.map(day => (
                        <div key={day.day_of_week} className={`${styles.dayRow} ${day.is_closed ? styles.closed : ''}`}>
                            <strong>{weekDays.find(d => d.id === day.day_of_week)?.name}</strong>
                            {isEditingHours && canEdit ? ( // Check permission here too
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
                                <span>{day.is_closed ? 'Cerrado' : `${day.open_time || 'N/A'} - ${day.close_time || 'N/A'}`}</span>
                            )}
                        </div>
                    ))}
                </div>

                {canEdit && (
                    isEditingHours ? (
                        <div className={styles.actions}>
                            <button onClick={() => { setIsEditingHours(false); fetchData(); }} className={styles.cancelButton}>Cancelar</button>
                            <button onClick={handleSaveChanges} className={styles.saveButton}>Guardar Cambios</button>
                        </div>
                    ) : (
                        <div className={styles.actions}>
                            <button onClick={() => setIsEditingHours(true)} className={styles.editButton}>Editar Horarios</button>
                        </div>
                    )
                )}
            </div>

            {/* --- Excepciones Card --- */}
            <div className={styles.card}>
                <h2>Excepciones (Feriados, Vacaciones, etc.)</h2>
                {canEdit && (
                    <div className={styles.exceptionForm}>
                         {/* Form Group for Start Date */}
                        <div className={styles.formGroup}>
                            <label>Fecha de Inicio</label>
                            <input type="date" value={newException.start_date} onChange={e => setNewException({...newException, start_date: e.target.value})} />
                        </div>
                         {/* Form Group for End Date */}
                         <div className={styles.formGroup}>
                            <label>Fecha de Fin (Opcional)</label>
                            <input type="date" value={newException.end_date} onChange={e => setNewException({...newException, end_date: e.target.value})} min={newException.start_date} />
                        </div>
                        {/* Form Group for Reason */}
                        <div className={styles.formGroup}>
                            <label>Motivo (Opcional)</label>
                            <input type="text" placeholder="Ej. Semana Santa" value={newException.reason} onChange={e => setNewException({...newException, reason: e.target.value})} />
                        </div>
                        {/* Add Button */}
                        <button onClick={handleAddException} className={styles.addButton}>Añadir</button>
                    </div>
                )}

                 {/* Table for Existing Exceptions */}
                 <div className="table-wrapper">
                    <table className="products-table"> {/* Reuse existing table styles */}
                        <thead>
                            <tr>
                                <th>Período</th>
                                <th>Estado</th>
                                <th>Motivo</th>
                                {canDelete && <th>Acciones</th>} {/* Show only if can delete */}
                            </tr>
                        </thead>
                        <tbody>
                            {exceptions.length === 0 ? (
                                <tr><td colSpan={canDelete ? 4 : 3}>No hay excepciones definidas.</td></tr>
                            ) : (
                                exceptions.map(ex => (
                                    <tr key={ex.id}>
                                        <td>{formatExceptionDate(ex)}</td>
                                        {/* Display 'Cerrado' or the specific hours */}
                                        <td>{ex.is_closed ? 'Cerrado' : `${ex.open_time || 'N/A'} - ${ex.close_time || 'N/A'}`}</td>
                                        <td>{ex.reason || '-'}</td>
                                        {canDelete && (
                                            <td>
                                                <button onClick={() => handleDeleteException(ex.id)} className={styles.deleteButton}>Eliminar</button>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                 </div>
            </div>
        </div>
    );
}