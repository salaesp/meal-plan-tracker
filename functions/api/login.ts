/**
 * Navegar a /api/login saltea el service worker, así Cloudflare Access puede
 * pedir el email cuando venció la sesión. Después vuelve a la app.
 */
export const onRequestGet = ({ request }: { request: Request }) =>
  Response.redirect(new URL('/#/plan', request.url).toString(), 302)
