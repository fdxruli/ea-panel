# Pipeline CI/CD de Migraciones Supabase

Este documento describe el flujo seguro implementado para el manejo y despliegue de migraciones a Supabase Production mediante GitHub Actions.

## 1. Funcionamiento del Pipeline

El pipeline consta actualmente de una fase de **Validación** (Pull Requests) y se planea una fase futura de **Despliegue** (en `main`). Todo ocurre remotamente; ya no se requiere tener instalada la CLI de Supabase en Windows local para los despliegues.

### Qué ocurre en Pull Request (PR)
Cuando se crea o actualiza un PR hacia la rama `main` que modifica archivos en `supabase/migrations/`:
1. GitHub Actions arranca un runner con `ubuntu-latest`.
2. Se instala la versión fijada de Supabase CLI (`supabase/setup-cli`).
3. Se ejecuta `supabase start`. Esto levanta una base de datos local y aplica todas las migraciones desde cero, validando su sintaxis, orden y consistencia.
4. Si las migraciones fallan, el pipeline se rompe e impide el merge (si el branch protection está activado).

### Qué ocurrirá en `main` (Despliegue) - [No activado aún]
En la segunda fase del proyecto, se añadirá un workflow adicional en `main`:
1. Tras el merge, se instalará la CLI.
2. Se validará el estado actual (ej: `supabase db push --dry-run`).
3. Se aplicarán las migraciones pendientes en el proyecto productivo usando los secretos configurados, mediante `supabase db push`.
4. Existirán controles de seguridad para no alterar la estructura interna de Supabase si hay discrepancias.

## 2. Versión de Supabase CLI utilizada por CI

Actualmente el pipeline está fijado a la versión de Supabase CLI **`1.223.10`**.
Esta versión se mantiene fija deliberadamente para tener builds reproducibles y evitar que un cambio mayor en las herramientas rompa el pipeline sin previo aviso. La actualización de la versión del CLI deberá hacerse mediante una modificación controlada del workflow de CI.

## 3. Secretos requeridos en GitHub
Para la etapa de validación no se requiere conectar al proyecto de producción (se prueba en local). Sin embargo, para el futuro despliegue se deberán configurar los siguientes **GitHub Actions Secrets** (nunca incluirlos en el código ni variables locales):
- `SUPABASE_ACCESS_TOKEN`: Token personal de la cuenta con acceso al proyecto en Supabase.
- `SUPABASE_PROJECT_ID`: El ref del proyecto de producción (`xvstqhvooabljhhfmuas`).
- `SUPABASE_DB_PASSWORD`: (Dependiendo de la configuración de red y si se hace push a una DB remota directa, aunque CLI 1.x con auth OAuth a veces solo requiere el Access Token. Consultar la doc actual antes de crear el deploy).

## 4. Prácticas Seguras (Qué NO debe hacerse)
- **Desde Windows**: NO ejecutar comandos destructivos como `supabase db reset --linked`. NO intentar hacer deploys manuales, la idea es que GH Actions centralice esto.
- **Historial `schema_migrations`**: Se detectó que el historial de producción tiene inconsistencias en la columna `statements`. **NUNCA** ejecutar `supabase migration repair` o intentar arreglar esta tabla con scripts manuales. El CLI de Supabase se basará únicamente en las versiones locales frente a remotas de manera oficial.

## 5. Flujo de Trabajo (Workflow)

### Cómo crear una nueva migración
1. En tu rama de trabajo, genera la migración usando el CLI oficial: `supabase migration new <nombre_descriptivo>`. Esto creará automáticamente el archivo con el timestamp correcto en `supabase/migrations/`.
2. Añade el código SQL correspondiente a la nueva migración.
3. Confirma el archivo localmente (`git add` y `git commit`).

### Ciclo de Vida de la Migración
El flujo esperado para cualquier cambio en la base de datos es:
1. Crear migration local (`supabase migration new`)
2. Crear un Pull Request (PR)
3. Ejecución automática de GitHub Actions
4. Validación exitosa en base de datos de prueba del runner
5. Merge a `main`

### Cómo validar una migración
1. Haz un `git push` de tu rama y abre un Pull Request contra `main`.
2. El workflow `Supabase Migrations Check` se ejecutará automáticamente. Revisa los checks de GitHub.

### Cómo desplegarla de forma controlada
Por el momento, **no hay despliegue automático**. En la próxima fase:
1. Una vez aprobado el PR y pasada la validación, haz Merge a `main`.
2. El workflow de despliegue se encargará de ejecutar el push de la migración a producción, siempre y cuando no haya riesgo de desalineación.

### Cómo actuar ante una migración desalineada
Si el historial en producción no coincide con el repositorio (por ejemplo, si se aplicaron cambios manualmente):
- No manipules `schema_migrations`.
- Analiza la diferencia usando el dashboard de Supabase y contacta al administrador del sistema o documenta el estado antes de forzar un deploy.
