# Mi plan de comidas

PWA para marcar cada día si respetaste el plan nutricional. Ingreso con Google. El registro
(planes y días) se guarda en el dispositivo (`localStorage`) y, con sesión iniciada, también en D1
(`/api/data`, un JSON por usuario), que es la fuente de verdad; `localStorage` es una caché por cuenta. Al abrir se fusiona por
día, gana la modificación más reciente. La IA (Cloudflare Workers AI) se usa solo para leer un plan
nuevo.

> **No abrir al público todavía.** Faltan política de privacidad,
> borrado de cuenta y límites de uso de IA. Mantener la pantalla de consentimiento de Google en
> modo de prueba.

## Desarrollo

```bash
pnpm install
cp .dev.vars.example .dev.vars   # completar
pnpm dev:api                     # Worker + D1 local en :8788
pnpm dev                         # front en :5173 (redirige /api a :8788)
pnpm check                       # tipos, tests y build
```

- `pnpm dev:api` arma el build y aplica las migraciones locales. Usa Workers AI remoto: requiere
  `wrangler login` y consume cuota al analizar un plan.
- Sin credenciales de Google, `pnpm dev` ofrece "Entrar sin cuenta (solo desarrollo)". Ese acceso
  no existe en el build de producción y no da acceso a la API.

## Google OAuth

1. Google Cloud → APIs y servicios → Pantalla de consentimiento (externa, en modo de prueba, con tu
   email como usuario de prueba).
2. Credenciales → Crear ID de cliente OAuth → Aplicación web.
3. URI de redirección autorizadas: `http://localhost:5173/api/auth/callback/google` y
   `https://meal-plan-tracker.salaesp.workers.dev/api/auth/callback/google`.
4. Copiar el ID y el secreto en `.dev.vars` (local) y como secretos en Cloudflare (producción).

## Primer deploy (Cloudflare Workers)

La app queda en `https://meal-plan-tracker.salaesp.workers.dev`.

1. `pnpm exec wrangler login`
2. `pnpm exec wrangler d1 create meal-plan-tracker`, pegar el `database_id` en `wrangler.jsonc`
   (si ofrece agregarlo solo, responder que no) y subir el cambio.
3. Cargar los secretos, uno por comando:
   `pnpm exec wrangler secret put BETTER_AUTH_SECRET` (aleatorio: `openssl rand -base64 32`),
   `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`. `BETTER_AUTH_URL` ya está en `wrangler.jsonc`.
4. Publicar:
   - **Desde GitHub (Workers Builds):** rama `main`, build command `pnpm build`, deploy command
     `pnpm run deploy:ci` (aplica migraciones y publica).
   - **Desde la compu:** `pnpm run deploy` (con `run`: `pnpm deploy` es otro comando).
5. Abrir la URL en Chrome de Android → menú → **Instalar app**.

## Seguridad

- Todo `/api/*` exige sesión salvo `/api/auth/*` (`worker/index.ts`).
- Los intentos de ingreso tienen límite guardado en D1.
- Secretos solo en `.dev.vars` y en Cloudflare, nunca en el repositorio.

## Carga de planes

PDF con texto (máx. 5 MB) o texto pegado (máx. 30.000 caracteres). El borrador se revisa antes de
activarse y rige desde ese día; los días anteriores conservan su plan. El PDF se lee en el
dispositivo con pdf.js y solo el texto llega a la IA, sin las líneas de contacto. PDFs escaneados y
colores del documento no se interpretan.

Modelo: `gpt-oss-120b`. Medido con un plan de 5 páginas: unos 35 segundos y 600 neurons por carga,
sobre 10.000 gratis por día.

## Estructura

- `src/domain/` — plan, registro diario, semana y validación (sin UI).
- `src/data/seedPlan.ts` — plan de ejemplo genérico.
- `src/auth/` — ingreso y estado de sesión.
- `worker/`, `migrations/` — autenticación, API y base D1.
- `src/screens/` — Hoy, detalle, Semana, Plan y revisión.
- `worker/parse-plan.ts` — extracción con Workers AI.
