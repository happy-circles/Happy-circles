# Reintentos financieros y aislamiento de cuentas

Esta entrega cierra los riesgos revisados de reintentos tras cerrar la app,
reutilización de claves con datos diferentes y respuestas que llegan después
de cambiar de cuenta. El retiro de reversos sigue vigente.

## Comportamiento de la app

- Antes de enviar una operación financiera, guarda su clave por servicio,
  cuenta, operación y datos normalizados. Android/iOS utilizan SQLite; web
  utiliza una transacción IndexedDB con durabilidad estricta. No guarda tokens.
- Un doble envío simultáneo dentro de la app comparte la operación. Un timeout,
  cancelación o cierre conserva la clave para el siguiente reintento explícito.
  Abrir la app no reenvía operaciones automáticamente.
- Una respuesta confirmada permite crear después otra operación con los mismos
  datos y una clave nueva. Un fallo de actualización de pantalla o de guardado
  del recibo posterior no convierte esa confirmación en un error financiero.
- Si falla el almacenamiento antes de enviar, la app detiene el envío y pide
  liberar espacio o reintentar. No reemplaza la protección por una clave temporal.
- Cambiar de usuario, cerrar sesión o revocar el dispositivo cancela consultas
  privadas, retira la memoria de la cuenta anterior y descarta trabajo tardío.
  También cubre A → B → A; renovar el token dentro de la misma sesión no invalida
  sus consultas. Las escrituras diferidas comprueban la sesión después de abrir
  SQLite. La caché de Personas incluye el servicio y omite su formato antiguo.

Las nueve acciones cubiertas son crear, aceptar, rechazar, enmendar, corregir
y cancelar solicitudes; aprobar, rechazar y ejecutar círculos.

## Protección del servidor

La migración `20261013200001_bind_financial_idempotency_payloads.sql` enlaza
cada clave al contenido original de creación, aceptación, rechazo, enmienda,
decisión y ejecución. La comparación sucede bajo el bloqueo existente antes
de devolver una respuesta guardada. Corregir y cancelar ya tenían este control.
Se mantienen los permisos y el orden de bloqueos previo.

Una clave usada con otro importe, persona, solicitud o decisión devuelve
`idempotency_key_reused` (409). Las claves antiguas sin huella solo se actualizan
cuando su resultado permite reconstruir la intención original; una decisión de
círculo requiere auditoría de la misma transacción. Si no puede comprobarse,
devuelve `idempotency_legacy_unverifiable` (409) y pide consultar el estado.

La migración cambia funciones. No modifica solicitudes, movimientos,
participantes, ejecuciones ni historial. El despliegue compara las definiciones
anteriores y las huellas de ocho tablas dentro de la misma transacción;
cualquier cambio inesperado interrumpe la aplicación.

## Entrega y verificación

El servidor se entrega antes de la OTA. La app mantiene el runtime
`hc-sdk54-20260928-1`: reutiliza módulos nativos ya incluidos y no cambia
dependencias, permisos ni configuración nativa. Este alcance no requiere un
nuevo build. Véase el [contrato de runtime de Expo](https://docs.expo.dev/eas-update/runtime-versions/).

La verificación incluye SQLite con cierre/reapertura reales, pérdida de
respuesta, fallo de disco, cambio A → B → A, respuestas tardías, las nueve
acciones y la suite SQL completa en PostgreSQL 17 con datos ficticios. La
entrega publicada y sus identificadores se registran en
`docs/verification/financial-integrity-release-20261013.json`.

La entrega se publicó el 13 de octubre de 2026 desde
`f9dc65a4271dadf57bd172470a3bfe7ac0ae2400`, con
[Security CI exitoso](https://github.com/happy-circles/Happy-circles/actions/runs/38463880384).
Pasaron 1.428 pruebas en 176 archivos, 36 archivos SQL sobre las 97 migraciones
y cuatro carreras con conexiones PostgreSQL independientes. También pasaron
lint, tipos, revisión de dependencias, seguridad y configuración OTA.

| Destino          | Plataforma | Grupo publicado                        |
| ---------------- | ---------- | -------------------------------------- |
| production smoke | Android    | `b1e28b9d-e428-4906-9561-ae692fd2665a` |
| production       | Android    | `c5d3fffc-e0f8-4d04-a4f3-1b1241a64145` |
| production       | iOS        | `15b5fcf5-9902-4516-a7b8-4b19d2870882` |

Las tres entregas se comprobaron contra sus manifiestos y archivos servidos,
con el backend y runtime previstos. Android smoke recibió el archivo exacto
por Expo Updates y arrancó con red y sin conexión, sin fallos de arranque.
El entorno preview devolvió 403 al acceso de administración; la validación usó
PostgreSQL aislado y después Android smoke. No se sustituyeron entornos.

En producción se comprobaron nueve definiciones de funciones y siete endpoints
activos con verificación de JWT. La migración conservó las huellas de las ocho
tablas comprobadas: la lectura posterior mostró 119 solicitudes, 92 movimientos,
184 asientos y cero reversos. Los avisos de seguridad y rendimiento de Supabase
no aumentaron frente a la consulta anterior. Se mantuvo el plan Free de EAS,
sin contratar extras ni generar builds.

## Límites y siguiente comprobación

La clave corresponde a los mismos datos normalizados. Cambiar esos datos
representa otra intención; antes de reemplazar una operación cuyo resultado
se desconoce, se debe consultar su estado. Borrar los datos de la app o
desinstalarla elimina el diario local.

La deduplicación simultánea cubre el registro único de la app nativa. No promete
coordinar intenciones independientes entre pestañas después de una confirmación.
Si coinciden fallo al guardar el recibo y cierre del proceso, el siguiente envío
idéntico recupera conservadoramente la clave anterior; tras confirmar ese replay,
la siguiente operación deliberada obtiene una nueva.

La prueba Android de arranque y OTA se realiza en un emulador temporal. La
aceptación final en dispositivos físicos debe incluir Android e iPhone con dos
cuentas de QA: red interrumpida tras enviar, cierre/reapertura y cambios de cuenta.
Estas pruebas no justifican crear movimientos de prueba en producción.
