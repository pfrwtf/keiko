import { Context, Hono } from "hono";
import { cors } from "hono/cors";
import { bearerAuth } from "hono/bearer-auth";
import { StatusCode } from "hono/utils/http-status";
import { plausible } from "./analytics";

type Bindings = {
  KV: KVNamespace;
  TOKEN: string;
  PLAUSIBLE_DOMAIN: string | undefined;
};

const app = new Hono<{ Bindings: Bindings }>();

async function err(code: number, c: Context): Promise<Response> {
  Response.redirect("https://pfr.wtf/", 301);
}

app.get("/", (c) => c.text('You gotta give me a short URL, holmes. -Keiko @ PFR'));

app.use("/api/*", cors());
app.use("/api/*", async (c, next) => {
  console.log("Auth middleware hit with path:", c.req.path);
  const auth = bearerAuth({ token: c.env.TOKEN })
  return auth(c, next)
});

app.delete("/*", async (c, next) => {
  console.log("POST handler hit");
  const auth = bearerAuth({ token: c.env.TOKEN })
  return auth(c, next)
});

app.all("/favicon.ico", async (c) => {
  let cat = await fetch("https://pfr.wtf/asset/favicon.ico");
  return c.newResponse(await cat.arrayBuffer());
})

app.get("/all", async (c) => {
  console.log("Hitting /all route");
  let kv = await c.env.KV.list()
  console.log("KV response:", kv);
  return c.json(kv)
})

app.post("/api/new", async (c) => {
  console.log("Hitting /api/new route");
  console.log("Headers:", Object.fromEntries(c.req.headers));
  
  let body;
  try {
    body = await c.req.parseBody();
    console.log("Request body:", body);
  } catch (e) {
    console.error("Error parsing body:", e);
    return c.json({ error: "Failed to parse request body" }, 400);
  }

  // if body.url is undefined we skip all the parsing and return an error
  if (body.url !== undefined) {
    console.log("URL found:", body.url);
    
    // if not a valid url (could do more checking, but i have internal sites that don't have dot domains)
    if (!body.url.toString().includes("://")) {
      console.log("Invalid URL format");
      return await err(406, c);
    }

    // generate a string
    if (body.key == undefined) {
      console.log("No key provided, generating hash");
      // get hash of the url
      let hash_bytes = await crypto.subtle.digest(
        {
          name: "SHA-512",
        },
        new TextEncoder().encode(body.url as string)
      );
      
      // mangle the hash
      let hash = btoa(String.fromCharCode(...new Uint8Array(hash_bytes)))
        .replaceAll("/", "+!")
        .replaceAll("\\", "!+")
        .replaceAll("?", "4");
      
      let curr = 0;
      // get first five characters of hash
      body.key = hash.slice(curr, curr+5);
      console.log("Initial generated key:", body.key);
      
      // rotate if it's already in the database
      while ((await c.env.KV.get(body.key)) !== undefined) {  // Changed condition to !== undefined
        curr += 1;
        body.key = hash.slice(curr, curr+5);
        console.log("Key exists, trying new key:", body.key);
      }
    }

    console.log("Final key to use:", body.key);
    const existingUrl = await c.env.KV.get(body.key as string);
    console.log("Existing URL for key:", existingUrl);

    if(existingUrl == undefined){
      await c.env.KV.put(body.key as string, body.url as string);
      console.log("Stored new URL with key:", body.key);
      return c.text(body.key as string);
    } else {
      // this means that the custom key given *is* defined
      console.log("Custom key already exists");
      return await err(409, c);
    }
  }

  console.log("No URL provided in request");
  return c.notFound();
});

app.delete("/:key", async (c) => {
  console.log("Key deletion handler hit");
  await c.env.KV.delete(c.req.param("key"));
  return c.text("deleted " + c.req.param("key") + " if it existed.");
});

app.patch("/:key", async (c) => {
  let body = await c.req.parseBody();
  if(!body.url) return await err(412, c)
  if(await c.env.KV.get(c.req.param("key")) === undefined) await err(417, c)
  await c.env.KV.delete(c.req.param("key"))
  await c.env.KV.put(c.req.param("key"), body.url as string)
  return c.text("Modified " + c.req.param("key"));
});

app.post("/api/event", async (c) => {
  // assuming for plausible
  if(c.env.PLAUSIBLE_DOMAIN == undefined) return await err(412, c)
  const request = c.req
  request.headers.delete('cookie');
  return await fetch("https://plausible.io/api/event", request);
})

app.get("/:key", async (c) => {
  let r = await c.env.KV.get(c.req.param("key"));
  console.log(new URL(c.req.url).host)

  if (c.env.PLAUSIBLE_DOMAIN != undefined) c.executionCtx.waitUntil(plausible(c));

  if (r == null) return await err(404, c);

  return c.redirect(r);
});
export default app;
