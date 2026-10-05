// Picks the real Supabase backend when configured, otherwise DEMO mode.
// Add ?demo to the address to force demo mode.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const forceDemo = new URLSearchParams(location.search).has('demo');
const useDemo = forceDemo || !SUPABASE_URL || !SUPABASE_ANON_KEY;

export const api = useDemo ? await import('./api-demo.js') : await import('./api-supabase.js');
