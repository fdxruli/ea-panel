const fs = require('fs');

let content = fs.readFileSync('C:/Users/mx/.gemini/antigravity/brain/af3677d9-6e97-49fc-87de-0497b5e7c6e1/.system_generated/steps/608/output.txt', 'utf-8');

try {
    const obj = JSON.parse(content);
    if (obj.result) content = obj.result;
} catch (e) {}

let startTag = '<untrusted-data-';
let start = content.indexOf(startTag);
if (start !== -1) {
    let tagEnd = content.indexOf('>', start);
    let id = content.substring(start + startTag.length, tagEnd);
    let endTag = '</untrusted-data-' + id + '>';
    let end = content.indexOf(endTag);
    let jsonStr = content.substring(tagEnd + 1, end).trim();
    
    let funcs = JSON.parse(jsonStr);
    let sql = `-- FUNCIONES CANDIDATAS BASELINE\n\n`;
    for (let f of funcs) {
        let def = f.definition.replace(/\\r/g, '');
        sql += `-- Function: ${f.function_name}\n${def}\n\n`;
    }
    fs.writeFileSync('C:/dev/ea-panel/scratch/baseline_objects_candidates/functions.sql', sql);
    console.log('functions.sql generated!');
}
