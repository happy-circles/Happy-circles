# Entrega de rapidez, 13 de octubre de 2026

Las cuatro mejoras están publicadas en producción para Android e iOS desde
`7f84e0b955c17381beb6755d31810757f46230b8`. [Security CI](https://github.com/happy-circles/Happy-circles/actions/runs/38439882057) pasó para ese mismo commit.
El [recibo de verificación](verification/app-speed-release-20261013.json) conserva
los IDs, hashes y límites de las pruebas.

## Comportamiento

- Aceptar, rechazar y proponer cambios esperan la confirmación del servidor y
  actualizan la solicitud afectada. El saldo y ledger provienen de filas
  canónicas; la recarga general continúa en segundo plano.
- El arranque elimina su mínimo artificial de 760 ms. Las transiciones finales
  pasan de 700–760 ms a 220 ms y el feedback de éxito de 1.400 ms a 250 ms.
- Una vista local se restaura directamente sólo si coincide con el recibo
  atómico de historial, cuenta y backend. La sincronización continúa después.
- Las pestañas de persona y actividad se montan al visitarlas; las listas
  dibujan ventanas de filas sin recortar el historial almacenado.

Se conservan la sesión, la preparación de pantallas, el movimiento reducido,
los errores del servidor y el rechazo de reversos ya deshabilitados. Los
reintentos conservan su intención y clave; no se redirigen a otra solicitud.

## Integridad comprobada

Pasaron **1.364 pruebas en 167 archivos**, lint, tipos, arquitectura, auditoría
de dependencias, checks EAS, build de landing y CI. En PostgreSQL 17.11 pasaron
34 archivos SQL y 25 carreras con dos conexiones. Cinco proyecciones de filas
reales conservaron una sola copia del ledger, saldo canónico y cursor intacto.
Las pruebas SQL usaron el baseline de 95 migraciones sin cambios de esta entrega.

Las pruebas de SQLite cubren commit atómico de filas y cursor, rollback,
reapertura, caché derivada atrasada y aislamiento de cuentas/backend. También
se probó respuesta perdida y reintento, reset del journal, respuestas fuera
de orden y recuperación de ledger/saldo desde el respaldo cuando falla el
guardado raw. Una confirmación no adelanta el cursor ni simula un saldo.

En producción, una transacción de **solo lectura** verificó coherencia entre
fuentes, copias y páginas del journal: cero diferencias y cero revisiones
duplicadas. No se crearon sesiones ni movimientos de prueba en producción.
Las funciones accept v20, reject v16 y amend v18 están activas con JWT; sus
preflight arrancaron y sus gateways rechazaron solicitudes sin sesión.

## Recepción y medición

El clon Android con el binario compatible 1.0.3 (23) recibió el bundle exacto
del CDN y abrió online y sin red, sin lanzamientos fallidos ni errores fatales.
Su bienvenida pública, con el mismo observador antes y después, tuvo medianas
de **2805 ms → 1794 ms** en tres muestras por versión.
Es una observación de ese emulador y pantalla; no mide la sesión autenticada
ni el iPhone del usuario. Los tiempos configurados tampoco son benchmarks.
El clon y sus helpers se cerraron; los archivos originales del AVD quedaron
con los mismos hashes, tamaños y fechas.

En iOS se verificaron fuente, runtime, manifiesto, clave pública y bytes servidos.
No se probó un iPhone físico ni una operación financiera autenticada en él.

## Publicación

Runtime: `hc-sdk54-20260928-1`, Expo SDK 54. No se creó otro binario nativo,
no se aplicó ninguna migración desde esta entrega y no se cambiaron dependencias
nativas. Las instalaciones compatibles reciben la OTA al descargarla y volver
a abrir completamente la app.

| Canal            | Plataforma | Update ID                              | Group ID                               |
| ---------------- | ---------- | -------------------------------------- | -------------------------------------- |
| production-smoke | android    | `01a1365b-c730-7cda-a569-1d1c29466948` | `c36a4002-81a0-44f5-81fe-9555697a2e0d` |
| production       | android    | `01a13662-871b-7762-b933-53b06882fdd9` | `cd80b5e8-696e-45c2-b521-1fed4cf0a4bd` |
| production       | ios        | `01a13664-b7f9-7663-84da-3b946bfceecc` | `0da880ba-e45b-4529-939f-6e36fa7327d4` |

Los bundles Android smoke y producción son idénticos. Los manifiestos y el
CDN devolvieron los hashes exportados y el backend correcto en las tres
publicaciones. El plan Free y coste estimado cero se comprobaron antes de
cada publicación; no se contrataron addons.

La proyección complementaria de aceptación tiene un presupuesto compartido
de dos segundos. Si no está disponible, la respuesta financiera confirmada
se conserva y la sincronización general completa el saldo y las filas.
