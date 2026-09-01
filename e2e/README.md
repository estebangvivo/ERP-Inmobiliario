# Pruebas E2E locales

## Requisitos

1. PostgreSQL accesible (`DATABASE_URL` en `.env`)
2. Usuario admin demo: `npm run db:seed` (mínimo) o datos existentes
3. Browsers: `npx playwright install chromium`

## Ejecutar

```bash
npm run test:e2e:setup   # primera vez
npm run test:e2e
```

Playwright levanta el dev server en `http://localhost:3001` (local) o `next start` en CI.
La sesión se guarda en `e2e/.auth.json` tras login UI + selección de org **Demo E2E**.

## Sandbox aislado

`scripts/e2e-prepare.ts` resetea la org `demo-e2e` (`Demo E2E`):
- Edificio, propiedad alquilada + propiedad disponible para altas
- Contrato `E2E-CTR-001`, cuota pendiente del mes
- Propietario `e2e-owner@erp.local`, inquilino `e2e-tenant@erp.local`
- Caja en $0, sin rendiciones ni pagos previos

Fixtures en `e2e/.fixtures.json` (gitignored).

### Suites

| Archivo | Cobertura |
|---------|-----------|
| `smoke.spec.ts` | Módulos, portal, health |
| `cobros.spec.ts` | Listados, cuenta corriente, impresión deuda |
| `contratos.spec.ts` | Listado, búsqueda, detalle |
| `contratos-nuevo.spec.ts` | Formulario alta contrato |
| `tesoreria.spec.ts` | Hub, recibos, cuentas, caja |
| `expensas.spec.ts` | Listado expensas |
| `expensas-flow.spec.ts` | Carga gasto de servicio |
| `portal.spec.ts` | Login inquilino sandbox |
| `flows/transversal.spec.ts` | Cobro → recibo → caja → rendición → OP |

## Variables opcionales

| Variable | Default |
|----------|---------|
| `PLAYWRIGHT_BASE_URL` | `http://localhost:3001` |
| `E2E_EMAIL` | `admin@erp.local` |
| `E2E_PASSWORD` | `demo1234` |
| `E2E_ORG_NAME` | `Demo E2E` |

## CI

GitHub Actions (`.github/workflows/e2e.yml`): unit tests + PostgreSQL + build + Playwright.

## Reporte

Tras fallos: `npm run test:e2e:report` (HTML en `e2e-report/`).
