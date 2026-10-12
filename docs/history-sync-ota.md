# Historial local e incremental: preparación para OTA

Fecha de preparación: 11 de octubre de 2026. Este documento describe el cambio
y el orden de validación y despliegue; no acredita una publicación en Supabase
ni en EAS, ni la recepción de una OTA en dispositivos.

## Comportamiento

El móvil guarda las filas históricas y su cursor en SQLite, por usuario y
backend. La primera sincronización recupera el historial completo en páginas;
las siguientes reciben únicamente altas, cambios y eliminaciones posteriores
al cursor durable. Una reinstalación o una caché inválida repite la carga
inicial. El servidor conserva los originales.

Los saldos, relaciones activas, bandeja y pendientes continúan consultándose.
Las invitaciones cuyo estado base sigue pendiente también se consultan aunque
su estado efectivo sea `expired`: su vencimiento depende del reloj y puede
cambiar sin un `UPDATE` en la base de datos. Este caso no requiere escribir en
Supabase al leer la aplicación.

Un estado cerrado todavía puede recibir metadatos nuevos. Se sincronizan las
versiones y reemplazos de círculos, las decisiones de participantes, las
recompensas reclamadas y los cambios de perfiles autorizados. Por ejemplo,
eliminar una cuenta debe reemplazar su nombre y avatar históricos por el
perfil anonimizado aun cuando no exista una nueva transacción.

## Garantías del protocolo

- La solicitud añade `historySync: { protocol: 1, cursor: null | string,
pageSize?: number }`. La respuesta añade `historySync: { protocol: 1,
cursor: string, hasMore: boolean, reset: boolean, changes: [...] }`; cada
  cambio contiene `collection`, `key` y `row`, con `row: null` para retirar
  una clave. La página usa 250 cambios por defecto y admite hasta 500.
- Las colecciones son `financialRequests`, `history`, `friendshipInvites`,
  `friendshipInviteDeliveries`, `accountInvites`, `accountInviteDeliveries`,
  `settlementProposals`, `settlementParticipants`, `happyCircleScoreEvents`,
  `auditEvents` y `profiles`.
- El cursor combina un UUID de época y una revisión: `epochUUID:revision`.
  La revisión se ordena por usuario y por confirmación de la transacción;
  las fechas del dispositivo y `happened_at` no determinan el avance.
- El journal conserva el último estado por colección y clave. Un cambio de
  una clave ya enviada recibe una revisión nueva y vuelve a sincronizarse.
  Una eliminación o pérdida de visibilidad emite una marca de eliminación.
- La aplicación aplica cada página de forma idempotente. Repetir una página
  reemplaza la misma clave y no agrega otra copia del hecho.
- Las filas, el cursor y el último contexto dinámico se guardan en una sola
  operación SQLite. Un fallo de escritura no puede guardar un cursor que
  omita filas todavía no durables. Si después falla la caché de la pantalla,
  el arranque puede reconstruirla desde estos datos confirmados.
- La paginación continúa desde la última página confirmada. No se avanza hasta
  una revisión que aún no se ha guardado ni se descarta una página
  parcialmente fallida.
- Una época nueva invalida la materialización anterior. La respuesta se
  verifica contra la cuenta que inició la consulta, y la caché se separa por
  cuenta y URL del backend.
- El bloqueo por cuenta y backend cubre la consulta, la construcción del
  snapshot y las escrituras de cachés derivadas. Un refresco anterior lento
  no puede sobrescribir el snapshot offline de un refresco posterior.
- Los payloads de círculos mantienen la proyección existente para el usuario:
  movimientos y participantes visibles directamente, y conteos agregados del
  círculo. El journal no concede acceso a otros usuarios o a tokens de envío.

## Compatibilidad y orden de entrega

Este cambio reutiliza `expo-sqlite` y `expo-updates` ya integrados; no añade
módulos, permisos ni configuración nativa. Conserva el runtime
`hc-sdk54-20260928-1`. Un binario anterior a la habilitación de OTA requiere
actualizarse mediante la tienda, como explica el
[runbook de EAS Update](eas-update-runbook.md).

1. Aplicar y validar la migración en el proyecto de pruebas. La migración debe
   inicializar el journal con los registros anteriores sin límites de los
   antiguos snapshots y mantener el acceso al snapshot anterior.
   La migración preparada es
   `supabase/migrations/20261011170500_durable_history_sync.sql`.
2. Desplegar `get-app-snapshot` compatible con clientes anteriores y con el
   protocolo incremental. La aplicación anterior debe seguir recibiendo su
   respuesta completa.
3. Ejecutar las pruebas SQL, las pruebas del cliente y los checks del proyecto.
4. Publicar el mismo commit a `preview` mediante **EAS Mobile Update** y probar
   Android e iOS instalados, incluida persistencia real de SQLite.
5. Repetir migración y función en producción. Validar un cliente anterior y el
   canal `production-smoke` antes de entregar la OTA al canal `production`.
6. Conservar IDs de los grupos Android e iOS, commit, backend, canal y runtime.

Los proyectos y canales autorizados están definidos en
`apps/mobile/update-policy.json`; no se promueve un bundle de preview a
producción porque incorpora las variables del backend al exportarse.

## Matriz de verificación

| Caso                                                                | Resultado requerido                                                   |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Primera carga con más filas que una página y los límites anteriores | Todas las claves se recuperan, sin truncamiento.                      |
| Refresco sin cambios                                                | No se transfieren de nuevo los hechos históricos cerrados.            |
| Una nueva transacción o círculo cerrado                             | Aparece una vez; los hechos anteriores permanecen.                    |
| Página repetida o reintento después de fallo                        | Mismas claves y contenido final, sin duplicados.                      |
| Fallo de red o cierre después de una página                         | Se conserva el cursor durable y se reanuda la siguiente página.       |
| Fallo de SQLite al guardar                                          | No avanza el cursor y el reintento recupera la página.                |
| Fallo de caché de pantalla después de guardar SQLite                | Se reconstruye la pantalla desde el contexto y el historial durables. |
| Pendiente aceptado, rechazado o reemplazado                         | Sale de pendientes y queda con el estado final en el historial.       |
| Recompensa reclamada o vínculo de reemplazo actualizado             | Se actualiza la clave existente.                                      |
| Invitación vence sin escritura en el servidor                       | Se muestra vencida mediante la consulta dinámica.                     |
| Cambio de nombre, avatar o anonimización de cuenta                  | El perfil histórico se actualiza con permisos vigentes.               |
| Cambio de cuenta o backend durante la consulta                      | No se incorporan filas ni cursor a otra cuenta o backend.             |
| Caché corrupta, época nueva o reinstalación                         | Carga inicial segura, sin reutilizar un cursor huérfano.              |
| Escrituras concurrentes y cambios entre páginas                     | No se salta una confirmación tardía ni una clave desplazada.          |
| Eliminación o pérdida de permiso                                    | Se retira la clave local y no vuelve por un reintento antiguo.        |
| Arranque sin red después de sincronizar                             | El último historial confirmado sigue disponible.                      |
| Cliente anterior después del despliegue de backend                  | Conserva el contrato del snapshot anterior.                           |

La recepción OTA y la persistencia nativa se verifican en builds instalados;
Metro y mocks de SQLite no sustituyen esa evidencia.

## Reversión

Revertir la OTA con los pasos del runbook de EAS si falla el cliente. Mantener
la migración aditiva y el contrato anterior de `get-app-snapshot` permite volver
al bundle anterior sin retirar datos. No borrar el journal ni la caché como
parte de una reversión rutinaria. Una reversión de EAS no revierte migraciones
de Supabase y llega después de que el dispositivo vuelva a tener conexión.

## Evidencia local

Las verificaciones de preparación incluyen:

- `pnpm test`: 153 archivos y 1.160 pruebas aprobados. `pnpm lint`,
  `pnpm typecheck` y `pnpm security:check` también pasan.
- La función `get-app-snapshot` pasa `deno check` con sus dependencias reales.
- `pnpm check:eas-update`: siete pruebas y configuración aprobadas para
  `hc-sdk54-20260928-1`.
- Caché SQLite: 18 pruebas, incluida reapertura de un archivo de base de datos
  real, aislamiento por cuenta y backend, escritura fallida con rollback y
  reintento, y acceso concurrente a la caché.
- Pipeline de consulta: cinco pruebas con el bloqueo web real; verifican
  identidad en cada página, aislamiento de backend, serialización hasta las
  escrituras derivadas y cambio de cuenta durante la derivación. La prueba de
  reconstrucción usa `buildLiveSnapshot` real: una solicitud aceptada y su
  movimiento conservan los tres eventos de timeline y una sola copia del
  movimiento después de fallar la escritura de la pantalla.
- PGlite aplicó las 94 migraciones y el seed demo. Las 33 pruebas SQL (`00`
  a `32`) pasaron usando las funciones, vistas, tablas, triggers y
  restricciones de negocio del repositorio. La prueba nueva comprueba un
  bootstrap de 320 registros en páginas de 37, cambios sobre hechos con
  fechas antiguas, tombstones, transición entre cerrado y activo, perfiles
  retirados sin futuras filtraciones y privacidad de círculos. También
  verifica que un fallo de journal revierta la mutación original, y el
  manejo de época, cursores inválidos y permisos de la función.
- Una ejecución adicional cargó el seed antes de la migración nueva y
  contrastó, por cada usuario, las fuentes completas con el journal. Conservó
  el corpus previo: 16 solicitudes, 40 filas de historial, cuatro círculos,
  12 participantes, cuatro premios, 28 eventos de auditoría y 13 perfiles.
- Los exports Android e iOS con Hermes terminaron, cada bundle de 7,08 MB,
  con el runtime existente. No se publicó ningún grupo EAS Update.

PGlite usa infraestructura de prueba para `auth`, `storage` y `realtime`.
Registra los broadcasts en una tabla, sin entrega de red. Sustituye la
instalación de `pgcrypto` por SHA nativo y HMAC-SHA256 SQL contrastado con
Node; los bytes aleatorios provienen de UUID y el cifrado de contraseñas es
un sustituto de prueba, por lo que no valida inicio de sesión real. No
ejecuta las ramas de servicios gestionados `cron`, `net` y `vault` ausentes.

La evidencia local usa una sola conexión PGlite; no acredita concurrencia
entre sesiones de PostgreSQL, un despliegue de Supabase ni persistencia o
recepción OTA en dispositivos instalados. Esas verificaciones se completan
en el proyecto de pruebas y los builds preview antes de producción.
