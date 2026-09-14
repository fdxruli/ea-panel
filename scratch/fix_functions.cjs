const fs = require('fs');
let sql = fs.readFileSync('C:/dev/ea-panel/scratch/baseline_objects_candidates/functions.sql', 'utf-8');
sql = sql.replace(/\$function\$(?!\s*;)/g, '$function$;');
fs.writeFileSync('C:/dev/ea-panel/scratch/baseline_objects_candidates/functions.sql', sql);

let tsql = fs.readFileSync('C:/dev/ea-panel/scratch/baseline_objects_candidates/triggers.sql', 'utf-8');
tsql = tsql.replace(/\$function\$(?!\s*;)/g, '$function$;');
fs.writeFileSync('C:/dev/ea-panel/scratch/baseline_objects_candidates/triggers.sql', tsql);
