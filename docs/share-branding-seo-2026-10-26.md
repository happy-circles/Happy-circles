# Logo, vistas previas y búsqueda — 2026-10-26

La web utiliza el icono original de la app como fuente de marca. Se añadieron
favicon ICO (16, 32, 48, 96 y 256 px), iconos PNG de 96 y 192 px, icono Apple
de 180 px y una imagen pública de 1024 px. Se regeneran con:

```powershell
node scripts/generate-brand-assets.mjs
```

La tarjeta `/opengraph-image?v=2` contiene únicamente el logo y el nombre
Happy Circles. Ambos quedan dentro del cuadrado central de la imagen
1200 × 630, para conservarlos cuando el destinatario recorta a 1:1. No contiene
datos de invitaciones ni una URL dibujada.

La portada incluye una imagen HTML rastreable y datos estructurados con nonce
CSP. Los canonical y el sitemap utilizan `https://www.happy-circles.com`;
el origen de autenticación y los enlaces nativos conservan `app.happy-circles.com`.
Las invitaciones y los flujos de autenticación llevan `noindex,nofollow` y no se
incluyen en el sitemap. No se modificaron las redirecciones a las tiendas ni las
asociaciones de enlaces nativos.

Validación local:

- ESLint de la landing, pruebas de metadatos y privacidad (3), compilación de
  producción con TypeScript y `security:check` correctos.
- Iconos opacos, dimensiones verificadas y cinco entradas válidas en el ICO.
- Respuestas HTTP 200 para los iconos, imagen social, robots, sitemap y
  asociaciones nativas; canonical público y noindex de invitaciones comprobados
  en el HTML servido por el build de producción.
- Revisión visual de la portada y de la imagen social generada.

Google y las aplicaciones de mensajería pueden conservar resultados anteriores
en sus cachés. Publicar estos recursos no garantiza una miniatura concreta ni
un tamaño de tarjeta determinado. El enlace directo `apps.apple.com` utiliza
los recursos y metadatos de Apple; esta publicación corrige los enlaces web de
Happy Circles y no publica una nueva versión iOS/Android.
