import { Context, Hono } from "hono";
import { logger } from "hono/logger";
import { sendAnalytics } from "./analytics";

type Env = {
  DOMAIN_PROD: string;
  DOMAIN_DEV: string;
  PLAUSIBLE_DOMAIN_PROD: string;
  PLAUSIBLE_DOMAIN_DEV: string;
  FALLBACK_REDIRECT: string;
  // Cloudflare Access credentials
  DEV_CLIENT_ID: string;
  DEV_CLIENT_SECRET: string;
};

type Variables = {
  // Add any custom variables here
};

type RedirectResponse = {
  slug: string;
  destination: string;
} | {
  error: string;
  slug?: string;
};

const app = new Hono<{ Bindings: Env, Variables: Variables }>();

// Add logger middleware
app.use("*", logger());

// Helper function to determine if we're in dev or prod
function isDev(c: Context): boolean {
  // Get the request hostname
  const hostname = new URL(c.req.url).hostname;
  
  // Check if the hostname starts with 'dev.'
  return hostname.startsWith('dev.');
}

// Helper function to get the appropriate API base
function getApiBase(c: Context): string {
  const domain = isDev(c) ? c.env.DOMAIN_DEV : c.env.DOMAIN_PROD;
  console.log(`Environment: ${isDev(c) ? 'dev' : 'prod'}, Using domain: ${domain}`);
  // Ensure the base doesn't have a trailing slash
  return `https://${domain.replace(/\/$/, '')}`;
}

// Helper function to get the appropriate API endpoint with proper trailing slash
function getApiEndpoint(c: Context, type: 'internal' | 'external', slug: string): string {
  // Try both with and without trailing slash
  return `${getApiBase(c)}/api/keiko/${type}/${slug}/`;
}

// Helper function to get the appropriate Plausible domain
function getPlausibleDomain(c: Context): string {
  return isDev(c) ? c.env.PLAUSIBLE_DOMAIN_DEV : c.env.PLAUSIBLE_DOMAIN_PROD;
}

// Helper function to get appropriate TTL
function getTTL(c: Context): number {
  return isDev(c) 
    ? 86400 // 1 day for dev
    : 2592000; // 30 days for prod
}

// Updated Helper function to handle API response errors with Cloudflare Access authentication
async function tryFetchWithFallback(
  c: Context,
  apiUrl: string, 
  fallbackUrl?: string
): Promise<[Response | null, Error | null]> {
  try {
    console.log(`Trying URL: ${apiUrl}`);
    
    // Prepare headers with Cloudflare Access service tokens
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    
    // Add Cloudflare Access authentication headers only when connecting to dev.pfr.wtf
    const url = new URL(apiUrl);
    if (url.hostname === 'dev.pfr.wtf') {
      const clientId = c.env.DEV_CLIENT_ID;
      const clientSecret = c.env.DEV_CLIENT_SECRET;
      
      if (clientId && clientSecret) {
        console.log('Adding Cloudflare Access credentials for dev.pfr.wtf');
        headers['CF-Access-Client-Id'] = clientId;
        headers['CF-Access-Client-Secret'] = clientSecret;
      } else {
        console.warn('Cloudflare Access credentials not found in environment variables');
      }
    }
    
    const response = await fetch(apiUrl, { headers });
    
    // Check if we got a valid response
    if (response.ok) {
      const contentType = response.headers.get('content-type');
      
      // Check if the response is JSON
      if (contentType && contentType.includes('application/json')) {
        return [response, null];
      }
      
      // If we got HTML or other content, it's probably a 404 page or Cloudflare Access login page
      console.error(`Expected JSON but got ${contentType || 'unknown content type'}`);
      
      // Try fallback URL if provided
      if (fallbackUrl) {
        console.log(`Trying fallback URL: ${fallbackUrl}`);
        return await tryFetchWithFallback(c, fallbackUrl);
      }
      
      return [null, new Error(`Expected JSON response but got ${contentType || 'unknown content type'}`)];
    }
    
    // Try fallback URL if provided
    if (fallbackUrl) {
      console.log(`Response not OK (${response.status}), trying fallback URL: ${fallbackUrl}`);
      return await tryFetchWithFallback(c, fallbackUrl);
    }
    
    return [null, new Error(`API returned status ${response.status}`)];
  } catch (error) {
    // Try fallback URL if provided
    if (fallbackUrl) {
      console.log(`Fetch error, trying fallback URL: ${fallbackUrl}`);
      return await tryFetchWithFallback(c, fallbackUrl);
    }
    
    return [null, error instanceof Error ? error : new Error(String(error))];
  }
}

// Handle root path
app.get("/", async (c) => {
  return c.redirect(c.env.FALLBACK_REDIRECT, 302);
});

// Handle favicon.ico
app.get("/favicon.ico", async (c) => {
  return c.redirect(`${getApiBase(c)}/favicon.ico`, 302);
});

// Handle external redirects prefixed with "e/"
app.get("/e/:slug", async (c) => {
  const slug = c.req.param("slug");
  
  // Get cache options
  const cacheOptions = {
    cacheName: "keiko-external-cache",
    cacheControl: `public, max-age=${getTTL(c)}`,
  };
  
  try {
    // Try with trailing slash first, then without
    const apiUrlWithSlash = getApiEndpoint(c, 'external', slug);
    const apiUrlWithoutSlash = apiUrlWithSlash.replace(/\/$/, '');
    
    console.log(`Fetching from API: ${apiUrlWithSlash}`);
    
    // Try both URL formats with the updated function that includes CF Access credentials
    const [response, error] = await tryFetchWithFallback(c, apiUrlWithSlash, apiUrlWithoutSlash);
    
    if (error || !response) {
      console.error(`API error:`, error);
      // Send analytics for error
      c.executionCtx.waitUntil(
        sendAnalytics(c, {
          name: "error",
          props: { slug: `e/${slug}`, error: error ? error.message : "No response" }
        })
      );
      return c.redirect(c.env.FALLBACK_REDIRECT, 302);
    }
    
    const data = await response.json() as RedirectResponse;
    
    if ('error' in data) {
      console.error(`Redirect error: ${data.error}`);
      c.executionCtx.waitUntil(
        sendAnalytics(c, {
          name: "error",
          props: { slug: `e/${slug}`, error: data.error }
        })
      );
      return c.redirect(c.env.FALLBACK_REDIRECT, 302);
    }
    
    // Send analytics
    c.executionCtx.waitUntil(
      sendAnalytics(c, {
        name: "redirect",
        props: { slug: `e/${slug}`, destination: data.destination }
      })
    );
    
    // Apply caching headers
    c.header('Cache-Control', cacheOptions.cacheControl);
    
    // Ensure the destination has a trailing slash if it's an internal URL
    let destination = data.destination;
    if (!destination.startsWith('http') && !destination.endsWith('/')) {
      destination = `${destination}/`;
    }
    
    // 302 redirect for external URLs
    return c.redirect(destination, 302);
  } catch (error) {
    console.error(`Error handling external redirect for slug "${slug}":`, error);
    c.executionCtx.waitUntil(
      sendAnalytics(c, {
        name: "error",
        props: { slug: `e/${slug}`, error: error instanceof Error ? error.message : String(error) }
      })
    );
    return c.redirect(c.env.FALLBACK_REDIRECT, 302);
  }
});

// Handle internal redirects (no prefix)
app.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  
  // Get cache options
  const cacheOptions = {
    cacheName: "keiko-internal-cache",
    cacheControl: `public, max-age=${getTTL(c)}`,
  };
  
  try {
    // Try with trailing slash first, then without
    const apiUrlWithSlash = getApiEndpoint(c, 'internal', slug);
    const apiUrlWithoutSlash = apiUrlWithSlash.replace(/\/$/, '');
    
    console.log(`Fetching from API: ${apiUrlWithSlash}`);
    
    // Try both URL formats with the updated function that includes CF Access credentials
    const [response, error] = await tryFetchWithFallback(c, apiUrlWithSlash, apiUrlWithoutSlash);
    
    if (error || !response) {
      console.error(`API error:`, error);
      // Send analytics for error
      c.executionCtx.waitUntil(
        sendAnalytics(c, {
          name: "error",
          props: { slug, error: error ? error.message : "No response" }
        })
      );
      return c.redirect(c.env.FALLBACK_REDIRECT, 302);
    }
    
    const data = await response.json() as RedirectResponse;
    
    if ('error' in data) {
      console.error(`Redirect error: ${data.error}`);
      c.executionCtx.waitUntil(
        sendAnalytics(c, {
          name: "error",
          props: { slug, error: data.error }
        })
      );
      return c.redirect(c.env.FALLBACK_REDIRECT, 302);
    }
    
    // Send analytics
    c.executionCtx.waitUntil(
      sendAnalytics(c, {
        name: "redirect",
        props: { slug, destination: data.destination }
      })
    );
    
    // Apply caching headers
    c.header('Cache-Control', cacheOptions.cacheControl);
    
    // Get the full URL for internal redirects
    let destinationUrl = data.destination;
    
    // Handle absolute URLs
    if (!destinationUrl.startsWith('http')) {
      // Ensure the path starts with a slash
      if (!destinationUrl.startsWith('/')) {
        destinationUrl = `/${destinationUrl}`;
      }
      
      // Ensure the path ends with a slash
      if (!destinationUrl.endsWith('/')) {
        destinationUrl = `${destinationUrl}/`;
      }
      
      // Prepend the domain
      destinationUrl = `${getApiBase(c)}${destinationUrl}`;
    }
    
    // 301 redirect for internal URLs
    return c.redirect(destinationUrl, 301);
  } catch (error) {
    console.error(`Error handling internal redirect for slug "${slug}":`, error);
    c.executionCtx.waitUntil(
      sendAnalytics(c, {
        name: "error",
        props: { slug, error: error instanceof Error ? error.message : String(error) }
      })
    );
    return c.redirect(c.env.FALLBACK_REDIRECT, 302);
  }
});

export default app;