const fs = require('fs');
const path = require('path');

const candidatesDir = 'C:/dev/ea-panel/scratch/baseline_objects_candidates';
const testDir = 'C:/dev/ea-panel/scratch/baseline_test';

if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
}

// Read pieces
let types = fs.readFileSync(path.join(candidatesDir, 'types.sql'), 'utf-8');
let functions = fs.readFileSync(path.join(candidatesDir, 'functions.sql'), 'utf-8');
let triggers = fs.readFileSync(path.join(candidatesDir, 'triggers.sql'), 'utf-8');

// Read current baseline tables (skip the enums at the top)
let currentBaseline = fs.readFileSync('C:/dev/ea-panel/supabase/migrations/20260101000000_baseline.sql', 'utf-8');
let tableLines = currentBaseline.split('\n');
let filteredTables = tableLines.filter(line => !line.startsWith('CREATE TYPE public.admin_role') && 
                                               !line.startsWith('CREATE TYPE public.discount_type') && 
                                               !line.startsWith('CREATE TYPE public.order_status')).join('\n');

// Combine
let finalBaseline = `
-- 1. TYPES
${types}

-- 2. TABLES & CONSTRAINTS
${filteredTables}

-- 3. FUNCTIONS
${functions}

-- 4. TRIGGERS
${triggers}
`;

fs.writeFileSync(path.join(testDir, 'baseline_test_candidate.sql'), finalBaseline);
console.log('baseline_test_candidate.sql created successfully!');
