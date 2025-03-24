# Keiko URL Redirector

A Cloudflare Worker for the `pfr.fyi` URL shortener service.

## Features

- Redirects short URLs to their destinations
- Handles both internal and external redirects
- Caches responses for performance
- Sends analytics to Plausible
- Supports both production and development environments

## Architecture

The worker serves as a redirector for the `pfr.fyi` domain, with these key features:

1. **API-Based Redirects**: Rather than storing URLs in KV, it queries an API endpoint on your main site.
2. **Dual Environments**: Supports both production (`pfr.fyi`) and development (`dev.pfr.fyi`) domains.
3. **Analytics**: Tracks redirects, 404s, and errors with Plausible.
4. **Caching**: Caches API responses to improve performance and reduce load.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DOMAIN_PROD` | Production domain (e.g., `yourmainsite.com`) |
| `DOMAIN_DEV` | Development domain (e.g., `dev.yourmainsite.com`) |
| `PLAUSIBLE_DOMAIN_PROD` | Plausible domain for production |
| `PLAUSIBLE_DOMAIN_DEV` | Plausible domain for development |
| `FALLBACK_REDIRECT` | Where to redirect on 404 or error |

## URL Format

- Internal redirects: `pfr.fyi/{slug}`
- External redirects: `pfr.fyi/e/{slug}`

## API Endpoints

The worker expects these API endpoints on your main site:

- `/api/keiko/internal/{slug}` - For internal redirects
- `/api/keiko/external/{slug}` - For external redirects

Each endpoint should return a JSON response with either:
```json
{
  "slug": "example",
  "destination": "/path/to/destination"
}
```

Or for errors:
```json
{
  "error": "Redirect not found",
  "slug": "example"
}
```

## Deployment

```bash
# Deploy to production
npm run deploy

# Deploy to development
npm run deploy:dev
```

## Local Development

```bash
npm run dev
```