# control_room

Dispatch control room web app. A browser-based dashboard for dispatchers,
built with Vite + React + TypeScript, sibling to `passenger_app/` and
`driver_app/` but talking to the same backend.

## Setup

```bash
npm install
cp .env.example .env.local   # then set VITE_API_BASE_URL to your backend URL
npm run dev
```

## Scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — type-check and build for production
- `npm run preview` — preview the production build locally
- `npm run lint` — run Oxlint

## Environment variables

- `VITE_API_BASE_URL` — base URL of the backend API (see `../backend`). Only
  vars prefixed with `VITE_` are exposed to client code by Vite.
