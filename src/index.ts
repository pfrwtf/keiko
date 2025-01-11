import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bearerAuth } from 'hono/bearer-auth';
import { Logger } from './utils/logger';

type Bindings = {
  KV: KVNamespace;
  TOKEN: string;
  PLAUSIBLE_DOMAIN?: string;
  LOGGING?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Basic logging middleware
app.use('*', async (c, next) => {
  console.log('Request received:', c.req.method, c.req.url);
  await next();
});

// CORS for API endpoints
app.use('/api/*', cors());

// Auth middleware for API endpoints
app.use('/api/*', async (c, next) => {
  const auth = bearerAuth({ token: c.env.TOKEN });
  return auth(c, next);
});

// Root route
app.get('/', (c) => {
  return c.text('You gotta give me a short URL, holmes. -Keiko @ PFR');
});

// Create new short URL
app.post('/api/new', async (c) => {
  try {
    const body = await c.req.json();
    
    if (!body?.url) {
      return c.json({ error: 'URL is required' }, 400);
    }

    // Generate random key
    const key = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(n => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[n % 62])
      .join('');

    // Store URL
    await c.env.KV.put(key, body.url.toString());
    
    return c.json({ key, url: body.url });
  } catch (e) {
    console.error('Error in POST /api/new:', e);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get and redirect
app.get('/:key', async (c) => {
  const key = c.req.param('key');
  const url = await c.env.KV.get(key);
  
  if (!url) {
    return c.text('Short URL not found', 404);
  }

  return c.redirect(url);
});

export default app;