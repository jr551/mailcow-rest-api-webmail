# mailcow-rest-api-webmail

Svelte webmail frontend for `mailcow-rest-api`.

## Docker

The public image is published to GitHub Container Registry:

```sh
docker pull ghcr.io/jr551/mailcow-rest-api-webmail:master
```

The image serves the SPA under `/webmail/` and `/webmail/mobile/`.

## Development

```sh
npm install
VITE_DEV_API_TARGET=http://localhost:3001 npm run dev
npm run check
npm run build
```

The app expects the API to be reachable on the same origin in production.
