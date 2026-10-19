import { createClient } from '@supabase/supabase-js';

const localAuth = process.env.AUTH_MODE === 'local';
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const localAdminError = 'Supabase admin API is not used when AUTH_MODE=local. User administration uses the local database.';

function localSupabaseAdmin(): never {
    throw new Error(localAdminError);
}

// A proxy so accidental calls fail with the local-auth message instead of
// contacting a placeholder Supabase host.
const localAdminStub: any = new Proxy(localSupabaseAdmin, {
    get: () => localAdminStub,
    apply: () => localSupabaseAdmin(),
});

if (localAuth) {
    console.info('AUTH_MODE=local: user administration uses the local database. Supabase is not configured.');
} else if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.warn('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Supabase admin operations will fail.');
}

export const supabaseAdmin = localAuth
    ? localAdminStub
    : createClient(
        supabaseUrl || 'https://placeholder.supabase.co',
        supabaseServiceRoleKey || 'placeholder',
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    );
