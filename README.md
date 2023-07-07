## rinku vanilla
forked from @espeon ❤️

simple link shortener, for Cloudflare Workers.

plausible functionality is removed from this version.
---

#variables

KV_PREVIEW: The ID of the Key Value store used in dev mode
KV_PUBLIC: The ID of the Key Value store used in production mode

AUTH_TOKEN: A password you can use as a bearer token for any admin function (put, patch, del, get all keys)

BEHAVIOR_NOKEY: (redirect | message) If no key is passed, the type of behavior expected for the 

REDIREC_GEN200: URL to redirect to if no key passed
MESSAGE_GEN200: Generic response message if no key is given for redirect
MESSAGE_ERR400: Response for malformed requests
MESSAGE_ERR404: Response for keys that are not in the KV


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
