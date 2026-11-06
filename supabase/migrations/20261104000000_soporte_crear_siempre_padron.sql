-- ==============================================================================
-- MIGRACIÓN: CORRECCIÓN DE IMPORTACIÓN MASIVA EN MODO 'crear_siempre'
-- Fecha: 2026-11-04
-- Descripción:
-- Garantiza que cuando p_modo_duplicados = 'crear_siempre', cada fila del Excel
-- se inserte como un nuevo contribuyente independiente sin colapsar homónimos
-- por coincidencia de nombre o documento.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.importar_padron_masivo(
    p_registros JSONB,
    p_modo_duplicados TEXT DEFAULT 'vincular_tomas'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_org_id UUID;
    v_item JSONB;
    v_toma JSONB;
    v_nombre TEXT;
    v_nombre_norm TEXT;
    v_doc TEXT;
    v_tel TEXT;
    v_dir TEXT;
    v_notas TEXT;
    v_persona_id UUID;
    v_manzana_id UUID;
    v_barrio TEXT;
    v_num_manzana TEXT;
    v_codigo_toma TEXT;
    v_dir_ref TEXT;
    v_tipo_toma tipo_toma;
    v_estado_toma estado_toma;
    v_medidor TEXT;
    v_saldo NUMERIC(10, 2);
    v_max_num INT := 0;
    v_personas_creadas INT := 0;
    v_personas_existentes INT := 0;
    v_personas_omitidas INT := 0;
    v_tomas_creadas INT := 0;
BEGIN
    -- 1. Validar sesión y pertenencia a organización
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Operación denegada: Sesión no autenticada.';
    END IF;

    v_org_id := public.get_auth_org_id();
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Operación denegada: No se encontró una organización activa.';
    END IF;

    IF NOT (
        public.es_admin()
        OR public.tiene_permiso('personas.gestionar')
        OR public.tiene_permiso('tomas.gestionar')
    ) THEN
        RAISE EXCEPTION 'Operación denegada: No tienes permisos para importar datos al padrón.';
    END IF;

    IF p_registros IS NULL OR jsonb_typeof(p_registros) <> 'array' OR jsonb_array_length(p_registros) = 0 THEN
        RAISE EXCEPTION 'No se recibieron registros válidos para importar.';
    END IF;

    -- 2. Obtener el máximo consecutivo numérico actual de TOMA-XXXX en la organización
    SELECT COALESCE(
        MAX(
            NULLIF(regexp_replace(codigo_toma, '^.*?(\d+)$', '\1'), codigo_toma)::INT
        ),
        COUNT(*)::INT
    )
    INTO v_max_num
    FROM public.tomas
    WHERE organizacion_id = v_org_id
      AND codigo_toma ~ '\d+$';

    -- 3. Procesar cada persona del lote
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_registros)
    LOOP
        v_nombre := trim(COALESCE(v_item->>'nombre_completo', ''));
        IF v_nombre = '' THEN
            CONTINUE;
        END IF;

        v_nombre_norm := lower(regexp_replace(v_nombre, '\s+', ' ', 'g'));
        v_doc := NULLIF(trim(COALESCE(v_item->>'documento_identidad', '')), '');
        v_tel := NULLIF(trim(COALESCE(v_item->>'telefono', '')), '');
        v_dir := NULLIF(trim(COALESCE(v_item->>'direccion', '')), '');
        v_notas := NULLIF(trim(COALESCE(v_item->>'notas', '')), '');

        -- Buscar si la persona ya existe en la organización SOLO cuando no es 'crear_siempre'
        v_persona_id := NULL;
        IF p_modo_duplicados <> 'crear_siempre' THEN
            IF v_doc IS NOT NULL THEN
                SELECT id INTO v_persona_id
                FROM public.personas
                WHERE organizacion_id = v_org_id
                  AND deleted_at IS NULL
                  AND upper(trim(documento_identidad)) = upper(v_doc)
                LIMIT 1;
            END IF;

            IF v_persona_id IS NULL AND p_modo_duplicados = 'vincular_tomas' THEN
                SELECT id INTO v_persona_id
                FROM public.personas
                WHERE organizacion_id = v_org_id
                  AND deleted_at IS NULL
                  AND lower(regexp_replace(trim(nombre_completo), '\s+', ' ', 'g')) = v_nombre_norm
                LIMIT 1;
            END IF;
        END IF;

        IF v_persona_id IS NOT NULL THEN
            IF p_modo_duplicados = 'omitir' THEN
                v_personas_omitidas := v_personas_omitidas + 1;
                CONTINUE;
            END IF;

            -- Enriquecer datos faltantes de la persona existente sin sobreescribir los que ya tenía
            UPDATE public.personas
            SET documento_identidad = COALESCE(documento_identidad, v_doc),
                telefono = COALESCE(telefono, v_tel),
                direccion = COALESCE(direccion, v_dir),
                notas = COALESCE(notas, v_notas),
                updated_at = timezone('utc'::text, now())
            WHERE id = v_persona_id AND organizacion_id = v_org_id;

            v_personas_existentes := v_personas_existentes + 1;
        ELSE
            INSERT INTO public.personas (
                organizacion_id,
                nombre_completo,
                documento_identidad,
                telefono,
                direccion,
                notas,
                activo
            ) VALUES (
                v_org_id,
                v_nombre,
                v_doc,
                v_tel,
                v_dir,
                v_notas,
                true
            )
            RETURNING id INTO v_persona_id;

            v_personas_creadas := v_personas_creadas + 1;
        END IF;

        -- 5. Procesar las tomas asociadas a esta persona
        IF v_item ? 'tomas' AND jsonb_typeof(v_item->'tomas') = 'array' THEN
            FOR v_toma IN SELECT * FROM jsonb_array_elements(v_item->'tomas')
            LOOP
                -- Resolver manzana (por ID explícito, por Barrio/Manzana del Excel, o manzana por defecto)
                v_manzana_id := NULL;
                IF NULLIF(trim(COALESCE(v_toma->>'manzana_id', '')), '') IS NOT NULL THEN
                    SELECT id INTO v_manzana_id
                    FROM public.manzanas
                    WHERE id = (v_toma->>'manzana_id')::UUID
                      AND organizacion_id = v_org_id
                      AND deleted_at IS NULL;
                END IF;

                IF v_manzana_id IS NULL THEN
                    v_barrio := NULLIF(trim(COALESCE(v_toma->>'barrio', '')), '');
                    v_num_manzana := COALESCE(NULLIF(trim(COALESCE(v_toma->>'numero_manzana', '')), ''), 'Mz 1');

                    IF v_barrio IS NOT NULL THEN
                        SELECT id INTO v_manzana_id
                        FROM public.manzanas
                        WHERE organizacion_id = v_org_id
                          AND deleted_at IS NULL
                          AND lower(trim(barrio)) = lower(v_barrio)
                          AND lower(trim(numero_manzana)) = lower(v_num_manzana)
                        LIMIT 1;

                        IF v_manzana_id IS NULL THEN
                            INSERT INTO public.manzanas (
                                organizacion_id,
                                barrio,
                                seccion,
                                numero_manzana,
                                activo
                            ) VALUES (
                                v_org_id,
                                v_barrio,
                                'Sección Única',
                                v_num_manzana,
                                true
                            )
                            RETURNING id INTO v_manzana_id;
                        END IF;
                    END IF;
                END IF;

                -- Resolver código de toma
                v_codigo_toma := upper(trim(COALESCE(v_toma->>'codigo_toma', '')));
                IF v_codigo_toma = '' THEN
                    LOOP
                        v_max_num := v_max_num + 1;
                        v_codigo_toma := 'TOMA-' || lpad(v_max_num::TEXT, 4, '0');
                        EXIT WHEN NOT EXISTS (
                            SELECT 1 FROM public.tomas
                            WHERE organizacion_id = v_org_id
                              AND upper(codigo_toma) = v_codigo_toma
                              AND deleted_at IS NULL
                        );
                    END LOOP;
                ELSE
                    -- Si el código explícito ya existe activo en la organización, evitar duplicarlo
                    IF EXISTS (
                        SELECT 1 FROM public.tomas
                        WHERE organizacion_id = v_org_id
                          AND upper(codigo_toma) = v_codigo_toma
                          AND deleted_at IS NULL
                    ) THEN
                        CONTINUE;
                    END IF;
                END IF;

                v_dir_ref := COALESCE(
                    NULLIF(trim(COALESCE(v_toma->>'direccion_referencia', '')), ''),
                    v_dir,
                    'Domicilio registrado en censo comunitario'
                );

                v_tipo_toma := 'domestica'::tipo_toma;
                IF (v_toma->>'tipo_toma') IS NOT NULL AND (v_toma->>'tipo_toma') IN ('domestica', 'comercial', 'industrial', 'institucional') THEN
                    v_tipo_toma := (v_toma->>'tipo_toma')::tipo_toma;
                END IF;

                v_estado_toma := 'activa'::estado_toma;
                IF (v_toma->>'estado') IS NOT NULL AND (v_toma->>'estado') IN ('activa', 'suspendida', 'cortada', 'baja', 'en_proceso') THEN
                    v_estado_toma := (v_toma->>'estado')::estado_toma;
                END IF;

                v_medidor := NULLIF(trim(COALESCE(v_toma->>'numero_medidor', '')), '');
                v_saldo := COALESCE(NULLIF(trim(COALESCE(v_toma->>'saldo_pendiente', '')), '')::NUMERIC, 0.00);

                INSERT INTO public.tomas (
                    organizacion_id,
                    persona_id,
                    manzana_id,
                    codigo_toma,
                    direccion_referencia,
                    tipo_toma,
                    estado,
                    numero_medidor,
                    saldo_pendiente
                ) VALUES (
                    v_org_id,
                    v_persona_id,
                    v_manzana_id,
                    v_codigo_toma,
                    v_dir_ref,
                    v_tipo_toma,
                    v_estado_toma,
                    v_medidor,
                    v_saldo
                );

                v_tomas_creadas := v_tomas_creadas + 1;
            END LOOP;
        END IF;
    END LOOP;

    -- 6. Devolver resumen de la operación
    RETURN jsonb_build_object(
        'personas_creadas', v_personas_creadas,
        'personas_existentes', v_personas_existentes,
        'personas_omitidas', v_personas_omitidas,
        'tomas_creadas', v_tomas_creadas
    );
END;
$$;

REVOKE ALL ON FUNCTION public.importar_padron_masivo(JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.importar_padron_masivo(JSONB, TEXT) TO authenticated;

