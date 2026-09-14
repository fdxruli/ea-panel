import os
import re

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # We want to replace '$function$' with '$function$;' ONLY when it's NOT preceded by 'AS '
    # A simple regex: replace any '$function$' that is not immediately preceded by 'AS '
    # Since 'AS $function$' might have spaces, we can use negative lookbehind, or just regex
    
    fixed = re.sub(r'(?<!AS )\s*\$function\$(?!\s*;)', '\n$function$;', content)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(fixed)

fix_file('C:/dev/ea-panel/scratch/baseline_objects_candidates/functions.sql')
fix_file('C:/dev/ea-panel/scratch/baseline_objects_candidates/triggers.sql')
