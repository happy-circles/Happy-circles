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

El cambio es JavaScript, sin dependencias o configuración nativas nuevas.
Mantiene el runtime `hc-sdk54-20260928-1` y es candidato a OTA para instalaciones
compatibles. El export local no publica una actualización. La corrección aún
no está publicada en producción ni se ha comprobado en el dispositivo afectado.
