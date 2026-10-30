# Cómo contribuir

## Antes de abrir un PR
```bash
pnpm install
pnpm check
```
`pnpm check` corre el typecheck y todos los tests. Un PR que no lo pasa no se revisa.

## Reglas
- **Reglas de negocio:** cualquier cambio en una métrica se hace en `docs/reglas-negocio.md` **y** en su test de `packages/core/test`, en el mismo PR.
- **Base de datos:** toda tabla nueva con datos de una cuenta lleva `account_id` y una política RLS con `public.puede_ver_cuenta(account_id)`. Agrega el caso a `supabase/test/rls.test.ts`.
- **Secretos:** nunca en el código, en tests ni en ejemplos. Las API keys viven en Supabase Vault.
- **Datos reales:** nada de nombres de clientes, teléfonos, documentos ni datos de cuentas reales en fixtures ni en la documentación.
- **Llamadas externas:** los tests usan `fetch` falso. Nada de llamar a Effi, Meta u otro servicio desde CI.
- **Adaptadores:** sigue [docs/adaptadores.md](docs/adaptadores.md).

## Estilo
- TypeScript estricto. Nombres y comentarios en español, como el resto del código.
- Comentarios solo donde explican un porqué que el código no dice (una rareza de la API, un orden que importa).

## Seguridad
Si encuentras una vulnerabilidad, **no abras un issue público**: escribe a los mantenedores (ver `SECURITY.md`).
