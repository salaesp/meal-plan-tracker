# Mi plan de comidas

PWA para marcar cada día si respetaste el plan nutricional. Ingreso con Google; por ahora los
registros viven en el dispositivo (`localStorage`) y todavía no se sincronizan. La IA (Cloudflare
Workers AI) se usa solo para leer un plan nuevo.

> **No abrir al público todavía.** Faltan sincronización por usuario, política de privacidad,
> borrado de cuenta y límites de uso de IA. Mantener la pantalla de consentimiento de Google en
> modo de prueba.

## Desarrollo

```bash
pnpm install
cp .dev.vars.example .dev.vars   # completar
pnpm dev:api                     # Pages Functions + D1 local en :8788
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
   `https://meal-plan-tracker.pages.dev/api/auth/callback/google`.
4. Copiar el ID y el secreto en `.dev.vars` (local) y como secretos en Cloudflare (producción).

## Primer deploy

```bash
pnpm exec wrangler login
pnpm exec wrangler d1 create meal-plan-tracker
```

1. Pegar el `database_id` que devuelve en `wrangler.jsonc`.
2. `pnpm exec wrangler pages project create meal-plan-tracker --production-branch main`
3. Cargar los secretos, uno por comando:
   `pnpm exec wrangler pages secret put BETTER_AUTH_SECRET` (aleatorio: `openssl rand -base64 32`),
   `BETTER_AUTH_URL` (`https://meal-plan-tracker.pages.dev`; si Cloudflare asigna otro subdominio, usar ese), `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.
4. `pnpm run deploy` (con `run`: `pnpm deploy` es otro comando). Aplica migraciones y publica.
5. Abrir la URL en Chrome de Android → menú → **Instalar app**.

## Seguridad

- Todo `/api/*` exige sesión salvo `/api/auth/*` (`functions/api/_middleware.ts`).
- Los intentos de ingreso tienen límite guardado en D1.
- Secretos solo en `.dev.vars` y en Cloudflare, nunca en el repositorio.

## Carga de planes

PDF con texto (máx. 5 MB) o texto pegado (máx. 30.000 caracteres). El borrador se revisa antes de
activarse y rige desde ese día; los días anteriores conservan su plan. PDFs escaneados y colores
del documento no se interpretan.

Consumo estimado según el precio publicado del modelo: unas 1.000 neurons por carga, sobre 10.000
gratis por día. No está medido.

## Estructura

- `src/domain/` — plan, registro diario, semana y validación (sin UI).
- `src/data/seedPlan.ts` — plan de ejemplo genérico.
- `src/auth/` — ingreso y estado de sesión.
- `functions/`, `migrations/` — autenticación, API y base D1.
- `src/screens/` — Hoy, detalle, Semana, Plan y revisión.
- `functions/api/parse-plan.ts` — extracción con Workers AI.
