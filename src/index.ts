import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bearerAuth } from 'hono/bearer-auth';
import { Logger } from './utils/logger';
import { renderLandingPage } from './pages/landing';

// Types for our environment bindings
type Bindings = {
  KV: KVNamespace;
  TOKEN: string;
  PLAUSIBLE_DOMAIN?: string;
  LOGGING?: string;
};

// Create Hono app
const app = new Hono<{ Bindings: Bindings }>();

// Generate a random key
function generateKey(): string {
  const logger = Logger.initialize({ LOGGING: app.env?.LOGGING });
  logger.info('generateKey', 'Generating random key');
  
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const key = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(n => chars[n % chars.length])
    .join('');
  
  logger.info('generateKey', 'Generated key', { key });
  return key;
}

// Ensure HTTPS for destination URLs
function ensureHttps(url: string): string {
  const logger = Logger.initialize({ LOGGING: app.env?.LOGGING });
  logger.info('ensureHttps', 'Processing URL', { original: url });
  
  let processedUrl = url;
  if (url.startsWith('http://')) {
    processedUrl = url.replace('http://', 'https://');
    logger.info('ensureHttps', 'Upgraded HTTP to HTTPS', { original: url, processed: processedUrl });
  } else if (!url.startsWith('https://')) {
    processedUrl = `https://${url}`;
    logger.info('ensureHttps', 'Added HTTPS prefix', { original: url, processed: processedUrl });
  }
  
  return processedUrl;
}

// Plausible analytics reporting
async function reportToPlausible(c: any) {
  const logger = Logger.initialize({ LOGGING: c.env?.LOGGING });
  
  if (!c.env.PLAUSIBLE_DOMAIN) {
    logger.info('reportToPlausible', 'Plausible reporting skipped - no domain configured');
    return;
  }

  try {
    logger.info('reportToPlausible', 'Sending event to Plausible', {
      domain: new URL(c.req.url).host,
      url: c.req.url
    });

    await fetch(`https://${c.env.PLAUSIBLE_DOMAIN}/api/event`, {
      method: 'POST',
      headers: {
        'User-Agent': c.req.headers.get('user-agent') || '',
        'X-Forwarded-For': c.req.headers.get('x-real-ip') || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        domain: new URL(c.req.url).host,
        name: 'pageview',
        url: c.req.url,
        referrer: c.req.headers.get('referer') || 'none'
      })
    });
    
    logger.info('reportToPlausible', 'Successfully reported to Plausible');
  } catch (e) {
    logger.error('reportToPlausible', 'Failed to report to Plausible', e);
  }
}

// Initialize logging for middleware
app.use('*', async (c, next) => {
  const logger = Logger.initialize({ LOGGING: c.env?.LOGGING });
  logger.info('request', 'Incoming request', {
    method: c.req.method,
    path: c.req.path,
    headers: Object.fromEntries(c.req.headers)
  });
  await next();
});

// CORS for API endpoints
app.use('/api/*', cors());

// Auth middleware for API endpoints
app.use('/api/*', async (c, next) => {
  const logger = Logger.initialize({ LOGGING: c.env?.LOGGING });
  logger.info('auth', 'Validating authentication');
  
  const auth = bearerAuth({ token: c.env.TOKEN });
  return auth(c, next);
});

// Root route - no key provided
app.get('/', (c) => {
  const logger = Logger.initialize({ LOGGING: c.env?.LOGGING });
  logger.info('root', 'Serving landing page');
  return c.html(renderLandingPage());
});

// Create or update URL
app.put('/api/:key', async (c) => {
  const logger = Logger.initialize({ LOGGING: c.env?.LOGGING });
  const key = c.req.param('key');
  
  logger.info('put', 'Processing PUT request', { key });
  
  // Validate key length
  if (key.length > 32) {
    logger.info('put', 'Key length validation failed', { length: key.length });
    return c.json({ error: 'Key length must not exceed 32 characters' }, 400);
  }

  try {
    // Parse and validate body
    const body = await c.req.json();
    logger.info('put', 'Received request body', { body });
    
    if (!body.url) {
      logger.info('put', 'Missing URL in request');
      return c.json({ error: 'URL is required' }, 400);
    }

    // Ensure HTTPS and store URL
    const url = ensureHttps(body.url);
    logger.info('put', 'Storing URL', { key, url });
    await c.env.KV.put(key, url);
    
    logger.info('put', 'Successfully stored URL', { key, url });
    return c.json({ key, url });
  } catch (e) {
    logger.error('put', 'Error processing request', e);
    return c.json({ error: 'Invalid request body' }, 400);
  }
});

// Create URL with auto-generated key
app.post('/api/new', async (c) => {
  const logger = Logger.initialize({ LOGGING: c.env?.LOGGING });
  logger.info('post', 'Processing POST request');

  try {
    const body = await c.req.json();
    logger.info('post', 'Received request body', { body });

    if (!body.url) {
      logger.info('post', 'Missing URL in request');
      return c.json({ error: 'URL is required' }, 400);
    }

    let key = body.key;
    
    if (key) {
      logger.info('post', 'Custom key provided', { key });
      
      if (key.length > 32) {
        logger.info('post', 'Key length validation failed', { length: key.length });
        return c.json({ error: 'Key length must not exceed 32 characters' }, 400);
      }
      
      const existing = await c.env.KV.get(key);
      if (existing) {
        logger.info('post', 'Key already exists', { key });
        return c.json({ error: 'Key already exists' }, 409);
      }
    } else {
      logger.info('post', 'Generating random key');
      do {
        key = generateKey();
        logger.info('post', 'Checking key availability', { key });
      } while (await c.env.KV.get(key));
    }

    const url = ensureHttps(body.url);
    logger.info('post', 'Storing URL', { key, url });
    await c.env.KV.put(key, url);
    
    logger.info('post', 'Successfully stored URL', { key, url });
    return c.json({ key, url });
  } catch (e) {
    logger.error('post', 'Error processing request', e);
    return c.json({ error: 'Invalid request body' }, 400);
  }
});

// Update existing URL
app.patch('/api/:key', async (c) => {
  const logger = Logger.initialize({ LOGGING: c.env?.LOGGING });
  const key = c.req.param('key');
  
  logger.info('patch', 'Processing PATCH request', { key });
  
  try {
    // Check if key exists
    const existing = await c.env.KV.get(key);
    if (!existing) {
      logger.info('patch', 'Key not found', { key });
      return c.json({ error: 'Key not found' }, 404);
    }

    const body = await c.req.json();
    logger.info('patch', 'Received request body', { body });

    if (!body.url) {
      logger.info('patch', 'Missing URL in request');
      return c.json({ error: 'URL is required' }, 400);
    }

    const url = ensureHttps(body.url);
    logger.info('patch', 'Updating URL', { key, url });
    await c.env.KV.put(key, url);
    
    logger.info('patch', 'Successfully updated URL', { key, url });
    return c.json({ key, url });
  } catch (e) {
    logger.error('patch', 'Error processing request', e);
    return c.json({ error: 'Invalid request body' }, 400);
  }
});

// Delete URL
app.delete('/api/:key', async (c) => {
  const logger = Logger.initialize({ LOGGING: c.env?.LOGGING });
  const key = c.req.param('key');
  
  logger.info('delete', 'Processing DELETE request', { key });
  
  await c.env.KV.delete(key);
  logger.info('delete', 'Successfully deleted key', { key });
  
  return c.json({ message: 'Deleted' });
});

// Redirect for short URLs
app.get('/:key', async (c) => {
  const logger = Logger.initialize({ LOGGING: c.env?.LOGGING });
  const key = c.req.param('key');
  
  logger.info('get', 'Processing GET request', { key });
  
  const url = await c.env.KV.get(key);
  
  if (!url) {
    logger.info('get', 'URL not found', { key });
    return c.text('Short URL not found', 404);
  }

  // Report to Plausible if configured
  if (c.env.PLAUSIBLE_DOMAIN) {
    logger.info('get', 'Initiating Plausible reporting');
    c.executionCtx.waitUntil(reportToPlausible(c));
  }

  logger.info('get', 'Redirecting to URL', { key, url });
  return c.redirect(url);
});

// Handle HEAD requests same as GET
app.head('/:key', async (c) => {
  const logger = Logger.initialize({ LOGGING: c.env?.LOGGING });
  const key = c.req.param('key');
  
  logger.info('head', 'Processing HEAD request', { key });
  
  const url = await c.env.KV.get(key);
  
  if (!url) {
    logger.info('head', 'URL not found', { key });
    return c.text('Short URL not found', 404);
  }

  logger.info('head', 'Redirecting to URL', { key, url });
  return c.redirect(url);
});

export default app;