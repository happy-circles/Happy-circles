# Solicitudes: estado del contacto y OTA — 2026-10-09

Publicado para Android e iOS en `production` y `production-smoke`. Fuente:
`4fd4774fe3416edab6ec50cf440e8450e73c5332`, con
[Security CI exitoso](https://github.com/happy-circles/Happy-circles/actions/runs/37963564435).
Incluye las mejoras anteriores de movimientos, invitaciones y fotos de perfil.

## Comportamiento

Al enviar una solicitud a una persona que ya usa HC, el contacto muestra
`Solicitud pendiente` y `Ver solicitud` desde la primera actualización del estado.
La lista obtiene los cambios del mismo snapshot que usa para presentar las filas;
ya no depende de una segunda suscripción que podía recibir el aviso después del
render. Conserva las filas y secciones que no cambiaron.

Las regresiones reprodujeron el fallo original y verificaron el primer render
síncrono y el render siguiente. Pasaron las 91 pruebas del flujo, typecheck,
lint y formato. Security CI verificó el commit completo, incluyendo auditoría de
dependencias, contrato EAS, compilación web y pruebas de Supabase. El despliegue
web asociado a este commit también terminó correctamente.

## Entrega

Runtime: `hc-sdk54-20260928-1`. Environment: `production`. Compatible con los
builds Android 1.0.3 (23) e iOS 1.0.3 (38). No cambiaron dependencias,
configuración ni código nativo desde los builds compatibles; no requiere un
binario nuevo ni un despliegue Supabase.

| Canal              | Plataforma | Grupo OTA                              | Update                                 |
| ------------------ | ---------- | -------------------------------------- | -------------------------------------- |
| `production-smoke` | Android    | `e21d4d4e-6a4b-4053-9b46-c2deba8065de` | `01a121a3-f221-7073-a245-80f7a53935d5` |
| `production-smoke` | iOS        | `ab146b9a-d0a0-4388-afa1-76d2b979f930` | `01a121a5-45b9-7cd4-b16b-9099900ee0d1` |
| `production`       | Android    | `21352674-4d17-402b-bf39-5c97300551e2` | `01a121a6-8e6e-7744-adc9-173fd852cea4` |
| `production`       | iOS        | `e207f0c7-96f7-44ca-87c4-c1c7c2291fef` | `01a121a7-b83d-7736-a871-3a6884b4aee1` |

Los cuatro manifiestos respondieron HTTP 200 con los IDs, runtime y backend
esperados. El SHA256 de cada bundle descargado coincide con el manifiesto y con
la exportación conservada. Los bundles de producción y smoke coinciden por
plataforma. Última comprobación de producción: `2026-10-09T17:13:37.161Z`.

Publicación con EAS CLI 21.7.1 desde un worktree limpio fijado al SHA verificado,
Android e iOS por separado y con `.env` local deshabilitado. Se validaron las
variables reales de producción y que la fuente avanzara las OTA ya publicadas.
La credencial HTTPS disponible de GitHub sólo permite lectura y devolvió 403
al intentar lanzar el workflow; la publicación directa conservó sus controles
de CI, fuente, entorno y runtime.

Resultados, metadata, exportaciones, comprobaciones y recibos de uso:
`.tmp/contact-request-status-ota/` en el workspace principal. La consulta de uso
posterior reportó plan Free, 10 usuarios actualizadores, 74.3 MiB y coste
estimado de cero; los contadores pueden actualizarse con demora.

## Alcance de la verificación

No había un teléfono conectado ni un dispositivo iOS para verificar ejecución
física. Los recibos declaran `physicalDeviceVerified: false`; comprobar entrega
y hashes no sustituye probar el envío, apertura y cancelación de solicitudes
en el build instalado. No se crearon solicitudes de usuarios para esta entrega.
La comprobación de descarga verificó bundles, no cada asset individual.

Las exportaciones locales de preview compilaron, pero su validación del entorno
falló porque EAS no proporcionó la URL del backend de test. No se publicó una
OTA preview ni se contabilizaron esas exportaciones como QA funcional. La
publicación y verificación del canal smoke utilizaron su entorno de producción
configurado, manteniendo separados los destinos.

Los builds compatibles descargan al abrir con internet y aplican la OTA en un
arranque posterior. Los binarios 1.0.2 necesitan actualizarse desde la tienda.
