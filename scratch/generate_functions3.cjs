const fs = require('fs');
let content = fs.readFileSync('C:/Users/mx/.gemini/antigravity/brain/af3677d9-6e97-49fc-87de-0497b5e7c6e1/.system_generated/steps/608/output.txt', 'utf-8');
let match = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
if (match) {
    let funcs = JSON.parse(match[0]);
    let sql = `-- FUNCIONES CANDIDATAS BASELINE\n\n`;
    for (let f of funcs) {
        let def = f.definition.replace(/\\r/g, '');
        sql += `-- Function: ${f.function_name}\n${def}\n\n`;
    }
    fs.writeFileSync('C:/dev/ea-panel/scratch/baseline_objects_candidates/functions.sql', sql);
    console.log('functions.sql generated!');
} else {
    console.log('No JSON array found');
}
