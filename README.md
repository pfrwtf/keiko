# Keiko
simple link shortener, for Cloudflare Workers and pushes the data to Plausible Analytics.

based on rinku by @espeon

---
### changes made
- changed name
- disabled proxy (commented out, easy to change back)
- changed favicon to pfr's
- changed greeting message
- removed cats (broken)

### todo
- change 404 to redirect to pfr site
- change / to redirect to pfr site
- figure out better auth method
- build a ui to manage keys
- maybe put back cats
- thank @espeon again for letting me use this and tolerating incessant questions on discord (thx and sry!)
---

set ENV variables:
- TOKEN (bearer token)
- PLAUSIBLE_DOMAIN (the domain your plausible instance is hosted on. if you use plausible cloud, put in plausible.io)
- bind to a kv with the variable name of KV.

_notes:_ the plausible api will automatically determine the domain being monitored based on the domain you are connecting to keiko on. 

make sure your custom domain is mapped to a domain in your plausible account if you're setting aside a whole ass domain for this.

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
