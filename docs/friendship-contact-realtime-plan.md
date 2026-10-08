# Plan: amistades, contactos actualizados y EAS Update

Fecha: 2026-09-28.
Estado: implementación en el repositorio y validación automatizada local completadas; publicación
remota y distribución móvil pendientes. Ver
[evidencia y despliegue](friendship-contact-realtime-validation.md).

## Resultado esperado

Enviar, cancelar, rechazar y volver a enviar debe producir el mismo estado en
contactos, solicitudes, historial y en el teléfono de la otra persona. Cuando
un contacto tenga una cuenta activa y disponible para conectar, debe mostrar
**Agregar** y aparecer al principio sin necesidad de reiniciar la app.

Decisión confirmada por el usuario: **se permite enviar una nueva solicitud
inmediatamente después de un rechazo**, igual que después de cancelar una
solicitud propia. No habrá una espera de 24 horas por rechazo. Se mantienen la
deduplicación de pulsaciones y los límites técnicos de uso.

La entrega reúne las correcciones y EAS Update en una próxima versión de tienda
para Android e iOS. Las compilaciones de pruebas son adicionales; no se promete
que baste un único build para todo el proceso.

## Evidencia y alcance

- `contacts-sheet-helpers.ts`: el orden de Agregar primero ya existe. El resultado
  `no_account` dura 30 días en SQLite y cualquier resultado en memoria evita
  nuevas consultas automáticas.
- `client.ts`: las mutaciones invalidan snapshot y people overview, pero no las
  resoluciones de contactos por teléfono.
- `dashboard-helpers.ts`: reenviar excluye solicitudes canceladas y rechazadas.
- `resolve_people_targets` y `create_people_outreach`: comprueban pendientes
  internas sin comprobar su vencimiento.
- El recordatorio interno reutiliza la invitación; su push usa una clave fija
  que descarta recordatorios posteriores como duplicados.
- Realtime de perfiles informa al propietario y sus amistades activas; todavía
  no permite descubrir una cuenta nueva de un contacto sin relación previa.
- `resolve-people-targets` comparte las cuotas de invitaciones: 10 llamadas por
  minuto y 100 por hora. El cliente consulta hasta 60 teléfonos por llamada.
- No está instalado `expo-updates`; Android versionado desactiva updates.

Los hallazgos proceden del código local. Antes de implementar migraciones se
debe contrastar el estado desplegado de funciones, índices y migraciones.
Las 62 pruebas ejecutadas durante el diagnóstico pasaron, pero no cubren el
ciclo completo que se agrega en este plan.

## 1. Contrato de comportamiento

| Situación actual                                | Acción principal                  | Resultado                                                            |
| ----------------------------------------------- | --------------------------------- | -------------------------------------------------------------------- |
| Estado aún no comprobado                        | Verificando / Consultar           | No afirmar que carece de cuenta antes de consultar                   |
| Cuenta activa, sin amistad ni solicitud vigente | Agregar                           | Crear una solicitud y mostrarla pendiente                            |
| Solicitud enviada vigente                       | Ver solicitud                     | Ofrecer cancelar y recordar; no duplicarla                           |
| Solicitud recibida vigente                      | Responder                         | Aceptar o rechazar la solicitud existente                            |
| Solicitud cancelada, rechazada o vencida        | Enviar de nuevo                   | Crear otra solicitud con otro identificador y conservar el historial |
| Amistad aceptada                                | Agregado                          | Mantener una única relación activa                                   |
| Sin cuenta reconocida                           | Invitar                           | Preparar acceso y compartir el enlace                                |
| Acceso pendiente de activación                  | Ver invitación / Compartir enlace | Usar el flujo de acceso, separado del de amistad                     |

Reglas complementarias:

- El orden de la agenda será: Agregar, solicitudes pendientes, Agregado y
  contactos por invitar. Dentro de cada grupo se conserva orden por nombre.
- Una cuenta registrada pero aún sin acceso activo no se presenta como lista
  para agregar. Se preservan las reglas actuales de identidad telefónica.
- Una solicitud entrante no puede quedar escondida bajo un botón Pendiente
  deshabilitado. La respuesta del resolver incorporará la dirección y acciones
  disponibles mediante campos compatibles con clientes antiguos.
- Reenviar una invitación de acceso vuelve a comprobar si la persona ya activó
  su cuenta; en ese caso continúa por amistad, sin emitir otro acceso inútil.
- La acción que únicamente cierra un enlace se llamará **Ahora no**. Rechazar es
  una operación explícita del destinatario autenticado y autorizado. Abrir un
  QR o enlace reenviado no debe permitir a cualquier visitante cancelar la
  invitación de otra persona.
- Cerrar el panel de compartir deja el enlace preparado. No se afirmará que
  WhatsApp lo entregó. Compartir, preparar un enlace y cancelar la solicitud
  tendrán textos distintos.
- Cancelar después de que se haya aceptado no elimina la amistad: devuelve el
  estado vigente y actualiza la pantalla. Eliminar amistades queda fuera del
  alcance de esta corrección.
- Las invitaciones de acceso mantienen sus reglas de activación: cancelar una
  amistad o reenviar un enlace no desactiva cuentas, revierte registros ni
  elimina relaciones ya creadas.

## 2. Corregir el ciclo en Supabase

1. Unificar la comprobación del estado efectivo y el vencimiento en creación,
   resolución de contactos, previews, respuestas y reenvío.
2. Mantener una única amistad y una única solicitud interna abierta por pareja,
   también si ambas personas envían al mismo tiempo. Serializar operaciones
   relacionadas y usar un orden uniforme de bloqueos entre invitación y entrega.
3. Cancelar de forma atómica, revocar los enlaces utilizables y emitir el cambio
   para los participantes. Repetir la misma cancelación debe ser recuperable.
4. Una nueva intención tras cancelación, rechazo o vencimiento obtiene otro ID.
   Un reintento por fallo de red conserva la clave de idempotencia de la misma
   operación y devuelve el resultado previo sin crear duplicados.
5. Implementar un comando de recordatorio distinto de crear. Registrar cada
   recordatorio permitido, deduplicar sus reintentos y devolver un resultado
   explícito. Propuesta inicial: mínimo 60 segundos entre recordatorios de la
   misma solicitud, independiente de reenviar después de un rechazo.
6. Encolar avisos también cuando la solicitud nace desde contactos. Al cancelar
   o resolver una solicitud, descartar avisos pendientes obsoletos y revalidar
   su estado antes de enviarlos. Un push ya entregado al proveedor puede llegar
   tarde; al abrirlo se consultará el estado actual y no permitirá aceptar lo
   cancelado.
7. Conservar los contratos usados por la app instalada: migraciones aditivas y
   endpoints actuales disponibles. Los nuevos clientes usan los nuevos campos
   y comandos; los antiguos siguen funcionando durante la transición.
   El endpoint anterior reconocerá el contexto de recordatorio existente
   `invite_requests_resend_pending` y lo dirigirá a la operación real de
   recordatorio, conservando una respuesta compatible.

Prueba de salida de esta etapa: crear → cancelar → comprobar enlace revocado →
crear nuevamente, y crear → rechazar → crear nuevamente, con IDs distintos y
sin solicitudes duplicadas.

## 3. Un estado compartido de contactos en la app

Crear un servicio de resolución por usuario y teléfono normalizado. Memoria,
SQLite y las pantallas consumirán el mismo contrato, con `resolvedAt`, estado y
versión de invalidación. La agenda del dispositivo seguirá siendo un índice
separado: el nombre guardado y la pertenencia a Happy Circles cambian por causas
diferentes.

- Mostrar el dato guardado mientras se revalida en segundo plano. Conservar
  fechas también en memoria; no basta con reducir el TTL de SQLite.
- Propuesta inicial de frescura: 30 segundos para pendientes y 60 segundos para
  el resto mientras la agenda está visible. La caducidad provoca una consulta
  programada; no borra las filas ni promete consultar toda la agenda al instante.
- Revalidar al abrir la pantalla, volver a primer plano, recuperar conexión y
  pulsar Actualizar. El refresco manual actualizará agenda y estados de HC.
- Después de una mutación confirmada, actualizar el contacto afectado en
  memoria y persistencia e invalidar solicitudes/previews relacionados. Ante
  un fallo confirmado, restaurar el estado coherente y ofrecer reintento. Un
  timeout deja el resultado indeterminado: consultar o reintentar con la misma
  clave antes de decidir si corresponde restaurar; la operación pudo haberse
  completado en servidor aunque no llegara la respuesta.
- Mantener correspondencias de usuario/invitación a sus teléfonos conocidos
  para actualizar todas las entradas de agenda afectadas. Las amistades creadas
  directamente por usuario se actualizan por ese ID, sin inventar un teléfono.
- Versionar o retirar las entradas antiguas de resolución para que el primer
  arranque corregido no arrastre los 30 días de respuestas anteriores.
- Una respuesta que comenzó antes de cancelar no puede sobrescribir el estado
  posterior: usar generaciones por contacto/consulta y descarte de respuestas
  antiguas, también en escrituras a SQLite y cambios de cuenta.
- Actualizar el botón y el orden al recibir el nuevo estado; claves de fila
  estables, preservación de scroll y actualización agrupada para evitar saltos.
- Revisar todos los números de cada contacto, deduplicar formatos equivalentes
  y no confundir varias entradas de agenda con distintas personas en HC.
- El índice de agenda usará su fecha de lectura y las señales disponibles del
  dispositivo para detectar contactos nuevos; refresco explícito como respaldo.

Archivos principales: `add-person-contact-resolution-*`,
`people-target-resolution-cache.ts`, `add-person-contact-scan-cache.ts`,
`add-person-contact-index.ts`, `contacts-sheet-helpers.ts`, mutaciones de
invitaciones y `snapshot-realtime.ts`.

## 4. Descubrimiento en tiempo real y presupuesto de consultas

Usar los eventos actuales de invitaciones/relaciones para refrescar contactos
afectados. Agregar un evento privado de descubrimiento para números que todavía
no tienen una relación con el usuario.

Diseño propuesto:

1. Conectar el canal privado del usuario y esperar suscripción confirmada.
2. Registrar observaciones temporales de los números consultados, comenzando
   por visibles y luego por la agenda indexada en lotes.
3. Resolver su estado inicial después del registro. Así, el alta de una cuenta
   durante la apertura no queda entre la lectura inicial y la suscripción.
4. Al cambiar la elegibilidad o el teléfono de un perfil, notificar solo a los
   observadores correspondientes con identificadores opacos de contactos a
   revalidar. Cubrir tanto la identidad anterior como la nueva.
5. Reconsultar los afectados y actualizar botón/posición. Al reconectar,
   reconstruir observaciones y revalidar para recuperar eventos perdidos.

Las observaciones se almacenarán en esquema privado con identificadores
derivados mediante HMAC calculado exclusivamente en servidor, propietario y
vencimiento. Propuesta: arrendamiento de 15 minutos, renovación cada 5 minutos
mientras la pantalla esté activa y limpieza por TTL. El cierre cancela lo
posible; la expiración cubre cierres forzados. El HMAC no sale del servidor: los
eventos llevan IDs opacos de observación asociados al propietario. Registrar,
renovar y cancelar observaciones exige comprobar esa propiedad. No se publican
teléfonos o perfiles en canales globales. Mantener los controles de identidad
existentes.

Separar la cuota de **consultar contactos** de la de **enviar invitaciones**.
Validar también el máximo de 60 números en servidor. Fijar la cuota final de
lectura tras medir agendas de 1.000 y 10.000 números; el límite actual de 100
llamadas/hora ni siquiera permite un barrido de 10.000 números (167 llamadas).

Una cola por sesión contabilizará consultas manuales, eventos y segundo plano:
prioridad a acciones del usuario y cambios puntuales, luego visibles y finalmente
el resto de la agenda. Respetar cuotas, reservar capacidad para interacción,
agrupar eventos y retroceder ante 429. La comprobación periódica de respaldo
solo funciona con pantalla activa, conectividad y presupuesto disponible.
Evitar barridos completos repetidos cada pocos segundos.

Objetivos medibles, sujetos a validación con red saludable:

- Tras recibir una respuesta exitosa de cancelar/aceptar/enviar, reflejarla en
  la agenda local en menos de 1 segundo, sin cerrar la pantalla.
- Para un contacto ya observado, objetivo p95 de 3 segundos desde el cambio
  confirmado de elegibilidad hasta ver Agregar en el otro cliente conectado.
- Medir aparte la primera exploración de una agenda desconocida. No prometer
  descubrimiento instantáneo de miles de contactos antes de haberlos consultado.
- Si falta red, conservar lo visible, indicar que no está actualizado y no
  presentar una mutación como completada antes de la confirmación del servidor.

EAS Update no transporta estos eventos: el estado de contactos usa Supabase
Realtime. EAS Update sirve para distribuir nuevas versiones del código.

## 5. Preparar EAS Update y la nueva versión

- Instalar la versión de `expo-updates` compatible con Expo SDK 54 y configurar
  URL del proyecto, canales y versión de compatibilidad nativa (`runtimeVersion`).
- Android está versionado en el repositorio: actualizar y verificar su
  configuración nativa, además de `app.config.ts`. iOS se genera a partir de la
  configuración. Evitar regeneraciones destructivas del proyecto Android.
- Elegir un identificador explícito de runtime para esta versión y comprobar
  que app config y binarios coinciden. Cualquier cambio nativo incompatible
  requerirá otro runtime y otra compilación; una corrección JS compatible no.
- Canal/environment `preview` usa Supabase test/demo; `production` usa
  producción. Publicar con entorno explícito: en SDK 54 omitirlo puede incorporar
  variables locales. No republicar a producción un bundle preparado con la URL
  de pruebas. Definir igualmente el canal del APK de smoke de producción.
- Descargar updates en segundo plano y aplicarlos en un siguiente arranque
  seguro. No forzar una recarga mientras se envía una solicitud o se registra un
  movimiento. El binario debe arrancar también sin conexión a EAS.
- Agregar un flujo de publicación OTA que compruebe pruebas, commit, entorno,
  runtime y canal, y documentar cómo volver a la actualización anterior o al
  código incluido en el binario.
- Validar recepción de una actualización real en un build preview instalado de
  Android y de iOS; Expo Go o Metro no sustituyen esta prueba.
- La primera distribución con estas mejoras requiere instalar una nueva versión
  por plataforma. Las versiones antiguas sin `expo-updates` no recibirán OTA.

Presupuesto de partida: plan Free de EAS, publicado actualmente con 1.000
instalaciones que descargan updates por mes, 100 GiB de transferencia mensual y
20 GiB de almacenamiento. Comprobar uso agregado de la cuenta antes de publicar.
No contratar planes ni extras como parte de esta implementación. Si se agota
la cuota, preservar el funcionamiento del binario instalado y decidir la siguiente
distribución con el uso real; no depender de OTA para el funcionamiento diario.

## 6. Pruebas y condiciones de entrega

| Prueba                                 | Debe demostrar                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Enviar, cancelar y enviar otra vez     | Estado correcto en todas las pantallas, nuevo ID y enlace anterior inutilizable                                     |
| Rechazar y reenviar inmediatamente     | Sin espera por rechazo, historial conservado, una sola solicitud nueva                                              |
| Vencimiento                            | Contactos, lista, enlace y servidor coinciden; se puede enviar nuevamente                                           |
| Doble toque y timeout con reintento    | Un solo resultado por intención, sin duplicados                                                                     |
| Envíos cruzados                        | Ambos clientes ven la solicitud vigente y pueden responder correctamente                                            |
| Cancelar mientras el otro abre/acepta  | Un resultado terminal coherente; no amistad a medias ni bloqueos cruzados                                           |
| Recordatorio                           | Nuevo evento permitido, reintento deduplicado y mensaje que no promete entrega push                                 |
| Aviso retrasado tras cancelación       | Se descarta si sigue en cola; al abrir uno ya entregado se ve el estado actual                                      |
| Registro/activación con agenda abierta | Invitar cambia a Agregar y asciende en el otro dispositivo                                                          |
| Alta durante suscripción inicial       | No se pierde el cambio entre observar y consultar                                                                   |
| Pérdida de conexión/segundo plano      | Al volver se recuperan cambios aunque no llegara el evento                                                          |
| Caché antigua y cambio de cuenta       | No reaparecen pendientes viejos ni datos del usuario anterior                                                       |
| Contactos repetidos/múltiples números  | Persona y acción correctas, sin invitaciones duplicadas                                                             |
| Agenda de 1.000/10.000 números         | Interfaz utilizable, presupuesto respetado y descubrimiento fuera de la primera página                              |
| Realtime privado                       | Un usuario no accede a observaciones ajenas; si ambos observan el mismo contacto, cada uno recibe su aviso legítimo |
| Acceso ya reclamado                    | Conserva las restricciones de activación; reenviar no cancela ni recrea cuentas o accesos reclamados                |
| Actualización OTA y reversión          | Canal/runtime/entorno correctos y arranque funcional sin red                                                        |
| App anterior contra backend nuevo      | Contratos compatibles durante la adopción de la nueva app                                                           |

Combinar pruebas unitarias significativas, SQL transaccional, concurrencia y
pruebas en dos dispositivos/cuentas. Medir latencia y frecuencia de consultas
sin registrar teléfonos, tokens o agendas en logs.

Condición previa: el runbook de test/demo documenta una compatibilidad histórica
sin envío real de Realtime. Inspeccionar funciones y políticas desplegadas y
demostrar recepción real entre clientes antes de usar ese entorno para aprobar
las pruebas. Docker local no estuvo disponible durante el diagnóstico; usarlo
cuando esté operativo o ejecutar los SQL tests en CI, sin confundir esas pruebas
con la entrega de eventos en dispositivos.

Ejecutar los checks establecidos por el repositorio: lint, typecheck, tests,
auditoría de dependencias, build de landing, security check y tests Supabase.
Además, verificar en dispositivos la cancelación, descubrimiento y OTA; los
checks automatizados actuales no los sustituyen.

## Orden de ejecución y publicación

1. Confirmar backend desplegado y Realtime real en test/demo; fijar contratos y
   casos de regresión. La política de reenvío inmediato ya está decidida.
2. Implementar y comprobar las correcciones de solicitudes en backend.
3. Unificar resolución/caché en la app y arreglar acciones y mensajes.
4. Incorporar descubrimiento Realtime privado y control de consultas.
5. Integrar EAS Update; probar el conjunto en builds preview de ambos sistemas.
6. Pasar CI y matriz de dos dispositivos; medir los objetivos de actualización.
7. Desplegar backend compatible, comprobar salud y preparar la candidata con
   entorno de producción para la nueva distribución Android/iOS.
8. Verificar la candidata y publicar por los canales de distribución acordados.
   Mantener disponible la reversión OTA para las actualizaciones posteriores y
   correcciones de backend compatibles; no revertir eliminando datos de usuarios.

La implementación se puede dividir en cambios revisables de backend, estado/UI,
discovery y distribución, manteniendo una sola entrega de producto consolidada.
Este documento no ejecuta despliegues, builds, compras ni envíos a tiendas.

## Referencias

- [Runbook de entornos](supabase-prod-test-separation-runbook.md).
- [Checks y publicación del repositorio](store-release-readiness.md).
- [EAS Update: configuración](https://docs.expo.dev/eas-update/getting-started/).
- [Compatibilidad de runtime](https://docs.expo.dev/eas-update/runtime-versions/).
- [Variables y entorno de publicación](https://docs.expo.dev/eas/environment-variables/usage/).
- [Reversión de updates](https://docs.expo.dev/eas-update/rollbacks/).
- [Cuotas actuales de EAS](https://expo.dev/pricing).
- [Eventos privados desde Supabase](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes).
