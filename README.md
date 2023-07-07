## keiko

forked from rinku by @espeon ❤️ https://github.com/espeon/rinku. While there are a number of changes, 90% of the work is hers (and is excellent).

simple link shortener, written in typescript + hono, for cloudflare workers and workers kv.

plausible functionality is removed from this version (pfr's workers proxy for Plausible being released soon).

--

### endpoints
GET `/`
: Redirects to `REDIREC_GEN200` or gives generic response `MESSAGE_GEN200` depending on configuration.

GET `/:key`
: Redirects to the URL value of the key if found and valid.

GET `/api/all`
: Lists all keys in the store in JSON. The expense of this request scales with the size of the kv store, so use with caution.

POST `/api/new`
: Create a new key with new value, which is SHA512 encoded and stored in the kv store.

PATCH `/api/:key`
: Overwrite a value of an existing key

DELETE `/api/:key`
: Deletes the key if it exists. Does not validate existence first.

### write format

Postman is recommended for use with manual updates.

Authorization
: Use authorization and type Bearer Token, and input the same token as specified in wrangler.toml

### changes from rinku

* /favicon.ico has been removed. Recommended instead is a transform rule routed to /favicon.ico to desired path.
* /all is now /api/all, and therefore requires authenication.
* `import { plausible } from "./analytics";` is removed, and analytics.ts is deleted.
* /js/script.js & /api/event for Plausible is removed.
* Console messages added where applicable.

---

### bindings

`id`
: The ID of the Key Value store used in production mode

`preview_id`
: The ID of the Key Value store used in dev mode

### variables

`AUTH_TOKEN`
: A password you can use as a bearer token for any admin function (put, patch, del, get all keys)

### user messages

These messages are for public users interacting with the service. Error messages in the API are hard-coded and often from the interpreter.

#### generic 200: default response (request without key)

`REDIREC_GEN200`
: URL to 302 redirect to if no key is given for redirect

`MESSAGE_GEN200`
: Generic response message if no key is given for redirect. Fallback if `REDIREC_GEN200` empty or not defined.

`CONSOLE_GEN200`
: Message logged by Worker

#### success 301: user redirected

`CONSOLE_SUC301`
: Message logged by Worker

#### Error 400: Malformed Request

`MESSAGE_ERR400`
: Response for malformed requests

`CONSOLE_ERR404`
: Message logged by Worker

#### Error 404: Key doesn't exist in the database

`REDIREC_ERR404`
: If redirect is enabled, the URL the user is 301 redirected

`MESSAGE_ERR404`
: Response to the user for requests where the key is not in the database. Fallback if `REDIREC_ERR404` empty or not defined.

`CONSOLE_ERR404`
: Message logged by Worker

### Notes on Setting Up

Use a Workers Custom Domain, not a Route. Only domains or subdomains are supported for this worker, instead of a subdirectory. Subdirectory support may be added in the future, but it's not a priority.

https://developers.cloudflare.com/workers/platform/triggers/custom-domains/

It is strongly recommended to enforce rate limiting for this worker to prevent DDoS or pricing overruns on the worker. It's doubtful more than 1 request per second per client would be needed, and even more doubtful that a user would need more than 10 redirects in an hour.

https://developers.cloudflare.com/waf/rate-limiting-rules/

### To Do

* Add support for subdirectory routes (for suitibly short domains, ofc)
* Impliment a more robust authentication method then a hardcoded bearer token, if possible.
* Add UA detection so behavior=redirect will fallback to message for curl, Postman, etc.
* Separately release a GUI worker and possibly a Craft CMS plugin
* Impliment 307/308 method-safe redirection - https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/307
* Update this documentation with the API information
* Add a healthcheck endpoint

---
develop
```
npm install
npm run dev
```

deploy on Workers
```
npm run deploy
```
