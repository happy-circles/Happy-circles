# Registro de movimientos en Android

## Problema y alcance

Se investigó una pantalla blanca después de crear una solicitud de saldo. El
backend confirmó el guardado; el diagnóstico del cliente todavía no demuestra
la causa exacta en el dispositivo afectado.

El registro es una pantalla `transparentModal`. Al terminar el envío, el código
navega al detalle de la persona mientras el diálogo nativo de carga puede seguir
cerrándose durante 140 ms. La corrección elimina esa superposición en Android:
el registro utiliza el indicador de progreso y bloqueo que ya tiene su botón,
sin presentar el diálogo nativo de carga.

Los resultados de error conservan su presentación. Se mantienen los controles
de envío en curso y envío ya confirmado, las claves de idempotencia y la
sincronización que no bloquea el éxito. No se cambia el flujo de iOS o web.

## Verificación automatizada

- `pnpm test`: 179 archivos y 1.439 pruebas aprobadas.
- Cuatro pruebas del registro cubren una respuesta lenta, bloqueo del botón y
  de salida durante el envío, dos pulsaciones antes del primer render y una
  pulsación después de la confirmación antes del desmontaje, una sola
  navegación al registro confirmado, error con borrador conservado y reintento
  explícito, y presentación de carga en iOS/web.
- La misma prueba Android falla al restaurar la condición anterior únicamente
  en memoria mediante una configuración Vitest temporal. Los otros tres casos
  siguen pasando. Esto demuestra que la prueba detecta el comportamiento
  corregido; no demuestra por sí solo una carrera de ventanas nativas.
- Las pruebas existentes de transporte, mutaciones y registro durable cubren
  llamadas concurrentes, pérdida de respuesta, reutilización de clave después
  de reabrir SQLite y sincronización pendiente o fallida después del guardado.
- `pnpm lint`, `pnpm typecheck` y `pnpm security:check`: aprobados.
- `pnpm check:eas-update`: siete pruebas y comprobación de configuración
  aprobadas.
- Export Android de producción completado con Hermes: 2.106 módulos.

Las pruebas automatizadas usan transporte simulado. No se ejecutó la suite SQL
local porque el motor Docker no estaba disponible. No se crearon solicitudes
ni se modificaron datos de producción.

## Verificación nativa

Se utilizó un AVD nuevo de Android API 36 con Expo Go SDK 54 y Hermes. El
registro, el detalle de persona, la navegación nativa, la mutación financiera,
el registro durable de claves y el parche de caché son los del producto. La
sesión, el snapshot inicial y el transporte HTTP son sintéticos; la API de
prueba solo contiene datos locales.

| Escenario | Resultado observado |
| --- | --- |
| Respuesta de 2.500 ms y dos activaciones consecutivas del botón | Una llamada HTTP y un registro; cierre del registro y detalle real con un pendiente visible. |
| Guardado con respuesta perdida, seguido de reintento explícito | Borrador conservado; dos llamadas con el mismo payload y clave, el mismo `requestId` y un solo registro nuevo. |

Los dos casos dejaron dos registros intencionales en la API local, a partir de
tres llamadas HTTP en total. No se observó pantalla blanca después del guardado.
Las capturas finales y los recibos se conservaron en
`.tmp/android-register-qa/native/slow-native-receipt.json` y
`.tmp/android-register-qa/native/lost-native-receipt.json`.
El recibo consolidado está en `native-qa-receipt.json`, en la misma carpeta.
No quedaron diálogos nativos de carga en los dumps de ventanas durante o
después del guardado; no se capturaron errores fatales de Android ni
excepciones sin manejar del fixture. Se cerraron los procesos de prueba y
se verificó que los archivos del AVD original conservaron sus tamaños y fechas.

La interacción nativa se hizo por teclado/DPAD. Una capa Compose del entorno de
Expo Go interceptaba los toques incluso en la pantalla sintética inicial; no
se atribuye al producto ni se modificó el producto para evitarla. Por ello no
se acredita la interacción táctil con el APK de producción. El export de
producción pasó por separado, pero no se instaló ni ejecutó ese export en un
APK release. Tampoco se reprodujo de forma controlada el fallo original antes
del cambio. Estas pruebas respaldan el cambio y la idempotencia en los casos
ejecutados; no garantizan el comportamiento de todos los dispositivos.

## Distribución

El cambio se publicó solo para Android en el canal y entorno `production` el
28 de octubre de 2026 a las 20:06, hora de Bogotá. Mantiene la versión visible
1.0.3 y el runtime `hc-sdk54-20260928-1`, sin módulos o configuración nativa
nuevos.

- Commit publicado: `8a6e968e4193244505ce4963019dced18eb5d31e`.
- Actualización Android: `01a18532-1f09-7915-9235-d25f2170fcdb`.
- Grupo: `0a1e750f-88ec-4ad0-8d29-7c405883d84f`.
- [Security CI](https://github.com/happy-circles/Happy-circles/actions/runs/40797611697)
  aprobó ese commit: 1.439 pruebas de aplicación, auditoría y 33 regresiones de
  seguridad de dependencias, configuración OTA, build de landing, y 45 pruebas
  SQL en 36 archivos. La auditoría exigió un parche acotado de deepmerge usado
  por las herramientas Expo; el detalle está en
  [seguridad de dependencias](dependency-security-2026-09.md).

La comprobación independiente de las 20:07 confirmó HTTP 200 para el manifiesto
y bundle del canal de producción. El SHA256 del bundle servido coincide con
el manifiesto y con el export Android exacto publicado:
`QnssRUFZ7eT_AsggBMAX9jNyahkjtqQUfAcNlA1AY4M`. Se verificaron proyecto,
runtime, versión, backend y origen web de producción. iOS conserva el mismo
identificador y hash anteriores. El
[recibo de entrega](verification/android-register-feedback-20261028.json)
conserva las comprobaciones y sus límites.

Esto acredita disponibilidad en producción, no recepción en el dispositivo
afectado. Las instalaciones compatibles comprueban la OTA al abrir, descargan
en segundo plano y utilizan lo descargado en un inicio posterior; no se fuerza
un reinicio durante un envío.
