import { createClient } from '@supabase/supabase-js';
import { createLocalAuthClient } from './localAuthClient';

declare global {
    interface Window {
        __GRC_CONFIG__?: { authMode?: string; appUrl?: string; cookieConsent?: boolean };
    }
}

function useLocalAuth(): boolean {
    if (typeof window !== 'undefined' && window.__GRC_CONFIG__?.authMode === 'local') return true;
    return import.meta.env.VITE_AUTH_MODE === 'local';
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!useLocalAuth() && (!supabaseUrl || !supabaseAnonKey)) {
    console.warn('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables. Authentication will not work.');
}

export const supabase: any = useLocalAuth()
    ? createLocalAuthClient()
    : createClient(
        supabaseUrl || 'https://placeholder-url.supabase.co',
        supabaseAnonKey || 'placeholder-key'
    );
