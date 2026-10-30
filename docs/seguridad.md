# Seguridad

1. **Una key por empresa, de un usuario de solo consulta.** La API key de Effi dura 360 días; al renovarla, la anterior deja de funcionar al instante.
2. **Los secretos no viajan por el chat.** Se pegan en el SQL Editor de Supabase (la API key y los secretos de webhook quedan cifrados en Vault) o en `.env` (ignorado por git).
3. **La service role key** salta toda la seguridad de la base. Solo vive en tu `.env` local y en las funciones de Supabase; nunca en el navegador, en Vercel como variable pública ni en git.
4. **Firma de webhooks.** Si guardas el secreto de algún evento de una cuenta, esa cuenta exige `X-Effi-Signature` válida en todos sus avisos. Guarda el de cada evento que registres.
5. **Un aviso no es un dato.** Aunque la firma sea válida, Effi Connect vuelve a consultar el registro en la API de Effi.
6. **Si pegaste un secreto por error** en un chat o commit, rótalo (Effi, Supabase, Shopify) en vez de intentar borrarlo.
7. **Antes de publicar un fork** revisa que no queden datos reales: `git log -p | grep -iE "api[_-]?key|secret|service_role"`.
