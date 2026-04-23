-- =====================================================
-- FUNCIÓN ROBUSTA: get_business_status
-- Resuelve superposiciones, cruce de medianoche y proyecciones
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_business_status()
RETURNS json
LANGUAGE plpgsql
-- Usamos INVOKER para que respete las políticas RLS que definiste
SECURITY INVOKER
AS $function$
DECLARE
    v_timezone TEXT := 'America/Mexico_City';
    v_current_timestamp TIMESTAMP := NOW() AT TIME ZONE v_timezone;
    v_current_date DATE := v_current_timestamp::DATE;
    v_current_time TIME := v_current_timestamp::TIME;
    v_current_dow INT := EXTRACT(DOW FROM v_current_date);

    -- Variables de estado actual
    v_is_open_now BOOLEAN := FALSE;
    v_closing_time_today TIME;
    v_status_message TEXT := '';

    -- Variables para consultas
    v_today_exception RECORD;
    v_today_regular RECORD;
    v_yesterday_regular RECORD;

    -- Variables para proyección futura
    v_check_date DATE;
    v_check_dow INT;
    v_future_exception RECORD;
    v_future_regular RECORD;
    v_days_diff INT;
    v_day_name TEXT;
BEGIN

    -- =====================================================
    -- FASE 1: ¿ESTAMOS ABIERTOS EN ESTE EXACTO MOMENTO?
    -- =====================================================

    -- 1.1 Buscar excepción para HOY.
    -- ORDER BY asegura determinismo: la excepción más corta (más específica) gana.
    SELECT * INTO v_today_exception
    FROM public.business_exceptions
    WHERE v_current_date BETWEEN start_date AND COALESCE(end_date, start_date)
    ORDER BY (COALESCE(end_date, start_date) - start_date) ASC
    LIMIT 1;

    IF v_today_exception IS NOT NULL THEN
        -- Reglas de la excepción dictan el día
        IF NOT v_today_exception.is_closed THEN
            -- Excepción marca abierto. Manejamos cruce de medianoche en el horario especial.
            IF v_today_exception.open_time < v_today_exception.close_time THEN
                v_is_open_now := v_current_time BETWEEN v_today_exception.open_time AND v_today_exception.close_time;
            ELSE
                v_is_open_now := v_current_time >= v_today_exception.open_time OR v_current_time <= v_today_exception.close_time;
            END IF;
            IF v_is_open_now THEN
                v_closing_time_today := v_today_exception.close_time;
                v_status_message := 'Horario especial: Abierto hasta las ' || to_char(v_closing_time_today, 'HH12:MI AM');
                RETURN json_build_object('is_open', TRUE, 'message', v_status_message);
            END IF;
        END IF;
    ELSE
        -- 1.2 No hay excepción. Evaluamos el horario regular de HOY y AYER (por turnos nocturnos)
        SELECT * INTO v_today_regular FROM public.business_hours WHERE day_of_week = v_current_dow;
        SELECT * INTO v_yesterday_regular FROM public.business_hours WHERE day_of_week = (v_current_dow + 6) % 7;

        -- ¿Estamos dentro del turno de HOY?
        IF v_today_regular IS NOT NULL AND NOT v_today_regular.is_closed THEN
            IF v_today_regular.open_time < v_today_regular.close_time THEN
                -- Horario normal (ej. 09:00 a 18:00)
                IF v_current_time BETWEEN v_today_regular.open_time AND v_today_regular.close_time THEN
                    v_is_open_now := TRUE;
                    v_closing_time_today := v_today_regular.close_time;
                END IF;
            ELSE
                -- Horario cruza medianoche (ej. 20:00 a 03:00). Si es mayor a open_time, estamos en el inicio del turno.
                IF v_current_time >= v_today_regular.open_time THEN
                    v_is_open_now := TRUE;
                    v_closing_time_today := v_today_regular.close_time;
                END IF;
            END IF;
        END IF;

        -- ¿Estamos dentro del turno de AYER que cruzó la medianoche hacia hoy?
        IF NOT v_is_open_now AND v_yesterday_regular IS NOT NULL AND NOT v_yesterday_regular.is_closed THEN
            IF v_yesterday_regular.open_time > v_yesterday_regular.close_time THEN
                -- El turno de ayer terminaba hoy en la madrugada
                IF v_current_time <= v_yesterday_regular.close_time THEN
                    v_is_open_now := TRUE;
                    v_closing_time_today := v_yesterday_regular.close_time;
                END IF;
            END IF;
        END IF;

        IF v_is_open_now THEN
            v_status_message := 'Abierto ahora | Cierra a las ' || to_char(v_closing_time_today, 'HH12:MI AM');
            RETURN json_build_object('is_open', TRUE, 'message', v_status_message);
        END IF;
    END IF;

    -- =====================================================
    -- FASE 2: ESTÁ CERRADO. PROYECTAR EL PRÓXIMO DÍA ABIERTO.
    -- Buscamos hasta 14 días en el futuro para cruzar excepciones y regulares.
    -- =====================================================

    FOR i IN 0..14 LOOP
        v_check_date := v_current_date + i;
        v_check_dow := EXTRACT(DOW FROM v_check_date);

        -- Buscar excepción para el día proyectado
        SELECT * INTO v_future_exception
        FROM public.business_exceptions
        WHERE v_check_date BETWEEN start_date AND COALESCE(end_date, start_date)
        ORDER BY (COALESCE(end_date, start_date) - start_date) ASC
        LIMIT 1;

        IF v_future_exception IS NOT NULL THEN
            IF NOT v_future_exception.is_closed THEN
                -- Es un día con horario especial abierto.
                -- Si es hoy (i=0), solo es válido si la hora de apertura aún no ha pasado.
                IF i = 0 AND v_current_time >= v_future_exception.close_time THEN
                    CONTINUE; -- Ya cerró por hoy, pasar al siguiente día
                ELSIF i = 0 AND v_current_time < v_future_exception.open_time THEN
                    v_status_message := 'Abrimos hoy a las ' || to_char(v_future_exception.open_time, 'HH12:MI AM') || ' (Horario Especial)';
                    RETURN json_build_object('is_open', FALSE, 'message', v_status_message);
                ELSIF i > 0 THEN
                    -- Es un día futuro
                    v_days_diff := i;
                    v_day_name := CASE v_check_dow WHEN 0 THEN 'Domingo' WHEN 1 THEN 'Lunes' WHEN 2 THEN 'Martes' WHEN 3 THEN 'Miércoles' WHEN 4 THEN 'Jueves' WHEN 5 THEN 'Viernes' WHEN 6 THEN 'Sábado' END;
                    v_status_message := 'Abrimos ' || (CASE WHEN v_days_diff = 1 THEN 'mañana' WHEN v_days_diff = 2 THEN 'pasado mañana' ELSE 'el ' || v_day_name END) || ' a las ' || to_char(v_future_exception.open_time, 'HH12:MI AM');
                    RETURN json_build_object('is_open', FALSE, 'message', v_status_message);
                END IF;
            END IF;
            -- Si future_exception.is_closed es TRUE, el loop simplemente avanza al siguiente día. Ignoramos el business_hours.
        ELSE
            -- No hay excepción para este día proyectado. Consultamos el horario regular.
            SELECT * INTO v_future_regular FROM public.business_hours WHERE day_of_week = v_check_dow;

            IF v_future_regular IS NOT NULL AND NOT v_future_regular.is_closed THEN
                IF i = 0 AND v_current_time >= v_future_regular.close_time AND v_future_regular.open_time < v_future_regular.close_time THEN
                    CONTINUE; -- Ya cerró por hoy de forma regular.
                ELSIF i = 0 AND v_current_time < v_future_regular.open_time THEN
                    v_status_message := 'Cerrado ahora | Abrimos hoy a las ' || to_char(v_future_regular.open_time, 'HH12:MI AM');
                    RETURN json_build_object('is_open', FALSE, 'message', v_status_message);
                ELSIF i > 0 THEN
                    v_days_diff := i;
                    v_day_name := CASE v_check_dow WHEN 0 THEN 'Domingo' WHEN 1 THEN 'Lunes' WHEN 2 THEN 'Martes' WHEN 3 THEN 'Miércoles' WHEN 4 THEN 'Jueves' WHEN 5 THEN 'Viernes' WHEN 6 THEN 'Sábado' END;
                    v_status_message := 'Cerrado. Abrimos ' || (CASE WHEN v_days_diff = 1 THEN 'mañana' WHEN v_days_diff = 2 THEN 'pasado mañana' ELSE 'el ' || v_day_name END) || ' a las ' || to_char(v_future_regular.open_time, 'HH12:MI AM');
                    RETURN json_build_object('is_open', FALSE, 'message', v_status_message);
                END IF;
            END IF;
        END IF;
    END LOOP;

    -- Si el bucle termina y no encontró apertura en 14 días
    RETURN json_build_object('is_open', FALSE, 'message', 'El negocio está cerrado temporalmente. Consulta próximos horarios.');
END;
$function$;
