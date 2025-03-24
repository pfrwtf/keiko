// analytics.ts
import { Context } from "hono";

type AnalyticsEvent = {
  name: string;
  props?: Record<string, string>;
};

export async function sendAnalytics(c: Context, event: AnalyticsEvent): Promise<void> {
  try {
    // Determine if we're in dev or prod
    const isDev = c.req.url.includes(c.env.DOMAIN_DEV);
    const plausibleDomain = isDev ? c.env.PLAUSIBLE_DOMAIN_DEV : c.env.PLAUSIBLE_DOMAIN_PROD;
    
    // If no plausible domain is set, skip analytics
    if (!plausibleDomain) {
      console.log('No Plausible domain configured, skipping analytics');
      return;
    }
    
    const domain = new URL(c.req.url).hostname;
    
    // Prepare the event data
    const eventData = {
      domain: domain,
      name: event.name,
      url: c.req.url,
      referrer: c.req.headers.get("referer") || "direct",
      props: event.props || {}
    };
    
    console.log(`Sending analytics event: ${event.name}`, eventData);
    
    // Send the event to Plausible
    const response = await fetch("https://plausible.io/api/event", {
      method: "POST",
      headers: {
        "User-Agent": c.req.headers.get("user-agent") || "Keiko/1.0",
        "X-Forwarded-For": c.req.headers.get("cf-connecting-ip") || c.req.headers.get("x-real-ip") || "unknown",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(eventData)
    });
    
    if (!response.ok) {
      console.error(`Failed to send analytics: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error("Error sending analytics:", error);
  }
}