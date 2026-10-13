# Respuesta rápida de la app

Las operaciones financieras siguen esperando el resultado del servidor. Una
respuesta confirmada actualiza su versión de solicitud y, cuando está disponible,
el ledger y el saldo canónicos de la relación. La consulta general posterior se
ejecuta en segundo plano. Los reintentos conservan la misma intención y clave;
una respuesta tardía no se aplica a otra versión ni a otra cuenta.

Si la lectura de filas posterior al commit falla, la confirmación por ID exacto
retira únicamente la versión pendiente ya resuelta. No inventa otra propuesta,
un movimiento contable, un saldo ni una fecha de resolución. Esa confirmación
se guarda con el historial y se mantiene durante la sincronización y al reabrir.

La caché derivada se muestra directamente sólo cuando coincide con el recibo
del mismo commit local de historial, cuenta y backend. Los recibos se guardan
en el mismo statement SQLite que filas y cursor. Una copia derivada atrasada,
un caché antiguo o un guardado interrumpido se reconstruye desde el historial.
Las copias derivadas se escriben en segundo plano respetando el orden de los
comandos; los cursores no se adelantan al confirmar una acción.

Las pestañas de persona y actividad montan su contenido al visitarlas y lo
conservan después. FlatList y SectionList dibujan ventanas de filas, manteniendo
todos los registros, claves, orden, foco, expansión y actualización al deslizar.
No hay límites nuevos de historial ni dependencias nativas nuevas.

El arranque deja de esperar un mínimo artificial de 760 ms. Las transiciones
finales pasan de 700–760 ms a 220 ms y el feedback de éxito de 1.400 ms a 250 ms.
Las comprobaciones de sesión, confirmación, preparación y movimiento reducido
siguen activas. Estas cifras son tiempos configurados, no mediciones de iPhone.

La aceptación usa una lectura acotada de filas de la relación. Si esa proyección
no está disponible, la sincronización general completa el saldo. Las reversales
antiguas cuyo monto fue modificado usan el ledger original; su proyección se
omite si no coincide con la solicitud y se obtiene mediante esa sincronización.

El cambio conserva el runtime `hc-sdk54-20260928-1`. La entrega requiere CI del
mismo commit, despliegue de las tres respuestas Edge y OTA de Android e iOS;
no necesita otro binario de tienda para instalaciones compatibles.

La entrega verificada está registrada en
[la publicación del 13 de octubre de 2026](app-speed-release-20261013.md).
