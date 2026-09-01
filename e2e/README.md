# Pruebas E2E locales

## Requisitos

1. PostgreSQL accesible (`DATABASE_URL` en `.env`)
2. Datos demo: `npm run db:seed`
3. Browsers: `npx playwright install chromium`

## Ejecutar

```bash
npm run test:e2e
```

Playwright levanta el dev server en `http://localhost:3001` si no está corriendo.
La sesión se guarda en `e2e/.auth.json` vía login API (proyecto `setup`).

### Suites

| Archivo | Cobertura |
|---------|-----------|
| `smoke.spec.ts` | Módulos, portal, health |
| `cobros.spec.ts` | Listados, cuenta corriente, impresión deuda |
| `contratos.spec.ts` | Listado, búsqueda, detalle |
| `tesoreria.spec.ts` | Hub, recibos, cuentas, caja |
| `expensas.spec.ts` | Listado y costos de servicio |
| `flows/transversal.spec.ts` | **Cobro → recibo → caja → rendición → OP** |

El setup global (`scripts/e2e-prepare.ts`):
- Alinea owner del contrato con titular de la propiedad
- Resetea cuotas/rendiciones del contrato E2E
- Asegura cuota pendiente del mes, caja abierta y cuenta bancaria
- Escribe `e2e/.fixtures.json`

## Variables opcionales

| Variable | Default |
|----------|---------|
| `PLAYWRIGHT_BASE_URL` | `http://localhost:3001` |
| `E2E_EMAIL` | `admin@erp.local` |
| `E2E_PASSWORD` | `demo1234` |

## CI

GitHub Actions (`.github/workflows/e2e.yml`): PostgreSQL + seed + Playwright en push/PR a `master`/`main`.

## Reporte

Tras fallos: `npm run test:e2e:report` (HTML en `e2e-report/`).
