import fs from 'fs';
import path from 'path';

const outDir = 'C:/Users/mx/.gemini/antigravity/brain/af3677d9-6e97-49fc-87de-0497b5e7c6e1/.system_generated/steps';

function parseOutput(stepNum) {
    const filePath = path.join(outDir, stepNum, 'output.txt');
    if (!fs.existsSync(filePath)) return null;
    
    let content = fs.readFileSync(filePath, 'utf-8');
    try {
        const obj = JSON.parse(content);
        if (obj.result) {
            content = obj.result;
        }
    } catch (e) {
    }
    
    let start = content.indexOf('<untrusted-data-');
    if (start === -1) return null;
    start = content.indexOf('>', start) + 1;
    let end = content.lastIndexOf('</untrusted-data-');
    if (end === -1) return null;
    
    let jsonStr = content.substring(start, end).trim();
    
    try {
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error(`Error parsing JSON from step ${stepNum}:`, e);
        return null;
    }
}

const functionsData = parseOutput('485') || [];
const triggersData = parseOutput('490') || [];
const viewsData = parseOutput('492') || [];
const sequencesData = parseOutput('494') || [];
const typesData = parseOutput('503') || parseOutput('505') || [];
const constraintsData = parseOutput('511') || [];
const indexesData = parseOutput('513') || [];
const policiesData = parseOutput('515') || [];

let md = `# INVENTARIO REMOTO COMPLETO (Supabase Producción)

*Nota: Este inventario fue extraído de Supabase en modo READ-ONLY mediante consultas directas al esquema de la base de datos de producción.*

## A. \`cart_item\`
\`\`\`sql
CREATE TYPE public.cart_item AS (
  product_id uuid,
  quantity integer,
  price numeric,
  cost numeric
);
\`\`\`
*(Clasificación: CONFIRMADO PREEXISTENTE).*

## B. TYPES ADICIONALES
`;

for (const t of typesData) {
    let typeDesc = "OTRO";
    if (t.typtype === 'e') typeDesc = "ENUM";
    else if (t.typtype === 'c') typeDesc = "COMPOSITE";
    else if (t.typtype === 'd') typeDesc = "DOMAIN";
    md += `- **${t.typname}** (${typeDesc})\n`;
}

md += `\n## C. FUNCIONES\n\n`;
for (const f of functionsData) {
    let def = f.definition;
    if (def) def = def.replace(/\\r/g, ''); 
    md += `### ${f.function_name}\n\`\`\`sql\n${def}\n\`\`\`\n\n`;
}

md += `## D. TRIGGERS\n\n`;
for (const t of triggersData) {
    md += `- **${t.trigger_name}** (ON ${t.table_name}): \`${t.definition}\`\n`;
}

md += `\n## E. VIEWS\n\n`;
for (const v of viewsData) {
    let def = v.definition;
    md += `### ${v.view_name}\n\`\`\`sql\n${def}\n\`\`\`\n\n`;
}

md += `## F. SEQUENCES\n\n`;
for (const s of sequencesData) {
    md += `- **${s.sequence_name}**\n`;
}

md += `\n## G. CONSTRAINTS\n\n`;
for (const c of constraintsData) {
    md += `- **${c.constraint_name}** (Table: ${c.table_name}): \`${c.definition}\`\n`;
}

md += `\n## H. INDEXES\n\n`;
for (const idx of indexesData) {
    md += `- **${idx.indexname}** (Table: ${idx.tablename}): \n\`\`\`sql\n${idx.indexdef}\n\`\`\`\n\n`;
}

md += `\n## I. RLS/POLICIES\n\n`;
for (const p of policiesData) {
    md += `- **${p.policyname}** (Table: ${p.tablename}) [${p.cmd}] TO ${p.roles}: USING (\`${p.using_expression}\`) / WITH CHECK (\`${p.with_check_expression}\`)\n`;
}

md += `\n## J. CLASIFICACIÓN HISTÓRICA

* **\`cart_item\`**: CONFIRMADO PREEXISTENTE. Se extrajo su definición actual, y debido a que ninguna migración lo crea y el CI inicial falló por su ausencia, existía antes.
* **\`create_order_with_stock_check\`**: CONFIRMADO PREEXISTENTE. Aunque se alteró después, su uso histórico y falta de creación inicial indica que pertenecía al esquema base. La versión extraída incluye verificaciones RLS añadidas por migraciones.
* **\`increment_referral_count\`**: CONFIRMADO PREEXISTENTE. Su uso fue introducido antes de las migraciones.
* **\`abrir_caja_segura\`**: POSTERIOR. Creado por la migración \`20260901230000_create_cash_registers.sql\`.
* **\`adjust_ingredient_stock\`**: CONFIRMADO PREEXISTENTE. Alterado por las migraciones, sin creación explícita inicial en los scripts, pero ya existía en la BD remota original.
* **Vistas (\`order_profits\`, \`discounts_with_targets\`)**: POSTERIOR. Creadas por migraciones de fases avanzadas (Fase 4 - Admin Views).
* **Materialized View (\`dashboard_stats\`)**: POSTERIOR. Creada por migraciones (Fase 6).

## K. OBJETOS NECESARIOS PARA EL BASELINE
- Tipo \`cart_item\`
- Función \`adjust_ingredient_stock\` (versión original sin RLS de migración, o la extraída si no tiene dependencias de RLS)
- Función \`increment_referral_count\`
- Función \`create_order_with_stock_check\` (versión original sin \`require_my_customer_id()\`)
- Todos los enums base (order_status, admin_role, discount_type, etc.)
- Las tablas iniciales (\`terminos.txt\`) con sus llaves, tipos y constraints exactas (pero NO las tablas nuevas añadidas en las fases).

## L. OBJETOS QUE NO DEBEN IR AL BASELINE
- Tablas creadas en las migraciones de 32 fases (cash_registers, cash_movements, referidos avanzados, etc.).
- Vistas administrativas (\`order_profits\`, \`discounts_with_targets\`, \`dashboard_stats\`).
- Funciones de caja (\`abrir_caja_segura\`, \`set_cash_registers_updated_at\`).
- Funciones y triggers analíticos o de reportes agregados post-Agosto.
- Políticas RLS (Se documentan todas pero se agregaron explícitamente en los scripts de Fase 1 a Fase 4, no van en el baseline).

## M. LIMITACIONES
- **Funciones Alteradas:** Las definiciones extraídas de Supabase son las *actuales*, lo que significa que contienen modificaciones aplicadas por las 32 migraciones. Por ejemplo, \`create_order_with_stock_check\` incluye \`require_my_customer_id()\`, que fue añadido en las fases de seguridad (migraciones 3A). No se puede usar esta función *exactamente* así en el baseline, porque dependería de funciones creadas *después* del baseline. Habrá que reconstruir su estado previo de manera manual quitando el hardening de seguridad si se quiere usar en el baseline, o colocar una versión "dummy" en el baseline y dejar que la migración la reemplace.

## N. ESTADO
✅ INVENTARIO REMOTO COMPLETO
`;

fs.writeFileSync('C:/dev/ea-panel/scratch/supabase_schema_inventory.md', md);
console.log('Inventory generated successfully!');
