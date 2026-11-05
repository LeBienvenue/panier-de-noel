// Fonction serverless Vercel : crée UNE session Stripe Checkout pour tout le panier.
// Les prix sont définis ICI (côté serveur) : le navigateur n'envoie que l'identifiant et la quantité.
// Variables d'environnement Vercel :
//   STRIPE_SECRET_KEY  (obligatoire) : clé secrète Stripe (sk_live_... ou sk_test_...)
//   SITE_URL           (facultatif)  : ex. https://paniers-de-noel.vercel.app (sinon déduit de la requête)
const Stripe = require('stripe');

const CATALOG = {
  'panier-g':   { name: 'Panier de Noël complet · grand format', amount: 11000 },
  'panier-p':   { name: 'Panier de Noël complet · petit format', amount: 5500 },
  'foie-g':     { name: 'Foie gras de canard IGP Sud-Ouest Label Rouge · 500 g', amount: 6500 },
  'gravlax-g':  { name: 'Gravlax de saumon Label Rouge · 500 g', amount: 4500 },
  'gravlax-p':  { name: 'Gravlax de saumon Label Rouge · 250 g', amount: 2250 },
  'chutney-g':  { name: 'Chutney de figues · 150 g', amount: 600 },
  'chutney-p':  { name: 'Chutney de figues · 75 g', amount: 300 },
  'pain-g':     { name: 'Pain d’épices du Kervao · 250 g', amount: 700 },
  'pain-p':     { name: 'Pain d’épices du Kervao · 125 g', amount: 350 }
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  try {
    const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
    const line_items = [];
    for (const it of items) {
      const p = CATALOG[it && it.id];
      const quantity = Math.floor(Number(it && it.quantity));
      if (!p || !(quantity >= 1 && quantity <= 50)) continue;
      line_items.push({
        quantity,
        price_data: { currency: 'eur', unit_amount: p.amount, product_data: { name: p.name } }
      });
    }
    if (!line_items.length) return res.status(400).json({ error: 'Panier vide ou invalide' });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const origin = process.env.SITE_URL || `https://${req.headers.host}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      locale: 'fr',
      allow_promotion_codes: true,
      line_items,
      phone_number_collection: { enabled: true },
      billing_address_collection: 'required',
    custom_fields: [
        {
            key: 'customer_name_input',
            label: { type: 'custom', custom: 'Nom et Prénom' },
            type: 'text',
            optional: false
        },
        {
            key: 'customer_notes',
            label: { type: 'custom', custom: 'Notes ou allergies (facultatif)' },
            type: 'text',
            optional: true
        }
    ],
      custom_text: {
        submit: { message: 'Retrait le 23 décembre 2026 de 9h à 18h, Restaurant Le Kervao, 234 avenue de Ty Bos, 29000 Quimper. Merci de présenter votre e-mail de confirmation.' }
      },
      success_url: `${origin}/?commande=ok`,
      cancel_url: `${origin}/#panier`
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur lors de la création du paiement' });
  }
};
