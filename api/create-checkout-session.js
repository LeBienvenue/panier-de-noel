import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uopyugjckbwvsxqurhwg.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { items } = req.body;

    // 1. Fetch current product statuses from Supabase
    const { data: dbProducts, error: dbError } = await supabase
      .from('products')
      .select('id, name, status, stock');

    if (dbError) {
      console.error('Supabase fetch error:', dbError);
    }

    // Map database settings by ID
    const prodStatusMap = {};
    (dbProducts || []).forEach(p => {
      prodStatusMap[p.id] = p;
    });

    // 2. Product mapping with prices
    const catalogMap = {
      'panier-g': { name: 'Panier de Noël complet • Grand Format', price: 11000 },
      'panier-p': { name: 'Panier de Noël complet • Petit Format', price: 5500 },
      'foie-g': { name: 'Foie gras de canard', price: 6500 },
      'gravlax-g': { name: 'Gravlax de saumon • Grand Format', price: 4500 },
      'gravlax-p': { name: 'Gravlax de saumon • Petit Format', price: 2250 },
      'chutney-g': { name: 'Chutney de figues • Grand Format', price: 600 },
      'chutney-p': { name: 'Chutney de figues • Petit Format', price: 300 },
      'pain-g': { name: 'Pain d’épices • Grand Format', price: 700 },
      'pain-p': { name: 'Pain d’épices • Petit Format', price: 350 }
    };

    // 3. Check if any ordered item is marked "Fermée"
    const line_items = [];
    for (const item of items) {
      const prodInfo = catalogMap[item.id];
      const dbInfo = prodStatusMap[item.id];

      if (!prodInfo) continue;

      // Reject checkout if item is closed in back-office
      if (dbInfo && dbInfo.status === 'Fermée') {
        return res.status(400).json({
          error: `Désolé, l'article "${prodInfo.name}" n'est plus disponible à la vente.`
        });
      }

      line_items.push({
        price_data: {
          currency: 'eur',
          product_data: { name: prodInfo.name },
          unit_amount: prodInfo.price,
        },
        quantity: item.quantity || 1,
      });
    }

    // 4. Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      allow_promotion_codes: true,
      success_url: `${req.headers.origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/#commander`,
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('Stripe Session Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
