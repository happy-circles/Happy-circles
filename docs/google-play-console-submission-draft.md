# Google Play Console submission draft

Ultima revision: 2026-07-04.

Valores listos para completar Play Console para `com.happycircles.app`.

## Informacion base

- Nombre de la app: Happy Circles
- Paquete: `com.happycircles.app`
- Categoria recomendada: Finance
- Email de contacto: `soporte@happy-circles.com`
- Politica de privacidad: `https://app.happy-circles.com/privacy`
- Soporte y solicitudes de cuenta/datos: `https://app.happy-circles.com/support`
- Terminos: `https://app.happy-circles.com/terms`

## Acceso a la app

- La app requiere inicio de sesion: Si.
- Motivo: las funciones dependen de datos privados de cuenta, contactos de
  confianza, permisos de relacion y datos protegidos por autenticacion.
- Cuenta demo: usar una cuenta demo activa antes de enviar.
- Instrucciones para review:

```text
Happy Circles requires sign in because all app features depend on private
account data, trusted contacts, relationship permissions and protected balance
records. Use the provided demo account to access the main app flow.
```

## Anuncios

- Contiene anuncios: No.

## Ficha de Play Store

Descripcion corta:

```text
Organiza saldos privados con personas de confianza.
```

Descripcion completa:

```text
Happy Circles ayuda a organizar saldos privados entre personas de confianza.
Puedes registrar solicitudes, confirmar pendientes, invitar contactos y cerrar
cuentas compartidas con historial claro.

La app no es un banco, billetera, pasarela de pago, producto de credito ni
servicio de inversion. Happy Circles no mueve dinero, no desembolsa fondos, no
cobra intereses y no consulta puntajes crediticios. Solo ayuda a llevar un
registro privado y verificable entre usuarios que se conocen.

Funciones principales:
- Registro privado de solicitudes y saldos.
- Invitaciones entre personas de confianza.
- Historial y auditoria de cambios importantes.
- Cierre de cuentas compartidas.
- Proteccion de acciones sensibles con dispositivo confiable y biometria local.

La privacidad es parte central del producto. Puedes revisar la politica de
privacidad en https://app.happy-circles.com/privacy y solicitar soporte o
eliminacion de cuenta/datos en https://app.happy-circles.com/support.
```

## Seguridad de datos

Resumen para revisar contra el formulario de Play Console:

- La app cifra datos en transito: Si.
- El usuario puede solicitar eliminacion de datos: Si.
- La app vende datos: No.
- La app usa datos para publicidad o tracking: No.
- La app procesa pagos, tarjetas o cuentas bancarias: No.
- La app consulta buro/puntaje crediticio: No.
- La app usa ubicacion: No.

Datos esperados:

- Personal info: nombre, email, telefono e IDs de usuario.
- Contacts: contactos, opcional y activado por el usuario.
- Photos and videos: foto de perfil opcional.
- Financial info: saldos, solicitudes, ledger e historial privado.
- App activity: interacciones de producto para analitica y funcionamiento.
- App info and performance: diagnosticos y rendimiento.
- Device or other IDs: IDs de dispositivo/sesion para seguridad, push y
  analitica.

## Clasificacion de contenido

Postura recomendada:

- Sin violencia.
- Sin contenido sexual.
- Sin lenguaje ofensivo.
- Sin sustancias controladas.
- Sin apuestas.
- Sin compras dentro de la app, salvo que cambie el producto.
- Puede permitir interaccion entre usuarios conocidos dentro de la app.

## Prueba cerrada

Play Console exige antes de produccion:

- Crear una prueba cerrada.
- Seleccionar paises/regiones. Recomendado inicial: Colombia.
- Cargar un AAB de produccion.
- Tener al menos 12 testers que acepten participar.
- Mantener la prueba cerrada activa al menos 14 dias con esos testers.
- Luego solicitar acceso a produccion.

Pendiente tecnico antes de subir el AAB:

- AAB generado con EAS: build `60d857ef-8a98-47dd-aa83-ee2909bf6592`,
  `versionName 0.1.2`, `versionCode 19`.
- Usar credenciales de firma correctas de EAS/Play, no un build local firmado
  con debug keystore.
- Pendiente: configurar/asignar en EAS una Google Service Account Key con
  permisos de Play Store Submissions para poder subirlo por `eas submit`.
