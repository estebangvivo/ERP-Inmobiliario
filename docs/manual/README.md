# Manual de usuario SimpleInmo

- **Manual completo:** [MANUAL-USUARIO.md](./MANUAL-USUARIO.md)
- **Capturas:** carpeta [`images/`](./images/)
- **En el ERP:** menú **Manual** (`/manual`), con descarga HTML/Markdown e impresión/PDF

Incluye contratos (índices, próximos a vencer, renovación), cobros, tesorería, reportes, WhatsApp, portal, privacidad/condiciones y el resto de módulos operativos.

## Regenerar capturas

Con el servidor local levantado:

```bash
npm run dev
npm run manual:screens
```

Credenciales por defecto del script: `admin@erp.local` / `demo1234`  
(variables opcionales: `MANUAL_BASE_URL`, `MANUAL_EMAIL`, `MANUAL_PASSWORD`).
