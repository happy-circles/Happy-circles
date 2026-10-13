# Entrega de corrección y cancelación de pendientes

Publicado el 12 de octubre de 2026, hora de Colombia. El autor actual puede
corregir una solicitud de saldo pendiente o cancelar su propuesta pendiente.
La corrección conserva versiones anteriores; la cancelación queda en el
historial de ambas personas. Sólo una acción puede resolver cada versión.

Fuente publicada: `c04710bb91641a12333b12f9667ba090d199bb40`.
[Security CI 38297014112](https://github.com/happy-circles/Happy-circles/actions/runs/38297014112)
pasó para ese commit: 1.233 pruebas, lint, tipos, seguridad y la suite SQL.

## Backend

Producción `vknfhyfdtlvvfzptpqpj` tiene las 95 migraciones. La migración
`20261012172020_sender_pending_request_controls.sql` registrada coincide con
la fuente, SHA256 `63e472d87fb5dceb319b5a9e213668f4bf4ddbea6dedbc01ffb489616986f0d5`.
La prueba previa con SQL33 se revirtió y no dejó usuarios ni datos de prueba.

| Función | Versión activa |
| --- | --- |
| correct-financial-request | 1 |
| cancel-financial-request | 1 |
| get-app-snapshot | 12 |
| accept-financial-request | 18 |
| reject-financial-request | 15 |
| amend-financial-request | 16 |

Las seis mantienen verificación JWT. Las cuatro funciones anteriores se
actualizaron mediante la [API oficial de actualización](https://supabase.com/docs/reference/api/v1-update-a-function),
con un ESModule generado de esa fuente e imports relativos incorporados.
Los hashes de inputs Git y outputs se comprobaron antes de enviar el paquete;
no se cambió la lógica de autenticación. Esta ruta completó la entrega tras
errores del bundler del CLI. Los intentos alternativos que fallaron por
plantillas ausentes se detuvieron localmente, antes de desplegar.

La verificación final encontró cero diferencias, filas extra o revisiones
duplicadas entre fuentes y journal: 178 copias de solicitudes cerradas y 362
copias de historial. Bootstrap y cursor sin cambios coinciden para 40 dueños.
Las consultas privadas se ejecutaron en transacciones READ ONLY con rollback.
Los seis endpoints rechazaron llamadas sin sesión con HTTP401. No aparecieron
WARN/ERROR nuevos en los asesores; se registraron dos INFO nuevos.

## OTA

Runtime `hc-sdk54-20260928-1`, environment production. No cambian dependencias
o configuración nativas; las instalaciones compatibles no necesitan un nuevo
binario de tienda. Cada plataforma se publicó por separado.

| Canal | Plataforma | Update ID | Group ID |
| --- | --- | --- | --- |
| production-smoke | Android | `01a131b7-01fd-762a-8337-fc219b7eddf7` | `6a1ee6ed-6e46-472e-9499-61709c1b55b2` |
| production | Android | `01a132c9-a4f4-712f-9487-ceb0d08e0f26` | `0f362d98-eaee-4388-a806-33a07a925ee1` |
| production | iOS | `01a132cc-e28f-769f-ba9f-cdf4b1e67abe` | `32da189b-f63e-47b4-9bf3-44e0ee9bb4a7` |

Manifiestos y bundles servidos coinciden con los exports y la fuente publicada.
La clave pública de cada manifiesto fue aceptada por producción. No se hallaron
credenciales de servidor ni backend de pruebas en los artefactos.

- Android SHA256 base64url: `njQeGPYSyDRj2XwcYgH_JpC591EbFbdXHaEKcnm-Im4`.
- iOS SHA256 base64url: `4IxE6HTAkuJcKv5uPOoAjkMDiLhSJimHicfqvP-aaMM`.

El clon Android 1.0.3 recibió la OTA oficial, abrió en un proceso online y
volvió a abrir en un proceso offline: dos lanzamientos correctos, cero fallos,
errores fatales o TLS. El bundle recibido es idéntico al de producción Android.
No usó Metro. El clon y sus overlays se descartaron; los archivos originales
del AVD conservaron hashes, tamaños y fechas, y no quedaron procesos de prueba.

Las 34 pruebas SQL y 25 carreras en PostgreSQL real verificaron versiones,
actores, reintentos y un único ganador sin duplicar movimientos. El emulador
no tenía una sesión autenticada, por lo que las pantallas de transacciones
no se probaron con una cuenta real. iOS se verificó mediante build compatible,
export y entrega del manifiesto/bundle; no se probó en un iPhone físico.

La app descarga la OTA al abrir y la aplica en un inicio posterior.
Los recibos privados y exports están en `.tmp/sender-request-release-20261012`.
El [recibo público de entrega](verification/sender-request-release-20261012.json)
conserva IDs, hashes, comprobaciones y límites de la evidencia.
