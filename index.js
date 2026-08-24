const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();

app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
  }));

  const {
    SHOPIFY_WEBHOOK_SECRET,
      CHATWOOT_BASE_URL,
        CHATWOOT_ACCOUNT_ID,
          CHATWOOT_API_TOKEN,
            PORT = 3000,
            } = process.env;

            function verifyShopifyWebhook(req) {
              const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
                if (!hmacHeader || !SHOPIFY_WEBHOOK_SECRET) return false;
                  const digest = crypto
                      .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
                          .update(req.rawBody)
                              .digest('base64');
                                return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
                                }

                                const chatwoot = axios.create({
                                  baseURL: `${CHATWOOT_BASE_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}`,
                                    headers: { api_access_token: CHATWOOT_API_TOKEN },
                                    });

                                    async function findContact({ phone, email }) {
                                      if (phone) {
                                          const { data } = await chatwoot.get('/contacts/search', { params: { q: phone } });
                                              if (data?.payload?.length) return data.payload[0];
                                                }
                                                  if (email) {
                                                      const { data } = await chatwoot.get('/contacts/search', { params: { q: email } });
                                                          if (data?.payload?.length) return data.payload[0];
                                                            }
                                                              return null;
                                                              }

                                                              async function upsertContactFromCheckout(checkout) {
                                                                const phone = checkout.phone || checkout.shipping_address?.phone || null;
                                                                  const email = checkout.email || null;
                                                                    const name = [checkout.shipping_address?.first_name, checkout.shipping_address?.last_name]
                                                                        .filter(Boolean).join(' ') || email || phone || 'Shopify checkout';

                                                                          const cartValue = checkout.total_price || checkout.subtotal_price || '0.00';
                                                                            const products = (checkout.line_items || [])
                                                                                .map(li => `${li.quantity}x ${li.title}`)
                                                                                    .join(', ');

                                                                                      let contact = await findContact({ phone, email });

                                                                                        const customAttributes = {
                                                                                            cart_value: cartValue,
                                                                                                cart_products: products,
                                                                                                    checkout_url: checkout.abandoned_checkout_url || null,
                                                                                                        lead_stage: 'cart_abandoned',
                                                                                                            last_cart_event_at: new Date().toISOString(),
                                                                                                              };
                                                                                                              
                                                                                                                if (contact) {
                                                                                                                    await chatwoot.put(`/contacts/${contact.id}`, {
                                                                                                                          name,
                                                                                                                                custom_attributes: { ...contact.custom_attributes, ...customAttributes },
                                                                                                                                    });
                                                                                                                                      } else {
                                                                                                                                          const { data } = await chatwoot.post('/contacts', {
                                                                                                                                                name,
                                                                                                                                                      email: email || undefined,
                                                                                                                                                            phone_number: phone || undefined,
                                                                                                                                                                  custom_attributes: customAttributes,
                                                                                                                                                                      });
                                                                                                                                                                          contact = data.payload.contact;
                                                                                                                                                                            }
                                                                                                                                                                            
                                                                                                                                                                              await chatwoot.post(`/contacts/${contact.id}/labels`, {
                                                                                                                                                                                  labels: ['abandoned-cart'],
                                                                                                                                                                                    }).catch(() => {});
                                                                                                                                                                                    
                                                                                                                                                                                      return contact;
                                                                                                                                                                                      }
                                                                                                                                                                                      
                                                                                                                                                                                      app.post('/webhooks/shopify/checkouts', async (req, res) => {
                                                                                                                                                                                        if (!verifyShopifyWebhook(req)) {
                                                                                                                                                                                            return res.status(401).send('Invalid signature');
                                                                                                                                                                                              }
                                                                                                                                                                                                try {
                                                                                                                                                                                                    await upsertContactFromCheckout(req.body);
                                                                                                                                                                                                        res.status(200).send('ok');
                                                                                                                                                                                                          } catch (err) {
                                                                                                                                                                                                              console.error('Failed to sync checkout to Chatwoot:', err.response?.data || err.message);
                                                                                                                                                                                                                  res.status(200).send('logged');
                                                                                                                                                                                                                    }
                                                                                                                                                                                                                    });
                                                                                                                                                                                                                    
                                                                                                                                                                                                                    app.get('/health', (req, res) => res.status(200).send('ok'));
                                                                                                                                                                                                                    
                                                                                                                                                                                                                    app.listen(PORT, () => console.log(`Bridge listening on port ${PORT}`));
                                                                                                                                                                                                                    
