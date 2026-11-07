import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Tells the public website which products are closed in the back-office ("Fermée").
// Only the ids are returned, nothing else.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { data, error } = await supabase.from('products').select('id, status');

  if (error) {
    console.error('Availability error:', error);
    return res.status(500).json({ error: 'Availability unavailable' });
  }

  const closed = (data || []).filter(p => p.status === 'Fermée').map(p => p.id);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ closed });
}
