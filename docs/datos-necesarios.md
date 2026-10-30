# Datos que vas a necesitar (ten esto a mano)

| Dato | Dónde se saca | ¿Secreto? |
|---|---|---|
| Países donde vendes | Tú | No |
| Perfil: marca propia, distribuidor o proveedor | Tú | No |
| Nombre corto de cada cuenta (`TIENDA_CO`) | Lo defines tú; termina en `_` + país | No |
| API key de Effi (una por empresa) | Effi → Administración → Usuarios → usuario de solo consulta → Ver más detalles | **Sí** |
| Project ref y URL de Supabase | Supabase → Settings → General / API | No |
| Anon (publishable) key | Supabase → Settings → API | No (es pública) |
| Service role key | Supabase → Settings → API | **Sí**, solo en tu `.env` |
| Correo del dueño | Tú; el primer usuario registrado queda como dueño | Dato personal |
| Dominio de Shopify (`mi-tienda.myshopify.com`) y token Admin | Shopify → Configuración → Apps → Desarrollar apps | Token: **Sí** |
| Receptor propio para Shopify (opcional) | Tu n8n u otro servicio | No |
| Contraseña de aplicación de Gmail (informe diario) | Cuenta de Google | **Sí** |
| Token de Meta Ads (gasto) | Meta for Developers | **Sí** |

## Ideas de datos extra que ayudan
- Transportadoras con las que trabajas y ciudades principales.
- Si tu proveeduría atiende a varios distribuidores.
- Zona horaria de cada empresa (el kit la deduce por país).
- Meta de devolución aceptable por país (Effi Connect trae umbrales por defecto).
