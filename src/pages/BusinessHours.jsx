import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
    const [isEditingHours, setIsEditingHours] = useState(false);
    const [newException, setNewException] = useState({
        start_date: '',
        end_date: '',
        is_closed: true,
        open_time: '',
        close_time: '',
        reason: ''
    });

    // Memoizar permisos para evitar re-renders
    const canEdit = useMemo(() => hasPermission('horarios.edit'), [hasPermission]);
    const canDelete = useMemo(() => hasPermission('horarios.delete'), [hasPermission]);

    // OPTIMIZACIÓN 1: Consultas paralelas en lugar de secuenciales
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // Ejecutar ambas consultas en paralelo con Promise.all
            const [hoursResult, exceptionsResult] = await Promise.all([
                supabase
                    .from('business_hours')
                    .select('*')
                    .order('day_of_week', { ascending: true }),
                supabase
                    .from('business_exceptions')
                    .select('*')
                    .order('start_date', { ascending: false })
            ]);

            if (hoursResult.error) throw hoursResult.error;
            if (exceptionsResult.error) throw exceptionsResult.error;

            const fullHours = weekDays.map(day => {
                const dbHour = hoursResult.data.find(h => h.day_of_week === day.id);
                return dbHour || {
                    day_of_week: day.id,
                    open_time: '09:00',
                    close_time: '17:00',
                    is_closed: true
                };
            });

            setHours(fullHours);
            setExceptions(exceptionsResult.data);
        } catch (error) {
            showAlert(`Error al cargar los datos: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }, []); // Removido showAlert de dependencias - no causa cambios en los datos

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // OPTIMIZACIÓN 2: Memoizar función de cambio de hora
    const handleHourChange = useCallback((day, field, value) => {
        setHours(currentHours =>
            currentHours.map(h =>
                h.day_of_week === day ? { ...h, [field]: value } : h
            )
        );
    }, []);

    // OPTIMIZACIÓN 3: Validación de solapamiento memoizada
    const checkOverlap = useCallback((newStart, newEnd, existingExceptions) => {
        return existingExceptions.some(ex => {
            const existingEndDate = ex.end_date || ex.start_date;
            const newEndDate = newEnd || newStart;
            return newStart <= existingEndDate && newEndDate >= ex.start_date;
        });
    }, []);

    const handleSaveChanges = useCallback(async () => {
        if (!canEdit) return;

        setIsEditingHours(false);

        try {
            const { error } = await supabase
                .from('business_hours')
                .upsert(hours, { onConflict: 'day_of_week' });

            if (error) throw error;
            showAlert('Horarios guardados con éxito.');
        } catch (error) {
            showAlert(`Error al guardar los horarios: ${error.message}`);
        }
    }, [canEdit, hours, showAlert]);

    const handleAddException = useCallback(async () => {
        if (!canEdit) return;

        if (!newException.start_date) {
            showAlert('Por favor, selecciona al menos la fecha de inicio.');
            return;
        }

        if (newException.end_date && newException.end_date < newException.start_date) {
            showAlert('La fecha de fin no puede ser anterior a la fecha de inicio.');
            return;
        }

        const dataToInsert = {
            ...newException,
            end_date: newException.end_date || null,
            open_time: newException.is_closed ? null : newException.open_time || null,
            close_time: newException.is_closed ? null : newException.close_time || null,
        };

        // Usar función memoizada para verificar solapamiento
        if (checkOverlap(dataToInsert.start_date, dataToInsert.end_date, exceptions)) {
            showAlert('El período de excepción se superpone con uno existente. Por favor, ajústalo.');
            return;
        }

        try {
            const { error } = await supabase
                .from('business_exceptions')
                .insert(dataToInsert);

            if (error) throw error;

            showAlert('Período de excepción añadido correctamente.');
            setNewException({
                start_date: '',
                end_date: '',
                is_closed: true,
                open_time: '',
                close_time: '',
                reason: ''
            });

            fetchData();
        } catch (error) {
            showAlert(`Error al añadir la excepción: ${error.message}`);
        }
    }, [canEdit, newException, exceptions, checkOverlap, fetchData, showAlert]);

    const handleDeleteException = useCallback(async (exceptionId) => {
        if (!canDelete) return;

        if (window.confirm('¿Estás seguro de que quieres eliminar esta excepción?')) {
            try {
                const { error } = await supabase
                    .from('business_exceptions')
                    .delete()
                    .eq('id', exceptionId);

                if (error) throw error;

                showAlert('Excepción eliminada.');
                fetchData();
            } catch (error) {
                showAlert(`Error al eliminar: ${error.message}`);
            }
        }
    }, [canDelete, fetchData, showAlert]);

    // OPTIMIZACIÓN 4: Memoizar función de formato de fecha
    const formatExceptionDate = useCallback((ex) => {
        const startDate = new Date(ex.start_date + 'T00:00:00');
        const options = { year: 'numeric', month: 'short', day: 'numeric' };

        if (ex.end_date && ex.end_date !== ex.start_date) {
            const endDate = new Date(ex.end_date + 'T00:00:00');
            return `${startDate.toLocaleDateString('es-MX', options)} - ${endDate.toLocaleDateString('es-MX', options)}`;
        }

        return startDate.toLocaleDateString('es-MX', options);
    }, []);

    if (loading) return <LoadingSpinner />;

    return (
        <div className={styles.container}>
            <h1>Horario del Negocio</h1>

            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h2>Horario Regular</h2>
                    {canEdit && (
                        <button
                            onClick={() => setIsEditingHours(!isEditingHours)}
                            className={styles.editButton}
                        >
                            {isEditingHours ? 'Cancelar' : 'Editar'}
                        </button>
                    )}
                </div>

                <p className={styles.description}>
                    {isEditingHours
                        ? 'Modifica los horarios y haz clic en "Guardar Cambios".'
                        : 'Estos son los horarios de apertura y cierre para cada día de la semana.'
                    }
                </p>

                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Día</th>
                            <th>Horario de Apertura</th>
                            <th>Horario de Cierre</th>
                            <th>Cerrado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {hours.map((hour, index) => (
                            <tr key={hour.day_of_week || index}>
                                <td data-label="Día">{weekDays[index].name}</td>
                                <td data-label="Apertura">
                                    {isEditingHours ? (
                                        <input
                                            type="time"
                                            value={hour.open_time}
                                            onChange={(e) => handleHourChange(hour.day_of_week, 'open_time', e.target.value)}
                                            disabled={hour.is_closed}
                                            className={styles.timeInput}
                                        />
                                    ) : (
                                        hour.is_closed ? '-' : hour.open_time
                                    )}
                                </td>
                                <td data-label="Cierre">
                                    {isEditingHours ? (
                                        <input
                                            type="time"
                                            value={hour.close_time}
                                            onChange={(e) => handleHourChange(hour.day_of_week, 'close_time', e.target.value)}
                                            disabled={hour.is_closed}
                                            className={styles.timeInput}
                                        />
                                    ) : (
                                        hour.is_closed ? '-' : hour.close_time
                                    )}
                                </td>
                                <td data-label="Cerrado">
                                    {isEditingHours ? (
                                        <input
                                            type="checkbox"
                                            checked={hour.is_closed}
                                            onChange={(e) => handleHourChange(hour.day_of_week, 'is_closed', e.target.checked)}
                                            className={styles.checkbox}
                                        />
                                    ) : (
                                        hour.is_closed ? 'Sí' : 'No'
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {isEditingHours && (
                    <button onClick={handleSaveChanges} className={styles.saveButton}>
                        Guardar Cambios
                    </button>
                )}
            </section>

            <section className={styles.section}>
                <h2>Excepciones de Horario</h2>

                {canEdit && (
                    <div className={styles.exceptionForm}>
                        <h3>Añadir Excepción</h3>

                        <div className={styles.formGroup}>
                            <label>Fecha de Inicio:</label>
                            <input
                                type="date"
                                value={newException.start_date}
                                onChange={(e) => setNewException({ ...newException, start_date: e.target.value })}
                                className={styles.dateInput}
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label>Fecha de Fin (opcional):</label>
                            <input
                                type="date"
                                value={newException.end_date}
                                onChange={(e) => setNewException({ ...newException, end_date: e.target.value })}
                                className={styles.dateInput}
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    checked={newException.is_closed}
                                    onChange={(e) => setNewException({ ...newException, is_closed: e.target.checked })}
                                    className={styles.checkbox}
                                />
                                Cerrado
                            </label>
                        </div>

                        {/* Campos condicionales con transición suave */}
                        <div className={`${styles.conditionalFields} ${newException.is_closed ? styles.hidden : ''}`}>
                            <div className={styles.formGroup}>
                                <label>Hora de Apertura:</label>
                                <input
                                    type="time"
                                    value={newException.open_time}
                                    onChange={(e) => setNewException({ ...newException, open_time: e.target.value })}
                                    className={styles.timeInput}
                                    disabled={newException.is_closed}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label>Hora de Cierre:</label>
                                <input
                                    type="time"
                                    value={newException.close_time}
                                    onChange={(e) => setNewException({ ...newException, close_time: e.target.value })}
                                    className={styles.timeInput}
                                    disabled={newException.is_closed}
                                />
                            </div>
                        </div>

                        <div className={styles.formGroup}>
                            <label>Motivo:</label>
                            <input
                                type="text"
                                value={newException.reason}
                                onChange={(e) => setNewException({ ...newException, reason: e.target.value })}
                                placeholder="Día festivo, vacaciones, etc."
                                className={styles.textInput}
                            />
                        </div>

                        <button onClick={handleAddException} className={styles.addButton}>
                            Añadir Excepción
                        </button>
                    </div>
                )}

                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Período</th>
                            <th>Estado</th>
                            <th>Motivo</th>
                            {canDelete && <th>Acciones</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {exceptions.length === 0 ? (
                            <tr>
                                <td colSpan={canDelete ? 4 : 3} style={{ textAlign: 'center', padding: '1.5rem' }}>
                                    No hay excepciones definidas.
                                </td>
                            </tr>
                        ) : (
                            exceptions.map((ex) => (
                                <tr key={ex.id}>
                                    <td data-label="Período">{formatExceptionDate(ex)}</td>
                                    <td data-label="Estado">
                                        {ex.is_closed ? 'Cerrado' : `${ex.open_time || 'N/A'} - ${ex.close_time || 'N/A'}`}
                                    </td>
                                    <td data-label="Motivo">{ex.reason || '-'}</td>
                                    {canDelete && (
                                        <td data-label="Acciones">
                                            <button
                                                onClick={() => handleDeleteException(ex.id)}
                                                className={styles.deleteButton}
                                            >
                                                Eliminar
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </section>
        </div>
    );
}
