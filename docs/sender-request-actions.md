# Corregir y cancelar solicitudes pendientes enviadas

Implementación y entrega: 12 de octubre de 2026. Backend y OTA de producción
para Android e iOS publicados. Ver el
[registro de entrega](sender-request-release-2026-10-12.md).

## Comportamiento

El autor de la propuesta pendiente puede corregirla o cancelarla mientras
la otra persona no la haya resuelto. La corrección del remitente se limita a
solicitudes `balance_increase`; una solicitud pendiente de reversión de un
movimiento se puede cancelar, pero no corregir por este camino. Corregir
conserva autor, destinatario,
deudor, acreedor, moneda y movimiento de referencia; crea una versión nueva
con el monto, concepto y categoría corregidos. La versión anterior permanece
en la trayectoria con estado `amended`. No se modifica un hecho aceptado ni
se elimina su historial.

Desde el 13 de octubre de 2026, la creación, aceptación y contrapropuesta de
reversos están bloqueadas en producción. Los registros históricos conservan
su representación; cancelar o rechazar un reverso pendiente antiguo sigue
permitido. Ver el [registro de verificación](verification/transaction-reversal-retirement-20261013.json).

Cancelar cambia la propuesta pendiente a `canceled`. Desaparece de pendientes
para ambas personas y conserva la cancelación en sus historiales. Ninguna
de estas dos acciones cambia los saldos ni escribe un movimiento en el ledger.

La contrapropuesta del destinatario conserva su funcionamiento: crea otra
versión y cambia quién propone y quién debe responder. Después de una
contrapropuesta, las acciones del remitente pertenecen al autor de esa versión
pendiente; no se conceden al autor inicial por ser dueño del primer paso.

## Confirmación y concurrencia

El ID que se confirma es el ID visto al abrir la acción. Si la propuesta fue
aceptada, rechazada, corregida, contrapropuesta o cancelada entretanto, la
acción pierde vigencia. El cliente actualiza el estado y presenta el conflicto;
no busca automáticamente la versión nueva para volver a ejecutar la intención.

Los comandos y las decisiones anteriores deben coordinarse con el bloqueo
de la misma fila pendiente. Sólo una acción puede resolver esa versión:

- Si aceptar gana, existe un solo movimiento confirmado. Corregir o cancelar
  esa versión falla y no cambia el movimiento aceptado.
- Si corregir gana, la versión anterior queda cerrada y existe una sola
  versión pendiente nueva. Una aceptación de la versión anterior falla.
- Si cancelar gana, no existe un movimiento financiero ni una versión nueva.
  Una aceptación o contrapropuesta posterior de ese ID falla.
- Repetir una intención confirmada con la misma clave idempotente devuelve
  su resultado y no crea otra versión, cancelación o movimiento.

La validación en el dispositivo orienta la interfaz; la autoridad del actor,
la vigencia del ID y el estado pendiente se comprueban también en el servidor.
Las decisiones de clientes anteriores quedan sujetas al mismo estado vigente.

`expectedVersion` permite comprobar la versión que vio el cliente. Los
comandos `correct-financial-request` y `cancel-financial-request` conservan
su clave idempotente y reciben filas canónicas en `financialRequests`, incluso
al recuperar un resultado previamente confirmado. `request_case_id` y
`version_number` identifican la trayectoria; `amendment_kind` identifica el
origen de esa versión y no se sobrescribe al resolverla. `resolved_by_user_id`
atribuye la acción terminal. Una cancelación antigua sin actor comprobable
mantiene una descripción genérica.

## Caché e historial

Los cambios cerrados llegan por el journal incremental del historial ya
existente. La aplicación conserva el cursor y las claves anteriores; repetir
una página no duplica versiones. El caso relaciona las versiones por su
parentesco y conserva el mismo origen en la trayectoria, incluso después de
más de veinte correcciones o contrapropuestas.

El refresco de una acción incluye snapshot y resumen de personas. Cuando una
acción ya fue confirmada, un fallo posterior de refresco o persistencia no
debe restaurar el pendiente anterior desde una caché derivada o desde el
contexto dinámico guardado con el historial. El contexto dinámico tiene
prioridad durante la mezcla y debe reconciliarse con el cambio confirmado.

La confirmación se guarda primero en el contexto raw y reconstruye ambas
cachés derivadas. Si falla esa escritura pero la caché de pantalla funciona,
esta conserva un overlay de filas canónicas ligado al backend. El arranque
aplica ese overlay sin avanzar el cursor y rechaza filas de otra cuenta o
backend, versiones anteriores y pendientes que ya estén cerrados. Las
confirmaciones se acumulan desde memoria y disco hasta quedar durables en
el contexto raw. Si fallan todas las escrituras, la sesión conserva la
confirmación en memoria; recuperar esa confirmación después de cerrar la app
requiere una escritura posterior exitosa o volver a consultar el servidor.

Cambiar de cuenta durante la confirmación no puede ejecutar la acción como
la cuenta nueva ni guardar su resultado bajo otra cuenta o backend.

## Matriz de verificación

| Caso                                                           | Resultado requerido                                                                     |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Autor corrige monto, concepto o categoría                      | Una versión nueva pendiente; anteriores conservadas; mismas personas y dirección.       |
| Destinatario contrapropone                                     | Autor y destinatario de la versión nueva se invierten; no cambia el sentido financiero. |
| Autor cancela                                                  | Sin pendiente para ninguna persona; cancelación visible; saldos sin cambios.            |
| Otro actor o destinatario intenta acción de autor              | Rechazo del servidor, sin versión ni cambio de estado.                                  |
| Aceptar compite con corregir o cancelar                        | Un ganador; ledger con cero o un movimiento, según el ganador.                          |
| Contrapropuesta compite con corrección o cancelación           | Un ganador y como máximo una versión pendiente por caso.                                |
| Dos correcciones simultáneas del mismo ID                      | Una versión nueva; el segundo intento recibe conflicto.                                 |
| Reintento con la misma clave                                   | Mismos IDs y resultado; sin versiones duplicadas.                                       |
| Respuesta perdida y posterior conflicto                        | Refresco del estado vigente; no se reaplica sobre un ID nuevo.                          |
| Fallo de refresco después del éxito                            | No reaparece el pendiente anterior al abrir sin red.                                    |
| Delta o respuesta repetida                                     | Cada versión y evento terminal aparecen una vez.                                        |
| Más de veinte versiones y datos corruptos con un ciclo         | Trayectoria completa válida y terminación segura ante un ciclo.                         |
| Cambio de cuenta o sesión durante la confirmación              | No se envía ni cachea una acción para otra cuenta.                                      |
| Monto inválido, categoría reservada o campos de actor enviados | Validación rechaza la acción antes de cualquier cambio.                                 |

## Evidencia

- Veinte pruebas de schemas: monto, concepto, categoría reservada, versión,
  compatibilidad de contratos anteriores y exclusión de campos de actor o
  dirección financiera del payload.
- Seis pruebas de builders e historial: 25 versiones completas, caso canónico
  sin ancestro cargado, ciclo corrupto, autor actual y contrapropuesta,
  atribución de cancelación y reenvío de páginas del journal sin duplicados.
- Veinte pruebas del helper de confirmación: persistencia raw antes de
  las cachés derivadas, reconstrucción offline, overlay después de fallo de
  escritura raw, acumulación en memoria y disco, respuestas retrasadas,
  aislamiento de cuenta y backend, fallback con bootstrap incompleto y
  conservación de la versión nueva pendiente y del historial previo. Ejecutan
  el plan de hidratación real que usa el provider, incluida la exclusión de
  snapshots de otro backend.
- Quince regresiones Edge validan los comandos y sus respuestas, incluida
  la respuesta de conflicto HTTP. Las 34 pruebas SQL (`00` a `33`) pasaron
  contra las 95 migraciones y el seed del repositorio en PostgreSQL real.
  La infraestructura de Auth, Storage y Realtime usa fixtures locales;
  `pgcrypto` es real. Esta evidencia cubre funciones, triggers, restricciones
  y bloqueos de negocio, y no sustituye una prueba del servidor Auth alojado
  ni de la entrega de eventos de red.
- [Recibo de 25 carreras en PostgreSQL 17.11](verification/sender-request-concurrency-20261012.json):
  dos conexiones de acciones probaron ambos órdenes entre aceptar, rechazar,
  contrapropuesta, corregir y cancelar, además de acciones iguales. En cada
  carrera se observó el bloqueo de la segunda transacción; después recibió
  conflicto y quedaron cero o una propuesta pendiente y cero o un movimiento
  en el ledger, según el ganador.

La [verificación final del backend](verification/sender-request-backend-20261012.json)
se ejecutó en una base local limpia: seed y casos antiguos antes de la migración
95, incluidos cancelaciones sin actor comprobable y contrapropuestas. Se
conservaron sus versiones, participantes e historial.

La aceptación refresca los metadatos finales del movimiento en el journal de
ambas personas. La prueba SQL incluye aceptar una corrección, conservar su
origen y devolver una sola fila por clave en el delta. El backfill también
refresca movimientos de círculos sin solicitud de origen y limita cada lectura
a los dueños o contrapartes del ledger. La
[comprobación de coherencia](verification/sender-request-journal-20261012.json)
verificó filas autoritativas, copias y páginas del journal sin diferencias ni
duplicados. Las definiciones anteriores con CRLF también pasaron la migración.

La suite completa pasó: 159 archivos y 1.233 pruebas, incluidos los límites
de arquitectura. Lint, typecheck, seguridad y los siete checks de EAS Update
pasaron. Los exports finales de Android e iOS se generaron con el environment
production y `hc-sdk54-20260928-1`, sin cambios de dependencias o configuración
nativa. Por tanto, esta implementación no requiere otro envío a las tiendas.

## Orden de entrega

1. Validar y aplicar primero
   `supabase/migrations/20261012172020_sender_pending_request_controls.sql`.
   La migración verifica cadenas anteriores y conserva la compatibilidad de
   las decisiones existentes; no reescribe silenciosamente un caso inválido.
2. Desplegar ambos endpoints nuevos y la proyección de snapshot/historial que
   incluye la metadata de versiones. Comprobar un cliente anterior y los
   comandos nuevos antes de entregar la interfaz móvil.
3. Pasar Security CI para el SHA definitivo, comprobar runtime y environment
   real, y exportar Android e iOS desde esa fuente limpia.
4. Probar el canal smoke y después publicar la OTA de producción siguiendo
   [el runbook existente](eas-update-runbook.md). Conservar los IDs y comprobar
   manifiestos y recepción por plataforma.

La migración y las seis funciones quedaron desplegadas en producción. Las OTA
de Android e iOS se verificaron contra sus manifiestos y bundles servidos; el
clon Android recibió y abrió la actualización online y offline. El registro
de entrega conserva IDs y distingue esta prueba de una sesión autenticada o
de una prueba en iPhone físico.
