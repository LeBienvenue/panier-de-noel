import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Names shown in the back-office. Keep identical to the names in create-checkout-session.js.
const productNames = {
  'panier-g': 'Panier de Noël complet • Grand Format',
  'panier-p': 'Panier de Noël complet • Petit Format',
  'foie-g': 'Foie gras de canard • Grand Format',
  'gravlax-g': 'Gravlax de saumon • Grand Format',
  'gravlax-p': 'Gravlax de saumon • Petit Format',
  'chutney-g': 'Chutney de figues • Grand Format',
  'chutney-p': 'Chutney de figues • Petit Format',
  'pain-g': 'Pain d’épices • Grand Format',
  'pain-p': 'Pain d’épices • Petit Format'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const event = req.body;

  // Listen for completed checkout sessions from Stripe
  if (event && event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // Stripe can send the same event twice: do nothing if this order is already saved
    const { data: existing } = await supabase
      .from('orders')
      .select('id')
      .eq('stripe_session_id', session.id)
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    const customerName = session.customer_details?.name || 'Client';
    const customerEmail = session.customer_details?.email || '';
    const customerPhone = session.customer_details?.phone || '';
    const totalAmount = session.amount_total ? session.amount_total / 100 : 0;
    const notes = session.custom_fields?.find(f => f.key === 'customer_notes')?.text?.value || '';

    // Basket sent by create-checkout-session.js
    let basket = [];
    try {
      basket = JSON.parse(session.metadata?.items || '[]');
    } catch (e) {
      console.error('Could not read basket from metadata:', e);
    }
    const items = basket.map(i => ({
      id: i.id,
      name: productNames[i.id] || i.id,
      quantity: i.quantity
    }));

    const isPaid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';

    const { error: orderError } = await supabase.from('orders').insert([{
      stripe_session_id: session.id,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      total_amount: totalAmount,
      items: items,
      notes: notes,
      status: 'Nouvelle',
      production_status: 'À préparer',
      payment_status: isPaid ? 'Payé' : 'À régler'
    }]);

    if (orderError) {
      console.error('Error recording order:', orderError);
      // Answer with an error so that Stripe tries again later instead of losing the order
      return res.status(500).json({ error: 'Could not record order' });
    }
  }

  return res.status(200).json({ received: true });
}
