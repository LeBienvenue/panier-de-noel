import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const event = req.body;

  // Listen for completed checkout sessions from Stripe
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
const customerName = session.customer_details?.name || 'Client';
    const customerEmail = session.customer_details?.email || '';
    const customerPhone = session.customer_details?.phone || '';
    const totalAmount = session.amount_total ? session.amount_total / 100 : 0;
    const items = JSON.parse(session.metadata?.items || '[]');
    const notes = session.custom_fields?.find(f => f.key === 'customer_notes')?.text?.value || '';

    // 1. Insert the new order into Supabase
    const { error: orderError } = await supabase.from('orders').insert([{
      stripe_session_id: session.id,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      total_amount: totalAmount,
      items: items,
      notes: notes,
      status: 'Nouvelle'
    }]);
    }]);

    if (orderError) {
      console.error('Error recording order:', orderError);
    }

    // 2. Deduct stock and increment reserved counts in Supabase
    for (const item of items) {
      const { data: product } = await supabase
        .from('products')
        .select('reserved')
        .eq('id', item.id)
        .single();

      if (product) {
        const newReserved = (product.reserved || 0) + item.quantity;
        await supabase
          .from('products')
          .update({ reserved: newReserved })
          .eq('id', item.id);
      }
    }
  }

  return res.status(200).json({ received: true });
}
