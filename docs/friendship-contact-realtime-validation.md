# Amistades y descubrimiento de contactos: implementación y validación

Fecha: 2026-09-28. Implementación en el repositorio; despliegue remoto y
distribución móvil pendientes de la validación del entorno de pruebas y de
builds instalados.

## Comportamiento implementado

- Cancelar o rechazar permite una nueva solicitud inmediatamente, con otro ID
  y conservando el historial. Reintentar una operación cuya respuesta se perdió
  conserva su clave de idempotencia entre remontajes de pantalla durante el
  mismo proceso. Ese registro local no persiste después de matar la app; las
  restricciones del servidor siguen evitando solicitudes internas simultáneas.
- Envíos cruzados reutilizan la solicitud vigente. Si aceptar y cancelar compiten,
  el servidor devuelve el resultado real y la app lo refleja.
- Recordar una solicitud es una operación separada: aviso persistido y
  deduplicado, con 60 segundos entre recordatorios. Ese intervalo no limita
  reenviar después de un rechazo o una cancelación.
- La creación desde contactos encola el aviso en la misma transacción. Los
  avisos de solicitudes cerradas se descartan antes de entregarlos al proveedor.
  Un aviso ya entregado no puede retirarse; al abrirlo se consulta el estado actual.
- Solicitudes entrantes muestran **Responder**, salientes **Ver solicitud**.
  **Ahora no** cierra un enlace sin fingir que lo rechaza. Compartir o copiar
  no afirma que WhatsApp haya entregado el mensaje. Antes de compartir de nuevo
  o mostrar un QR se comprueba que la invitación y su enlace sigan vigentes.
- La resolución se comparte por cuenta y teléfono, con fecha, generación y
  protección frente a respuestas antiguas, escrituras SQLite tardías y cambios
  de cuenta. Se conserva la última información mientras se revalida.
- Los estados pendientes caducan a los 30 segundos; los demás a los 60 segundos.
  La comprobación periódica opera sobre contactos visibles y con conexión.
  Las mutaciones, eventos privados y reconexiones invalidan lo afectado.
- Los contactos activos disponibles muestran **Agregar** y ascienden en la lista.
  Un perfil registrado sin acceso activo conserva el flujo de activación.

## Descubrimiento privado

La app confirma la suscripción a `user:<id>` y resuelve lotes de hasta 60 números
con una sesión de observación. La RPC registra las observaciones antes de leer el
perfil y comparte bloqueos por teléfono con el trigger de cambios de perfil.
El cliente conserva también los avisos que llegan antes de recibir el primer
identificador de observación.

Las tablas viven en `app_private`, tienen RLS y carecen de permisos de acceso
directo para clientes. Guardan HMAC calculados con una clave privada del servidor.
Los eventos `contacts_changed` incluyen IDs opacos del propio observador; no
contienen teléfonos ni perfiles. Cambiar un teléfono avisa a observadores de la
identidad anterior y de la nueva.

Cada sesión dura 15 minutos, se renueva cada 5 minutos y se elimina al cerrar
cuando hay conexión. Un trabajo periódico limpia las sesiones vencidas. Límite:
4 sesiones por usuario y 20.000 números por sesión.

La cuota de resolución es independiente de las invitaciones: 60 llamadas/minuto,
1.200/hora. La exploración y las consultas periódicas usan como máximo 45/minuto
y 1.000/hora; los cambios concretos recibidos por eventos tienen prioridad y
pueden usar hasta 55/minuto y 1.100/hora. Las acciones manuales conservan la
capacidad restante. Reabrir la agenda o recuperar la conexión no eleva toda la
agenda a prioridad de evento: se atienden primero los contactos visibles.
La renovación de una agenda completa necesita una sola llamada, sin volver a
consultar todos sus números.

## Evidencia ejecutada

Entorno SQL aislado: `supabase_db_hc_friendship_validation`, puertos API 55371 y
Postgres 55372, dentro de `.tmp/friendship-validation`. No se reiniciaron ni
modificaron los otros proyectos locales para ejecutar las pruebas.

| Verificación                                                    | Resultado                                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Suite SQL `supabase/tests/00` a `26`                            | 27 archivos aprobados                                                                 |
| Supabase advisors, seguridad y rendimiento, nivel warning/error | Sin incidencias                                                                       |
| Procesos PostgreSQL concurrentes                                | 7 escenarios aprobados                                                                |
| Eventos WebSocket autenticados                                  | 20 muestras aprobadas, dos observadores y aislamiento del usuario ajeno               |
| Latencia SQL local → recepción WebSocket                        | p95 235 ms; máximo 240 ms                                                             |
| Agenda de 1.000 números                                         | 17 lotes; aproximadamente 54 ms de trabajo SQL                                        |
| Agenda de 10.000 números                                        | 167 lotes; aproximadamente 700 ms de trabajo SQL                                      |
| Configuración EAS Update                                        | 7 pruebas aprobadas                                                                   |
| Suite JavaScript/TypeScript                                     | 470 pruebas aprobadas en 95 archivos                                                  |
| Edge Functions mediante HTTP real local                         | Autenticación, permisos, idempotencia, cancelación, reenvío y recordatorios aprobados |
| Lint y tipos del monorepo                                       | Aprobados                                                                             |
| Auditoría de dependencias y controles de seguridad              | Aprobados, sin ampliar excepciones                                                    |
| Build de producción de landing                                  | Aprobado con Next.js 16.3.3                                                           |
| Configuración nativa y exportación Hermes Android/iOS           | Aprobadas                                                                             |

Los tiempos SQL excluyen red, cuota de Edge Functions y renderizado móvil. La
latencia WebSocket tampoco mide la actualización de la pantalla del teléfono.
El objetivo de p95 inferior a 3 segundos en dispositivos sigue necesitando una
prueba con builds instalados. Una agenda desconocida de 10.000 números requiere
varios minutos bajo el presupuesto automático; no se promete una exploración
inicial instantánea.

Pruebas reproducibles, sobre el stack aislado ya preparado:

```powershell
node scripts/test-friendship-concurrency.mjs
node scripts/test-contact-discovery-realtime.mjs --db-container supabase_db_hc_friendship_validation
pnpm check:eas-update
```

Los scripts de concurrencia y WebSocket restringen su destino al entorno local
de validación. Crean datos sintéticos y limpian los registros propios al terminar.
`node scripts/test-friendship-edge.mjs` comprueba HTTP contra ese mismo stack;
requiere antes servir las funciones copiadas en `.tmp/friendship-validation`.
El worker se compiló y rechazó correctamente una llamada sin su secreto. No se
envió una notificación a Expo ni se validó su recepción en un teléfono.

La auditoría obligatoria encontró vulnerabilidades que ya estaban presentes en
las dependencias iniciales. Se corrigieron las versiones afectadas y se validó
la compatibilidad; véase [el registro de dependencias](dependency-security-2026-09.md).

## Orden de despliegue

1. Recuperar acceso al proyecto de pruebas configurado
   (`ciozrkhwekzbhsvgfqdg`) o confirmar el sustituto. La credencial disponible
   permite leer producción pero rechaza ese proyecto. El usuario confirmó que
   `vknfhyfdtlvvfzptpqpj` es producción; no confirmó un sustituto de pruebas.
   La validación ejecutada se realizó en el stack local aislado.
2. Aplicar, en orden, `20260928202038_friendship_lifecycle_recovery.sql` y
   `20260928202134_private_contact_discovery.sql`. Las migraciones son aditivas;
   las solicitudes anteriores y los contratos antiguos siguen disponibles.
3. Publicar las funciones nuevas `remind-friendship-invite` y
   `manage-contact-discovery`, las modificadas `resolve-people-targets`,
   `create-people-outreach` y `send-push-notifications`, y los consumidores de
   los módulos compartidos modificados. Desplegar todas las funciones desde el
   mismo commit evita mezclar versiones de `_shared/http.ts` y
   `_shared/push-notifications.ts`.
4. Comprobar Realtime real y política de canal privado en ese proyecto: el
   runbook antiguo de test/demo documentaba funciones sin emisión real.
5. Crear builds preview de Android e iOS, probar el flujo con dos cuentas y
   comprobar recepción, aplicación en el siguiente arranque y reversión OTA.
6. Aplicar el backend compatible en producción y preparar los builds de tienda
   con el entorno de producción. Conservar el control de CI del commit exacto.

Los binarios anteriores no incluyen `expo-updates`: necesitan una nueva
instalación/distribución para entrar en el runtime `hc-sdk54-20260928-1`.
Después, las correcciones compatibles de JavaScript pueden llegar por OTA.
Consulta [el runbook EAS](eas-update-runbook.md) para canales, variables y reversión.

No se han publicado actualizaciones, enviado builds a tiendas ni contratado planes.
