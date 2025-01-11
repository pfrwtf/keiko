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

// Generate random key
function generateKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(n => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[n % 62])
    .join('');
}

// Ensure HTTPS
function ensureHttps(url: string): string {
  if (url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  if (!url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url;
}

// PUBLIC ROUTES

// Root route - no key message
app.get('/', (c) => {
  return c.text('You gotta give me a short URL, holmes. -Keiko @ PFR');
});

// Redirect for valid key
app.get('/:key', async (c) => {
  const key = c.req.param('key');
  const url = await c.env.KV.get(key);
  
  if (!url) {
    return c.text('Not a valid key', 404);
  }

  // Report to Plausible if configured
  if (c.env.PLAUSIBLE_DOMAIN) {
    c.executionCtx.waitUntil(
      fetch(`https://${c.env.PLAUSIBLE_DOMAIN}/api/event`, {
        method: 'POST',
        headers: {
          'User-Agent': c.req.header('user-agent') || '',
          'X-Forwarded-For': c.req.header('x-real-ip') || '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          domain: new URL(c.req.url).host,
          name: 'pageview',
          url: c.req.url,
          referrer: c.req.header('referer') || 'none'
        })
      })
    );
  }

  return c.redirect(url);
});

// PROTECTED API ROUTES

// List all keys and URLs
app.get('/api/all', async (c) => {
  try {
    const list = await c.env.KV.list();
    const urls = await Promise.all(
      list.keys.map(async (key) => ({
        key: key.name,
        url: await c.env.KV.get(key.name)
      }))
    );
    return c.json(urls);
  } catch (e) {
    console.error('Error listing keys:', e);
    return c.json({ error: 'Failed to list URLs' }, 500);
  }
});

// Get specific key info
app.get('/api/:key', async (c) => {
  try {
    const key = c.req.param('key');
    const url = await c.env.KV.get(key);
    
    if (!url) {
      return c.json({ error: 'Key not found' }, 404);
    }

    return c.json({ key, url });
  } catch (e) {
    console.error('Error getting key:', e);
    return c.json({ error: 'Failed to get URL' }, 500);
  }
});

// Create new short URL
app.put('/api/new', async (c) => {
  try {
    const body = await c.req.json();
    
    if (!body?.url) {
      return c.json({ error: 'URL is required' }, 400);
    }

    let key = body.key;
    
    // Validate custom key if provided
    if (key) {
      if (key.length > 32) {
        return c.json({ error: 'Key length must not exceed 32 characters' }, 400);
      }
      const existing = await c.env.KV.get(key);
      if (existing) {
        return c.json({ error: 'Key already exists' }, 409);
      }
    } else {
      // Generate unique key
      do {
        key = generateKey();
      } while (await c.env.KV.get(key));
    }

    const url = ensureHttps(body.url);
    await c.env.KV.put(key, url);
    
    return c.json({ key, url });
  } catch (e) {
    console.error('Error creating URL:', e);
    return c.json({ error: 'Failed to create short URL' }, 500);
  }
});

// Update existing URL
app.patch('/api/:key', async (c) => {
  try {
    const key = c.req.param('key');
    const body = await c.req.json();

    if (!body?.url) {
      return c.json({ error: 'URL is required' }, 400);
    }

    const existing = await c.env.KV.get(key);
    if (!existing) {
      return c.json({ error: 'Key not found' }, 404);
    }

    const url = ensureHttps(body.url);
    await c.env.KV.put(key, url);
    
    return c.json({ key, url });
  } catch (e) {
    console.error('Error updating URL:', e);
    return c.json({ error: 'Failed to update URL' }, 500);
  }
});

// Delete URL
app.delete('/api/:key', async (c) => {
  try {
    const key = c.req.param('key');
    const existing = await c.env.KV.get(key);
    
    if (!existing) {
      return c.json({ error: 'Key not found' }, 404);
    }

    await c.env.KV.delete(key);
    return c.json({ message: 'Deleted' });
  } catch (e) {
    console.error('Error deleting URL:', e);
    return c.json({ error: 'Failed to delete URL' }, 500);
  }
});

export default app;