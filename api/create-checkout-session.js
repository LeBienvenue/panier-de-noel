import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
    (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Prices are in cents (11000 = 110,00 €). Keep the names identical to the ones in webhook.js.
const catalogMap = {
    'panier-g': { name: 'Panier de Noël complet • Grand Format', price: 11000 },
    'panier-p': { name: 'Panier de Noël complet • Petit Format', price: 5500 },
    'foie-g': { name: 'Foie gras de canard • Grand Format', price: 6500 },
    'gravlax-g': { name: 'Gravlax de saumon • Grand Format', price: 4500 },
    'gravlax-p': { name: 'Gravlax de saumon • Petit Format', price: 2250 },
    'chutney-g': { name: 'Chutney de figues • Grand Format', price: 600 },
    'chutney-p': { name: 'Chutney de figues • Petit Format', price: 300 },
    'pain-g': { name: 'Pain d’épices • Grand Format', price: 700 },
    'pain-p': { name: 'Pain d’épices • Petit Format', price: 350 }
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];

        // 1. Clean the basket: known products only, quantity between 1 and 50, duplicates merged
        const wanted = {};
        for (const item of items) {
            if (!item || !Object.prototype.hasOwnProperty.call(catalogMap, item.id)) continue;
            const qty = Math.min(50, Math.max(1, parseInt(item.quantity, 10) || 1));
            wanted[item.id] = Math.min(50, (wanted[item.id] || 0) + qty);
        }
        const ids = Object.keys(wanted);

        if (ids.length === 0) {
            return res.status(400).json({ error: 'Votre panier est vide.' });
        }

        // 2. Fetch current product statuses from Supabase (open / closed)
        const { data: dbProducts, error: dbError } = await supabase
            .from('products')
            .select('id, status');

        if (dbError) {
            console.error('Supabase fetch error:', dbError);
        }

        const statusById = {};
        (dbProducts || []).forEach(p => { statusById[p.id] = p.status; });

        // 3. Build the Stripe lines and refuse closed products
        const line_items = [];
        for (const id of ids) {
            const prodInfo = catalogMap[id];

            if (statusById[id] === 'Fermée') {
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
                quantity: wanted[id],
            });
        }

        // The basket we hand to Stripe so that webhook.js can save it with the order
        const basket = ids.map(id => ({ id, quantity: wanted[id] }));

        const origin = req.headers.origin || `https://${req.headers.host}`;

        // 4. Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items,
            mode: 'payment',
            allow_promotion_codes: true,
            phone_number_collection: {
                enabled: true,
            },
            metadata: {
                items: JSON.stringify(basket),
            },
            success_url: `${origin}/?commande=ok`,
            cancel_url: `${origin}/#commander`,
        });

        return res.status(200).json({ url: session.url });

    } catch (err) {
        console.error('Stripe Session Error:', err);
        return res.status(500).json({ error: 'Impossible de créer le paiement. Merci de réessayer.' });
    }
}
