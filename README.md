# Mi plan de comidas

PWA para marcar cada día si respetaste el plan nutricional. Los datos viven en el dispositivo
(`localStorage`). La IA (Cloudflare Workers AI) se usa solo para leer un plan nuevo.

## Comandos

```bash
pnpm install
pnpm dev        # app sin IA, http://localhost:5173
pnpm check      # tipos, tests y build
pnpm dev:ai     # app + Pages Functions (requiere `wrangler login`; consume cuota de IA)
pnpm run deploy # check y publicación en Cloudflare Pages
```

## Primer deploy

1. `pnpm exec wrangler login`
2. `pnpm exec wrangler pages project create meal-plan --production-branch main`
3. Proteger con Cloudflare Access **antes** de publicar la URL (ver abajo).
4. `pnpm run deploy` (con `run`: `pnpm deploy` es otro comando)
5. Abrir la URL en Chrome de Android → menú → **Instalar app**.

El binding `AI` sale de `wrangler.jsonc`; no hace falta configurarlo en el dashboard.

## Cloudflare Access

Sin Access, cualquiera con la URL ve el plan y gasta la cuota de IA. Activar la política desde
Pages protege solo las previews; para cubrir también `*.pages.dev`
([guía oficial](https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain)):

1. Workers & Pages → proyecto → Settings → **Enable access policy**.
2. **Manage** en la política creada → Access → Applications → proyecto → **Configure**.
3. En **Public hostname**, borrar el `*` del subdominio y guardar.
4. Volver al proyecto y activar otra vez **Enable access policy** para las previews.
5. Dejar permitido solo tu email.

## Carga de planes

PDF con texto (máx. 5 MB) o texto pegado (máx. 30.000 caracteres). El borrador se revisa antes de
activarse y rige desde ese día; los días anteriores conservan su plan. PDFs escaneados y colores
del documento no se interpretan.

Consumo estimado según el precio publicado del modelo: unas 1.000 neurons por carga, sobre 10.000
gratis por día. No está medido.

## Estructura

- `src/domain/` — plan, registro diario, semana y validación (sin UI).
- `src/data/seedPlan.ts` — plan de ejemplo genérico.
- `src/screens/` — Hoy, detalle, Semana, Plan y revisión.
- `functions/api/parse-plan.ts` — extracción con Workers AI.
