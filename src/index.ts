import { Context, Hono } from "hono";
import { cache } from "hono/cache";
import { logger } from "hono/logger";
import { sendAnalytics } from "./analytics";

type Env = {
  DOMAIN_PROD: string;
  DOMAIN_DEV: string;
  PLAUSIBLE_DOMAIN_PROD: string;
  PLAUSIBLE_DOMAIN_DEV: string;
  FALLBACK_REDIRECT: string;
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
  return c.req.url.includes(c.env.DOMAIN_DEV);
}

// Helper function to get the appropriate API base
function getApiBase(c: Context): string {
  return isDev(c) ? `https://${c.env.DOMAIN_DEV}` : `https://${c.env.DOMAIN_PROD}`;
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
    const apiUrl = `${getApiBase(c)}/api/keiko/external/${slug}`;
    console.log(`Fetching from API: ${apiUrl}`);
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      console.error(`API error: ${response.status} ${response.statusText}`);
      // Send analytics for 404
      if (response.status === 404) {
        c.executionCtx.waitUntil(
          sendAnalytics(c, {
            name: "404",
            props: { slug: `e/${slug}` }
          })
        );
      }
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
    
    // 302 redirect for external URLs
    return c.redirect(data.destination, 302);
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
    const apiUrl = `${getApiBase(c)}/api/keiko/internal/${slug}`;
    console.log(`Fetching from API: ${apiUrl}`);
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      console.error(`API error: ${response.status} ${response.statusText}`);
      // Send analytics for 404
      if (response.status === 404) {
        c.executionCtx.waitUntil(
          sendAnalytics(c, {
            name: "404",
            props: { slug }
          })
        );
      }
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
    const destinationUrl = data.destination.startsWith('http') 
      ? data.destination 
      : `${getApiBase(c)}${data.destination.startsWith('/') ? '' : '/'}${data.destination}`;
    
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