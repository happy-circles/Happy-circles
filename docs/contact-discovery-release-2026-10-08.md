# Publicación de contactos — 2026-10-08

Código publicado: `d789c52e07392aef0fe16d88c497c2cd27f52f3e`.
[Security CI](https://github.com/happy-circles/Happy-circles/actions/runs/37832425028)
terminó correctamente para ese commit. La revisión posterior de documentación y
workflow no cambia el código de la app, la web ni Supabase y no requiere otra OTA.

## Cambio entregado

- La pantalla conserva la caché de contactos y estados para evitar resolver toda
  la agenda al reabrirla. La lista está virtualizada y actualiza filas concretas.
- El registro de observaciones y la resolución de estados son operaciones
  separadas. Los estados desconocidos se resuelven en lotes de hasta 60 números.
- Los avisos de nuevas coincidencias actualizan los contactos afectados. Hay una
  reconciliación controlada para recuperar eventos perdidos, sin consultas por
  cada contacto ni por cada apertura.
- Enviar una solicitud usa una sola operación del servidor, con progreso en la
  fila. Abrir una solicitud existente lleva directamente a su detalle.
- Las observaciones HMAC están vinculadas a la cuenta; no son datos anónimos.
  Se renuevan cada cinco minutos mientras la app está en primer plano,
  desbloqueada, con conexión disponible y con permiso de contactos. Se detienen al pasar a segundo plano,
  cerrar sesión o detectar la revocación del permiso. Caducan a los 15 minutos
  desde su último registro o renovación y se borran mediante limpieza periódica.
  No se guarda una copia de los nombres de la agenda.

## Supabase y web de producción

Proyecto Supabase: `vknfhyfdtlvvfzptpqpj`. Verificación final de migraciones:
`2026-10-08T19:36:45.018Z`.

- Aplicadas `20261008182226_separate_contact_discovery_registration.sql` y
  `20261008183958_prune_contact_discovery_watches.sql`: 90 migraciones alineadas.
- Publicadas `register-contact-discovery` v1 y `manage-contact-discovery` v2,
  ambas con verificación JWT. Las otras 41 funciones conservan su versión,
  incluida `resolve-people-targets` v9. Las 43 funciones están ACTIVE.
- Verificadas RLS de las tablas privadas, RPC públicas ejecutables sólo por
  `service_role`, ausencia de permisos directos sobre helpers y limpieza cada
  minuto. Las llamadas anónimas a las tres funciones devolvieron HTTP 401.
- No se crearon fixtures ni se modificaron datos de usuarios para estas pruebas.
  No aparecieron errores nuevos en los asesores de Supabase; permanecen dos
  advertencias históricas de seguridad ajenas a esta publicación.

Vercel publicó el mismo commit en el proyecto `happy-circles-landing` mediante
la integración de GitHub. Deployment: `Be6chZ1gxHoYRV3TXfoCUKzaxXGd`.
Las rutas públicas `/`, `/privacy`, `/terms` y `/support` respondieron HTTP 200.
La [política publicada](https://app.happy-circles.com/privacy), fechada
2026-10-08, describe el ciclo actual y estaba publicada antes de las OTA.

## Compatibilidad y entrega móvil

Proyecto EAS: `9b63f5f3-3c81-4d3d-bc54-1a81b998d20a`.
Runtime: `hc-sdk54-20260928-1`. Environment: `production`.

Los builds de tienda Android 1.0.3 (23) e iOS 1.0.3 (38) usan este runtime y el
canal `production`. No hay cambios de dependencias, configuración nativa,
plugins ni permisos respecto a su fuente
`3a6b8d15a54e7a59897114055e591322d2ed8c32`; no se necesita reconstruirlos para
esta entrega.

**Los binarios 1.0.2 no incluyen `expo-updates` y necesitan una actualización
desde la tienda a un binario compatible.** El lookup público de Apple para
Colombia todavía devolvía 1.0.2 el 2026-10-08. Un build EAS terminado no confirma
su aprobación o disponibilidad pública en las tiendas.

| Destino            | Plataforma | Grupo OTA                              | Update                                 |
| ------------------ | ---------- | -------------------------------------- | -------------------------------------- |
| `production-smoke` | Android    | `f9d4a09e-7d03-45ee-bd29-d0c22b8efff7` | `01a11d15-0249-71fd-a2a1-4e380938a80d` |
| `production-smoke` | iOS        | `ddb4cc36-44c8-4fad-9f77-ce21d5be1ceb` | `01a11d16-e63d-7b07-8df8-17ddc21e5c84` |
| `production`       | Android    | `429a03b2-927d-4936-8e6d-673b90641fec` | `01a11d2a-1b16-7904-83ac-338f6f4cdaa4` |
| `production`       | iOS        | `6ca59f44-5ba9-4400-bf1f-33b5771b3eab` | `01a11d2b-3dd4-739d-991c-a2270634aa42` |

Ambas OTA de producción se publicaron desde el commit indicado arriba. El
read-back de EAS confirmó rama, runtime y commit. Las consultas HTTP de
manifiestos de producción respondieron 200 para ambas plataformas con los IDs
esperados a las `2026-10-08T20:23:09.434Z`. El SHA256 real del bundle y los 45
assets de cada plataforma coinciden con su exportación smoke.

Se usó EAS CLI 21.7.1 con la sesión existente y las mismas comprobaciones de CI,
runtime y environment del workflow. La credencial HTTPS disponible para GitHub
sólo permite lectura y no permite lanzar el workflow manualmente; Git SSH sí
permitió publicar el código. No se cambiaron credenciales ni secretos.

Se publicaron Android e iOS con comandos separados. En esta versión del CLI,
`--platform all` intentaba exportar web y fallaba por el WASM de `expo-sqlite`
antes de publicar. El workflow y el [runbook](./eas-update-runbook.md) ahora
ejecutan las dos plataformas explícitas y conservan resultados por plataforma
si una publicación falla. No se cambió la configuración de la app para resolverlo.

La política `ON_LOAD`, con `fallbackToCacheTimeout: 0`, descarga la actualización
en segundo plano y la aplica en una apertura posterior del proceso. No fuerza
una recarga durante una operación del usuario.

## Verificación y límites

- Verificaciones automáticas del código: 757 tests en 128 archivos; lint,
  typecheck, auditoría de dependencias, contrato EAS, build web, comprobaciones
  de seguridad y tests SQL completados en CI.
- Pruebas locales de descubrimiento: concurrencia y aislamiento correctos;
  20 muestras de avisos WebSocket con p95 de 280 ms. La prueba SQL local con
  20 actores, 1.000 números por actor y 60.000 observaciones adicionales no tuvo
  errores. Estas mediciones no incluyen Edge Functions, red ni dispositivos y
  no certifican capacidad de producción.
- APK interno Android de QA: `06c5fb37-fc4f-438a-9dbc-8c2da501a526`, perfil `apk`,
  canal `production-smoke`, misma fuente y runtime. Se comprobó configuración
  Supabase de producción y ausencia del proyecto de pruebas.
- En un clon de sólo lectura del emulador Android se verificó el arranque del
  bundle incorporado sin conexión, la descarga real de la OTA y su ejecución en
  procesos nuevos con red y sin conexión. La OTA registró dos arranques
  correctos y cero fallos; se revisaron capturas de la entrada anónima.
- La inspección HTTPS local de Norton requirió su CA pública sólo en el clon.
  Se mantuvo la validación TLS; no se modificaron binario ni configuración de
  la app. El clon se cerró y el montaje temporal se retiró al terminar.
- No se probó la pantalla de contactos autenticada ni su rendimiento en un
  teléfono físico. No había un dispositivo iOS disponible: se verificaron su
  exportación, paridad y manifiesto, sin certificar una ejecución física.

## Consumo del plan

Cuenta `happy-circles`, plan Free, periodo 2026-10-01 a 2026-11-01.
La prueba añadió un build interno Android: consumo final Android 2/15,
iOS 1/15, total 3/30. No se generaron nuevos builds de tienda.

El reporte final de EAS indicó 0/1.000 instalaciones actualizadas y 29.379 bytes
de 100 GiB de transferencia. Esos contadores pueden tardar en reflejar las
descargas realizadas; el cero reportado no significa que las OTA no consuman
cuota. El costo estimado y el sobreconsumo reportados eran $0. No hubo compras,
cambio de plan, add-ons ni ampliación de concurrencia.

Según [Expo](https://docs.expo.dev/billing/usage-based-pricing/), una instalación
que descarga una o más actualizaciones cuenta una sola vez dentro del mes;
también se contabiliza su transferencia. Las instalaciones distintas de una
misma persona cuentan por separado.
