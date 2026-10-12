# Historial local e incremental: preparación para OTA

Preparación local: 11 de octubre de 2026. Entrega en producción: 12 de octubre
de 2026. El registro de entrega al final distingue las publicaciones y pruebas
completadas de las verificaciones nativas que todavía están pendientes.

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

La evidencia local usa una sola conexión PGlite. Las pruebas remotas y la
recepción de OTA realizadas después se registran a continuación; las pruebas
locales por sí solas no acreditan ejecución en dispositivos.

## Entrega del 12 de octubre de 2026

Fuente publicada: `753359ca2e73fc75bc7a4530fccbb292169347f8`.
[Security CI 38263691659](https://github.com/happy-circles/Happy-circles/actions/runs/38263691659)
pasó completo, incluida la suite de Supabase con el reporte TAP corregido.

Supabase de producción `vknfhyfdtlvvfzptpqpj` tiene la migración
`20261011170500` y su entrada de historial confirmadas en la misma transacción:
94 migraciones en total. El backfill inicial materializó 1.953 filas en las
11 colecciones. Las comparaciones de claves y payloads con las fuentes,
la privacidad, los permisos y la paginación pasaron tanto en el preflight
revertido como después del commit. `get-app-snapshot` quedó en versión 11,
`ACTIVE`, con verificación JWT habilitada.

La prueba de concurrencia usó sesiones PostgreSQL reales mediante HTTPS.
La segunda sesión esperó el bloqueo del contador mientras otra lectura no
vio filas sin confirmar. Ambas escrituras sintéticas, limitadas al journal
privado, hicieron rollback: el contador y las filas quedaron iguales al
estado inicial. El RPC está registrado en la API y rechaza acceso anónimo
con SQLSTATE `42501`; el snapshot sin sesión devuelve HTTP 401. Advisors no
reportaron nuevas alertas bloqueantes relevantes para este cambio.

Se publicó mediante EAS CLI 21.7.1 local, conservando las guardas de fuente
limpia, SHA exacto, CI aprobado, runtime, entorno y backend del workflow.
El acceso GitHub disponible permite lectura de Actions; el entorno preview
carece de URL y builds compatibles, y el acceso Supabase actual no incluye
el proyecto de pruebas. La comprobación previa usó `production-smoke`.

| Canal            | Plataforma | Grupo publicado                        | Update ID                              |
| ---------------- | ---------- | -------------------------------------- | -------------------------------------- |
| production-smoke | Android    | `98348ae8-c4f7-489d-bcaf-9e58f111d8b1` | `01a13090-1991-707e-b5d2-d40f678f8ed0` |
| production       | Android    | `5739ca11-ebfa-4c58-9c0d-05c9a7b3e0b0` | `01a1309d-9242-7423-ac43-0123b3044104` |
| production       | iOS        | `13648e2b-4325-4315-a956-0bb8eb79745b` | `01a1309f-763c-7274-81e9-5e3eefc85cac` |

Los tres manifiestos servidos y bundles del CDN coinciden con los resultados
y exports del mismo commit, runtime `hc-sdk54-20260928-1` y backend de
producción. El bundle Android de producción es idéntico al de smoke.
SHA-256 base64url de Android: `rr6mKIKnXxUzTvSsd3AKiomQPU4r5komKezWlkV3iDk`;
de iOS: `I_YgmSnUyK81aESbJwqDW76T8Eew_p8S_lP7K5OoeVA`.

El APK Android smoke 1.0.3 (23), con firma y hash comprobados, recibió el
update exacto por Expo Updates en un clon temporal del emulador. Lo ejecutó
al reabrir con red y luego sin ninguna red, con cero fallos y sin Metro.
El entorno de pruebas necesitó una CA ya confiada por Windows para el
antivirus local: la verificación TLS permaneció activa y el overlay se
descartó al cerrar el clon. El AVD original y la confianza del host quedaron
intactos.

La ejecución nativa fue sin sesión. Falta comprobar el historial dentro de
la app instalada con una cuenta QA vigente: las contraseñas de Ana y Bruno
del seed fueron rechazadas. Tampoco hubo un iPhone/iPad disponible. No se
representan esas pruebas como completadas ni se cambiaron las contraseñas
o datos financieros de las cuentas para obtenerlas.

Recibos sanitizados y exports están en
`.tmp/history-sync-release-20261012/`; las pruebas y entrega del backend en
`.tmp/history-db-remote/`. Para una reversión, los grupos anteriores de
producción son Android `d6609b5e-f096-4639-ab6a-6eb18a31fe41` e iOS
`1ee0ddd6-3231-4cbb-9801-ba46286eb062`. Consultar los grupos actuales y seguir
el runbook antes de ejecutar una reversión.
