# Pegado explícito y códigos en notificaciones, 2026-10-21

Después de la primera OTA, el usuario informó que seguía sin poder pegar en
las casillas. Esta entrega añade un botón **Pegar** nativo en iPhone y corrige
dos problemas del campo: cursor oculto y límite aplicado antes de limpiar el
texto copiado. También coloca el código al principio del asunto del correo.

## Cómo funciona la sugerencia

La [lista oficial de iOS 26, página 14](https://www.apple.com/os/pdf/All_New_Features_iOS_26_Sept_2025.pdf#page=14)
confirma AutoFill de códigos desde notificaciones de apps. La explicación
anterior basada solo en Mail/iOS 17 era incompleta. Happy Circles identifica
el campo con `oneTimeCode`; iOS detecta y propone el código. El correo recibido
por Gmail y la notificación recibida por iOS son comprobaciones diferentes.
[Google documenta](https://support.google.com/mail/answer/1075549?co=GENIE.Platform%3DiOS&hl=es-419)
que Gmail notifica los mensajes de Principal por defecto.

Los asuntos ahora son `{{ .Token }} es tu código de Happy Circles` y
`{{ .Token }} para restablecer tu clave de Happy Circles`. Supabase
[procesa los asuntos como plantillas](https://github.com/supabase/auth/blob/master/internal/mailer/templatemailer/template.go#L396-L413).
Poner el código en el título mejora su visibilidad en la notificación; no es
una garantía de reconocimiento de Gmail/iOS ni una opción especial de Resend.

## Corrección del campo

- Se eliminó `caretHidden`: en RN 0.81.5 oculta la geometría del cursor nativo.
  [Implementación de React Native](https://github.com/react/react-native/blob/v0.81.5/packages/react-native/Libraries/Text/TextInput/Singleline/RCTUITextField.mm#L214-L220).
- Se eliminó `maxLength=8` del control nativo y se limita después de normalizar.
  Antes, copiar un código con un espacio podía perder un dígito porque el
  límite nativo se aplicaba primero.
  [Orden en React Native](https://github.com/react/react-native/blob/v0.81.5/packages/react-native/React/Fabric/Mounting/ComponentViews/TextInput/RCTTextInputComponentView.mm#L451-L467).
- El botón iOS usa `UIPasteControl` de `expo-clipboard`, dependencia ya presente
  en el binario. Otros entornos tienen **Pegar código** con lectura solo al
  pulsar. El pegado explícito reemplaza el código completo, mantiene ceros y
  limpia espacios/saltos de línea. Conserva estados deshabilitados y accesibilidad.
- iOS conserva `textContentType=oneTimeCode`; Android/web usan
  `autoComplete=one-time-code`, sin combinar los dos hints en iOS.

## Entrega y pruebas

Fuente publicada: `d5814ac694610908af6596ab8c75c4a6e593a805`.
[Security CI](https://github.com/happy-circles/Happy-circles/actions/runs/39669183092)
pasó: lint, tipos, 1.432 pruebas en 177 archivos, auditoría, configuración OTA,
build web, controles de seguridad y 36 archivos SQL con 45 comprobaciones.

| Plataforma | Grupo production                       | Update servido                         |
| ---------- | -------------------------------------- | -------------------------------------- |
| iOS        | `bad22069-0542-4d2f-b46c-414c4b2550a9` | `01a16024-5c3a-7719-abf6-dab8e584017a` |
| Android    | `6509d9d5-5a3a-43eb-bc07-3a4c0333edcd` | `01a16026-97c5-74ae-8882-4505a0b1ecf0` |

Se mantienen versión `1.0.3`, runtime `hc-sdk54-20260928-1`, environment/canal
`production` y backend `vknfhyfdtlvvfzptpqpj`. No se crearon builds ni se cambiaron
dependencias nativas. EAS registra el mismo commit y árbol limpio. Los dos
manifiestos y bundles devolvieron HTTP 200; sus hashes SHA-256 coinciden.
El plan EAS sigue Free sin extras ni cargos estimados.

En navegador, usando auth simulado, se probaron botón de pegado con espacios y
saltos de línea, reemplazo de un código anterior, ceros iniciales, texto no
numérico y pegado directo en el campo. También se comprobó la ausencia del
límite nativo y `autocomplete=one-time-code` en web.

Solo se modificaron los dos asuntos en Supabase; la lectura posterior confirmó
OTP de ocho dígitos, hashes HTML y toda la configuración Auth restante preservados.
Se solicitó una recuperación real al destinatario autorizado: HTTP 200 a las
20:24:45 UTC, recibida a las 20:24:49 UTC (15:24:49 Bogotá), en `INBOX` y
`CATEGORY_PERSONAL`, sin `SPAM`, con SPF y DKIM correctos.

El conector redactó el prefijo del asunto como código de autenticación. Se
confirmaron el texto nuevo, ausencia de `{{ .Token }}` literal y ocho dígitos
continuos en el cuerpo; no se pudo comparar el valor/longitud original del
prefijo ni su igualdad con el cuerpo. No se guardaron códigos ni enlaces de
recuperación. No se cambió contraseña, cuenta o bienvenida, ni se reenviaron pruebas.

El [recibo sanitizado](verification/otp-paste-follow-up-20261021.json) conserva
las comprobaciones. Falta observar la OTA aplicada, el botón nativo y la
sugerencia de teclado en el iPhone físico; la versión de iOS del usuario no
se recibió durante esta comprobación. Para reconocer esta entrega, abrir la
app con red, dejar descargar, cerrarla por completo y abrirla de nuevo:
aparecerá el botón **Pegar** debajo de las casillas.
