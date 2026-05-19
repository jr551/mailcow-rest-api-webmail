# mailcow-rest-api-webmail

**Alpha:** this frontend is public and usable, but it is still an alpha webmail client. Expect fast changes, rough edges, and missing polish in some workflows.

`mailcow-rest-api-webmail` is the Svelte 5 webmail frontend for [`mailcow-rest-api`](https://github.com/jr551/mailcow-rest-api). It ships a desktop mail UI plus a mobile/PWA experience styled around an iOS Mail-like flow.

## Screenshots

Desktop inbox:

![Desktop inbox](docs/screenshots/desktop-inbox-dark.png)

Message reading:

![Desktop message](docs/screenshots/desktop-message-dark.png)

AI assistant panel:

![Desktop AI panel](docs/screenshots/desktop-ai-panel.png)

Compose:

![Desktop compose](docs/screenshots/desktop-compose.png)

PWA install/settings:

![PWA settings](docs/screenshots/desktop-pwa-settings.png)

Mobile inbox snapshot:

![Mobile inbox](docs/screenshots/mobile-inbox.png)

## What It Includes

- Desktop mailbox UI with folders, search, filters, message detail, attachments, compose, reply, forward, and multi-account affordances.
- Calendar and drive views backed by the REST API.
- AI assistant workflows for summarising, drafting, sorting, actions, translation, phishing checks, and voice/TTS where configured.
- Tracking, sender policy, blocked-recipient, shortcuts, settings, density, theme, and PWA install surfaces.
- Mobile entry point at `/webmail/mobile/` with an iOS Mail-inspired layout for inbox, message reading, compose, folders, and settings. The mobile/PWA clone is part of the app even though the desktop screenshots above are the main public screenshots today.

## Client-Side Model

The webmail package is a static client-side app. The Docker image is only nginx serving built files; there is no webmail application server doing mailbox or AI processing inside this repo.

The browser talks to `mailcow-rest-api` for mailbox/auth/API work. Some optional integrations are deliberately browser-side, including AI provider calls and S3-compatible drive uploads, depending on how the API is configured.

For AI key privacy, do not put a shared provider key directly into a public static frontend. Use a LiteLLM proxy or another OpenAI-compatible key broker in front of the model provider. LiteLLM is not included in this repo. My deployment uses DeepSeek V4 Flash through a proxy.

## Docker Image

The public image is published to GitHub Container Registry:

```sh
docker pull ghcr.io/jr551/mailcow-rest-api-webmail:master
```

Run it locally:

```sh
docker run --rm -p 8080:80 ghcr.io/jr551/mailcow-rest-api-webmail:master
```

The image serves:

- `/webmail/` for desktop
- `/webmail/mobile/` for mobile/PWA
- `/health` for container health

In production the API should be reachable on the same origin through rewrites/proxying. The app expects `/v1/*` API calls unless your hosting layer rewrites them elsewhere.

## Static Hosting And Vercel

This repo can be hosted as a static app, including on Vercel, Netlify, nginx, Caddy, or any CDN/static host.

Build output:

```sh
npm install
npm run build
```

Publish `dist/`. For Vercel or any static host, add rewrites/proxy rules so API paths reach your `mailcow-rest-api` deployment:

```json
{
  "rewrites": [
    { "source": "/v1/:path*", "destination": "https://mail.example.com/mailcow-rest-api/v1/:path*" },
    { "source": "/health", "destination": "https://mail.example.com/mailcow-rest-api/health" },
    { "source": "/openapi.json", "destination": "https://mail.example.com/mailcow-rest-api/openapi.json" }
  ]
}
```

If you enable AI features on a static host, use LiteLLM or a similar proxy for shared-key privacy. Browser-local user keys are possible for personal use, but they are not a safe way to distribute one shared key to all users.

## Development

```sh
npm install
VITE_DEV_API_TARGET=http://localhost:3001 npm run dev
npm run check
npm run build
```

`VITE_DEV_API_TARGET` is only for the Vite dev proxy. Production routing is handled by your web server, CDN, or platform rewrites.

## Pair With The API

Use this frontend with the API image:

```sh
docker pull ghcr.io/jr551/mailcow-rest-api:master
docker pull ghcr.io/jr551/mailcow-rest-api-webmail:master
```

The API Swagger UI lives at `/` on the API service, or `/mailcow-rest-api/` if you use the public API setup script from the API repo.
