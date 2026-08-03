# SimpleInmo

Next.js 15 + Prisma + PostgreSQL. La gestión inmobiliaria, simplificada — con portal público.

## Requisitos

- Node.js 20+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (mismo enfoque que Constructora)

## Arranque local

```bash
# 1. Variables de entorno
cp .env.example .env

# 2. Migraciones + seed (usa Postgres local en schema erp_inmobiliario)
npx prisma migrate deploy
npm run db:seed

# 3. App
npm run dev
```

Por defecto el `.env` apunta a la misma instancia Postgres que Constructora, pero al **schema** `erp_inmobiliario` (las tablas de Constructora siguen en `public` y no se tocan).

Si preferís un contenedor Docker propio (puerto 5433):

```bash
npm run db:up
# y en .env usá la Opción B del .env.example
```

- App: http://localhost:3001 (Constructora queda en `:3000`)
- Login: http://localhost:3001/login
- Demo: `admin@erp.local` / `demo1234`

## Scripts DB

| Script | Descripción |
|--------|-------------|
| `npm run db:up` | `docker compose up -d` |
| `npm run db:down` | Detiene el contenedor |
| `npm run db:migrate` | Prisma migrate |
| `npm run db:seed` | Datos demo |
| `npm run db:studio` | Prisma Studio |

## Roles

`ADMIN`, `AGENT`, `OWNER`, `TENANT`, `SUPPLIER`, `GUARANTOR`

## Módulos

| Área | Rutas |
|------|--------|
| Portal público | `/`, `/propiedades`, `/propiedades/[slug]` |
| App | `/dashboard`, `/gestion/propiedades`, `/complejos`, `/contratos`, `/cobros`, `/expensas`, `/mantenimiento`, `/rendiciones`, `/leads`, `/usuarios`, `/turnero` |
| PDF | Recibo de cuota `/api/cobros/[id]/pdf` · Liquidación `/api/rendiciones/[id]/pdf` |

## Estructura

- `prisma/schema.prisma` — dominio completo
- `src/app/(erp)` — dashboard autenticado
- `src/app/(storefront)` — portal público
- `src/app/(auth)` — login
- `src/server/services` — billing, expensas, rendiciones
