import {
  createJWT,
  encodeToString,
  generatePass,
  hmac,
  WebhookEvent,
  WebhookEventMap,
  WebhookEventName,
} from "./deps.ts";

const GITHUB_URL = Deno.env.get("GITHUB_URL") || "https://api.github.com";

export type {
  WebhookEvent,
  WebhookEventMap,
  WebhookEventName,
} from "./deps.ts";

export type Config = {
  /* The GitHub App ID */
  readonly appId?: string;

  /* The webhook secret use to sign and verify requests */
  readonly secret?: string;

  /* The GitHub App Private Key used to create tokens */
  readonly privateKey?: string;
};

export type Context<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  /* A token to use on requests to GitHub API */
  readonly token?: string;

  /* The installation ID that triggered the event */
  readonly installationId?: number;
} & { [K in keyof T]: T[K] };

export type EventHandler<C extends Context = Context> = (
  /* The name of the event */
  event: WebhookEventName,
  /* The payload of the event */
  payload: WebhookEvent,
  /* Useful context information */
  context: C,
) => Promise<C | void> | C | void;

/* Listens to `fetch` events and handles requests from GitHub */
export function webhooks<C extends Context = Context>(config: Config = {}) {
  return (...eventHandlers: ReadonlyArray<EventHandler<C>>) => {
    addEventListener("fetch", handleFetchEvent<C>(config, eventHandlers));
  };
}

export function buildOn<C extends Context>() {
  return function <T extends WebhookEventName>(
    target: T,
    handler: (
      payload: WebhookEventMap[T],
      context: C,
    ) => ReturnType<EventHandler<C>>,
  ): EventHandler<C> {
    return async (event, payload, context) => {
      if (event === target) {
        // @ts-ignore FIXME
        return await handler(payload, context) || context;
      }
    };
  };
}

/* Creates an event handler */
export const on = buildOn<Context>();

/* Generates a secret to sign and verify requests from GitHub */
export function generateSecret() {
  const { pass } = generatePass({
    type: "alphanum",
    number: 32,
    caps: true,
  });

  return pass;
}

function handleFetchEvent<C extends Context>(
  config: Config,
  eventHandlers: ReadonlyArray<EventHandler<C>>,
) {
  // deno-lint-ignore no-explicit-any
  return async (fetchEvent: any) => {
    const startTime = Date.now();

    const request: Request = fetchEvent.request;

    try {
      const { event, signature } = parseHeaders(request.headers);

      if (config.secret && !signature) {
        throw new Error("Unsigned request");
      }

      const payload = await fetchPayload(request);

      if (config.secret && signature) {
        verifySignature(payload, signature, config.secret);
      } else {
        console.warn(`Skipping signature validation...`);
      }

      // @ts-ignore FIXME
      let context: C = {
        installationId: (payload as { installation?: { id: number } })
          .installation?.id,
      };

      if (config.appId && config.privateKey && context.installationId) {
        context = {
          ...context,
          token: await fetchToken(
            config.appId,
            context.installationId,
            config.privateKey,
          ),
        };
      } else {
        console.warn(`Skipping fetching token...`);
      }

      // FIXME: prefer immutability instead
      for (const handler of eventHandlers) {
        context = await handler(event, payload, context) || context;
      }

      fetchEvent.respondWith(json({ success: true }));
    } catch (error) {
      fetchEvent.respondWith(
        json({ error }),
        error.status || error.statusCode || error.code || 500,
      );
    }

    console.log(`Done in ${Date.now() - startTime}ms`);
  };
}

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "user-agent": "github_webhooks",
      "content-type": "application/json",
    },
  });
}

function parseHeaders(
  headers: Headers,
): { event: WebhookEventName; signature: string | null } {
  const event = headers.get("x-github-event");
  const signature = headers.get("x-hub-signature-256");

  if (!event) {
    throw new Error(`Header "x-github-event" not present`);
  }

  if (!signature) {
    console.warn(`Header "x-hub-signature-256" is not present`);
  }

  return { event: event as WebhookEventName, signature };
}

async function fetchPayload(request: Request): Promise<WebhookEvent> {
  return (await request.json()) as WebhookEvent;
}

function verifySignature(
  payload: WebhookEvent,
  signature: string,
  secret: string,
) {
  const te = new TextEncoder();
  const encodedPayload = te.encode(toNormalizedJSONString(payload));
  const verificationSignature = `sha256=${
    encodeToString(hmac("sha256", te.encode(secret), encodedPayload))
  }`;

  if (signature.length !== verificationSignature.length) {
    return false;
  }

  // TODO: validate timing safe equal
  return signature === verificationSignature;
}

function toNormalizedJSONString(payload: WebhookEvent) {
  return JSON.stringify(payload).replace(/[^\\]\\u[\da-f]{4}/g, (s) => {
    return s.substr(0, 3) + s.substr(3).toUpperCase();
  });
}

async function fetchToken(
  appId: string,
  installationId: number,
  privateKey: string,
): Promise<string> {
  const appToken = await createJWT({ alg: "RS256" }, {
    iat: parseInt(((Date.now() / 1000) - 60).toFixed()),
    exp: parseInt(((Date.now() / 1000) + (10 * 60)).toFixed()),
    iss: appId,
  }, privateKey);

  const resp = await fetch(
    `${GITHUB_URL}/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        "authorization": `Bearer ${appToken}`,
        "accept": "application/vnd.github.v3+json",
        "content-type": "application/vnd.github.v3+json",
      },
    },
  );

  const { token } = await resp.json();

  return token;
}
