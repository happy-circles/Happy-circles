# Registro de movimientos: autorización y OTA — 2026-10-09

Publicado en el canal `production` para Android e iOS. Fuente distribuida:
`144378ef968d03134d3cdb7ead02208fb19fef3a`, con
[Security CI exitoso](https://github.com/happy-circles/Happy-circles/actions/runs/37957567956).
Incluye los cambios de movimientos `738eae31` y `cd620b77`, además de las mejoras
de invitaciones que entraron antes de fijar la copia de publicación.

## Comportamiento

- El formulario indica si falta confirmar el correo, completar el perfil,
  autorizar la sesión actual o confirmar la identidad.
- `Autorizar y registrar` abre la confirmación y continúa el mismo intento al
  terminar. Cancelar o fallar conserva los campos del formulario.
- Un fallo al abrir la confirmación informa lo ocurrido y ofrece reintentar.
  Los errores usan códigos del servidor, además de admitir mensajes anteriores.
- `Verificando acceso…` aparece durante la autorización. `Creando…` se reserva
  para el envío del movimiento. El ref de guardado evita envíos simultáneos.
- El diálogo espera su cierre y el regreso al primer plano antes de continuar.
  Una operación de autorización pendiente conserva su bloqueo hasta terminar.
- Un movimiento confirmado se incorpora a la caché de la cuenta que lo creó.
  La sincronización posterior de pantallas no prolonga el guardado ni transforma
  un éxito del servidor en un error aparente.

## Servidor

`create-balance-request` v13 ACTIVE en `vknfhyfdtlvvfzptpqpj`, con verificación
JWT habilitada. Las notificaciones se preparan mediante `EdgeRuntime.waitUntil`
después de confirmar el comando; el fallback espera la misma tarea cuando ese
runtime no está disponible. Los fallos de notificación se registran sin invalidar
un movimiento ya creado.

Se normalizan las respuestas de sesión ausente y relación inactiva. No se cambian
permisos, RLS ni el requisito de autorización del movimiento. El cambio de este
endpoint no modifica las versiones publicadas de los otros endpoints.

La consulta de salud respondió correctamente y una llamada anónima al endpoint
publicado devolvió HTTP 401. No se crearon movimientos de usuarios para verificar
la entrega.

## Entrega y comprobaciones

Runtime: `hc-sdk54-20260928-1`. Environment: `production`.

| Plataforma | Grupo OTA                              | Update                                 |
| ---------- | -------------------------------------- | -------------------------------------- |
| Android    | `44c69d69-afaa-474d-81e6-b1b7aa176ebf` | `01a12176-8fa5-77e5-a6d6-eb945a70639c` |
| iOS        | `153ed4a0-3cfc-469a-85e2-b1491a0e38a9` | `01a12177-d58f-7d01-a78c-524e6345af21` |

Los manifiestos respondieron HTTP 200 y los SHA256 de los bundles descargados
coincidieron con las exportaciones a las `2026-10-09T16:21:43.776Z`. Ambos incluyen
el aviso de autorización y los códigos de recuperación.

Pasaron 1.014 pruebas locales del cambio, lint, typecheck y seguridad. CI verificó
el commit completo, incluyendo auditoría de dependencias, contrato EAS, build web
y pruebas de Supabase. No hay cambios nativos respecto a los builds compatibles.

Se publicó con EAS CLI 21.7.1 desde una copia fijada del commit. La credencial
HTTPS de GitHub disponible sólo permite lectura, por lo que no pudo lanzar el
workflow manual; se conservaron sus verificaciones de SHA, CI, entorno y runtime.
Los resultados, metadata, exports y recibos están en
`.tmp/movement-authorization-ota/` del workspace principal.

La recepción y el formulario autenticado aún requieren prueba en un teléfono.
No había un teléfono físico ni iOS disponible para esa comprobación. Los builds
1.0.3 compatibles descargan al abrir y aplican en una apertura posterior. Los
binarios 1.0.2 necesitan actualizarse a un binario compatible. Esta publicación
no actualiza el canal separado `production-smoke` del APK interno.
