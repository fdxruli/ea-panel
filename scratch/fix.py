with open('supabase/migrations/20260101000000_baseline.sql', 'r') as f:
    lines = f.readlines()
    
with open('supabase/migrations/20260101000000_baseline.sql', 'w') as f:
    in_special_prices = False
    for line in lines:
        if line.startswith('CREATE TABLE public.special_prices'):
            in_special_prices = True
        if in_special_prices and 'CONSTRAINT special_prices_pkey PRIMARY KEY' in line:
            f.write('  target_customer_ids uuid[],\n')
            in_special_prices = False
        f.write(line)
