# Entre dos

Web gratuita para enviar fotos y videos del iPhone a una computadora encendida. Transfiere el archivo seleccionado sin comprimirlo, por una conexión directa cifrada. No necesita Firebase, tarjeta, cuentas de usuario, almacenamiento remoto ni instalación en el teléfono.

**Sitio publicado:** [https://olvera12.github.io/entre-dos/](https://olvera12.github.io/entre-dos/). Repositorio: [Olvera12/entre-dos](https://github.com/Olvera12/entre-dos).

**Estado:** publicada en GitHub Pages con HTTPS el 4 de octubre de 2026; verificada su carga y traducciones en el navegador. La transferencia fue verificada en Chrome con dos navegadores y archivos sintéticos. Aún requiere una prueba en Safari de un iPhone real y entre las redes que ustedes usan. La recepción con la computadora apagada no está disponible.

## Publicar gratis en GitHub Pages

1. Crea un **repositorio nuevo**, por ejemplo `entre-dos`. Con GitHub Free, Pages está disponible en repositorios públicos. El código de la app será público; sus archivos e invitaciones no deben estar en el repositorio. [Documentación de GitHub](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).
2. Sube **solamente el contenido de `private-transfer/site/` a la raíz del repositorio nuevo**: `index.html`, `app.mjs`, `security.mjs`, `network.mjs`, `transfer.mjs`, `hash.mjs`, `style.css`, `.nojekyll` y la carpeta `i18n/` con ambos JSON. No subas la carpeta del mod, `test-results`, fotos, videos ni enlaces de conexión.
3. En **Settings → Pages → Build and deployment**, selecciona **Deploy from a branch**, rama `main`, carpeta `/(root)`, y guarda.
4. Espera a que GitHub indique la dirección de Pages. Abre esa dirección con **HTTPS**. No necesitas comprar dominio, configurar secretos ni usar GitHub Actions propios.
5. Protege la cuenta de GitHub con autenticación de dos factores y revisa los cambios de código antes de publicarlos. No añadas publicidad, analítica ni scripts externos a esta app.

La app usa rutas relativas: funciona también en `https://tu-usuario.github.io/entre-dos/`. Cada dispositivo descarga la interfaz desde GitHub, pero los archivos transferidos pasan entre los navegadores mediante WebRTC. No uses el repositorio como almacenamiento de contenido privado.

## Cómo usarla entre ustedes

1. **Tú, en la computadora:** abre la web en Chrome o Edge actualizado, pulsa **En mi computadora** y crea una invitación. Deja marcada **Estamos en redes diferentes** cuando corresponda. Comparte la invitación completa por un chat privado. Mantén esa misma pestaña abierta.
2. **Ella, en el iPhone:** abre la invitación en **Safari**, pulsa **Conectar mi iPhone** y copia su respuesta de conexión. Te devuelve esa respuesta por el mismo chat privado. Si el chat abre un navegador integrado, debe abrir la web en Safari.
3. **Tú:** pega la respuesta en la pestaña original y pulsa **Conectar dispositivos**. No abras la respuesta en una pestaña nueva. Comprueben que ambos muestran el mismo código de conexión. El enlace es una llave de acceso: sólo se comparte entre ustedes. Expira a los 15 minutos si todavía no conectaron.
4. **Ella:** pulsa **Elegir videos o fotos** y selecciona hasta 12 originales desde **Archivos → Explorar**, preferentemente guardados en **En mi iPhone**. Se reciben hasta tres archivos a la vez; el resto espera turno.
5. **Tú:** revisa nombres y tamaños. Acepta uno por uno, o pulsa **Aceptar lote en una carpeta** y elige una carpeta una vez en Chrome/Edge. Esta aprobación sólo cubre el lote visible. Si el nombre ya existe en la carpeta, se añade un sufijo. Puedes rechazar archivos pendientes o pulsar **Cancelar transferencia** en cualquier archivo activo. Cancelar descarta el parcial y deja continuar los demás; no cierra la conexión. Espera **Original verificado**: se calcula SHA-256 en ambos dispositivos y se comprueba que coincida antes de finalizar el archivo.
6. Al terminar, pulsa **Terminar conexión y borrar sesión**. Se liberan claves y temporales de la app; los archivos que guardaste en disco permanecen en tu computadora. El chat, el portapapeles y el sistema operativo tienen su propio historial, que este botón no puede borrar.

## iPhone: conservar el archivo original

La app conserva los **bytes que Safari entrega al seleccionar el archivo**. No puede recuperar calidad si Fotos, iOS o una app de mensajería lo convirtió previamente.

En Fotos, usa **Compartir → Exportar original sin modificar**, si tu versión ofrece esa opción, y guarda el resultado en una ubicación que puedas seleccionar desde Archivos. Apple documenta esa exportación para dispositivos de almacenamiento conectados; las ubicaciones disponibles dependen de iOS. Si esa opción no está disponible para una carpeta local, **Compartir → Opciones → Actual** evita la conversión de formato al compartir; guarda en Archivos y comprueba que conserve extensión y tamaño esperados. La exportación normal puede reflejar ediciones; eso no equivale a recuperar un original sin editar. [Exportación documentada por Apple](https://support.apple.com/guide/iphone/import-and-export-photos-and-videos-iph480caa1f3/ios), [opciones de formato al compartir](https://support.apple.com/guide/iphone/share-photos-and-videos-iphf28f17237/ios).

No selecciones una copia enviada como video por un chat si buscas el original de cámara. Si el original sólo está en iCloud, descárgalo primero; esa descarga depende de la configuración y espacio del teléfono. La app no usa ni modifica iCloud.

Los archivos conservan también sus metadatos, como fecha y ubicación GPS. Quitar metadatos o ediciones cambiaría los bytes, por eso la app no lo hace automáticamente. La verificación comprueba el archivo seleccionado, no certifica que proceda directamente de la cámara.

## Límites prácticos

| Aspecto | Comportamiento |
|---|---|
| Computadora | Chrome o Edge actualizado, preferentemente Windows/macOS con selector de guardado disponible. |
| iPhone | Safari actualizado, pestaña en primer plano y pantalla encendida durante el envío. |
| Archivo | Fotos y videos con extensión permitida; mayor de cero, máximo permitido de 20 GiB. Ese máximo es una política, no una prueba de rendimiento de 20 GiB en iPhone. |
| Guardado | Chrome/Edge escribe por fragmentos directamente en disco. Depende de permisos y espacio libre. |
| Otros navegadores de PC | Descarga en memoria; máximo acumulado de 256 MiB pendiente de descargar. El consumo real del navegador puede ser mayor. El enlace de descarga se libera 30 segundos después de pulsarlo. |
| Redes distintas | STUN ayuda a descubrir direcciones. Algunas NAT, redes móviles, VPN o redes empresariales impiden la conexión directa. Se puede configurar TURN con credenciales de una cuenta gratuita; no se garantiza conexión entre todas las redes. |
| Interrupciones | No hay reanudación ni bandeja offline. Un corte prolongado, bloqueo del iPhone o cierre de pestaña exige empezar de nuevo. |
| Formatos | MOV, MP4, M4V, 3GP, HEIC, HEIF, JPG, JPEG, PNG, WEBP, AVIF, GIF y DNG. El soporte para reproducirlos en Windows es independiente de la transferencia. |

Si no conecta: configuren la retransmisión cifrada de la sección siguiente, o prueben otra Wi-Fi/cambiar la red móvil; creen una invitación nueva y repitan el intercambio. Si están juntos, usen la misma Wi-Fi y desmarquen **Estamos en redes diferentes**. No abran puertos del router para usar esta app. El servicio no cobra, pero su proveedor de Internet puede cobrar los datos consumidos.

## Vista previa local

En esta carpeta, con Node.js instalado:

```powershell
node serve.mjs
```

Abre `http://127.0.0.1:4173`. Este servidor sólo escucha en la computadora y sólo sirve la interfaz: no recibe archivos. Sirve para probar dos pestañas o el diseño; un enlace que empieza con `127.0.0.1` **no abre la app de tu computadora en el iPhone**. Para el uso entre dispositivos publica `site/` mediante HTTPS. No abras `index.html` con doble clic porque los módulos y Web Crypto requieren un origen adecuado.

## Pruebas y estructura

No hay dependencias de ejecución ni paso de compilación. `node --test tests/security.test.mjs` verifica hash incremental, autenticación del cifrado, repetición de mensajes, vencimiento, enlaces, nombres de archivo, validaciones y traducciones. La prueba opcional `node tests/browser.mjs` necesita Playwright y Chrome instalados, además del servidor local; `ENTREDOS_BROWSER` permite elegir el ejecutable. Playwright es una herramienta de desarrollo y nunca se carga en la web publicada.

Se verificó una descarga en memoria de 2 MiB y una transferencia de 32 MiB con escritura fragmentada lenta simulada; ambas coincidieron con SHA-256 de Node. También se verificaron aprobación, rechazo, cierre, aborto de archivo parcial, traducción inglesa, eliminación del fragmento de invitación y ausencia de peticiones externas en modo local. El selector nativo de guardado se simuló en esa prueba automatizada: aún debe comprobarse manualmente en Chrome/Edge junto a un iPhone real.

`site/` contiene todo lo publicable; `serve.mjs` es el servidor de vista previa y `tests/` sólo contiene pruebas. Lee [SECURITY.md](SECURITY.md) para el alcance y los límites de privacidad.

Firebase Storage se descartó porque su acceso requiere el plan Blaze con facturación vinculada, aunque pueda ofrecer cuotas sin cargo. Eso no satisface el requisito de evitar facturación. [Cambio oficial de Firebase](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).

## Retransmisión cifrada para redes restrictivas

La conexión directa puede fallar aunque ambas personas tengan Internet. El 4 de octubre se añadió soporte TURN a petición del usuario, con credenciales privadas por sesión. No hay un relay activado globalmente en el código público.

1. Crea tu cuenta gratuita de Metered/Open Relay y entra a su panel de TURN. La documentación anuncia 20 GB mensuales gratuitos; comprueba en tu cuenta la cuota y que no tengas facturación o sobreconsumo de pago activados. No añadas tarjeta. [Documentación oficial](https://www.metered.ca/tools/openrelay/).
2. Obtén la lista **iceServers** de tu proveedor, con URLs TURN, username y credential. Usa credenciales de transporte con vencimiento cuando sea posible. No uses Secret Key, API Key, claves de administración ni datos de pago en la app.
3. En la computadora, pulsa **En mi computadora**, mantén **Estamos en redes diferentes** y abre **Si sus redes no conectan: retransmisión cifrada**. Pega sólo la lista JSON iceServers. Se admiten URLs del dominio metered.ca y turn.cloudflare.com; el módulo valida esquemas, puertos, campos y tamaño.
4. Crea una invitación nueva. El iPhone recibe la misma configuración dentro del enlace privado y devuelve una respuesta nueva. Ambos deben recargar la app publicada antes de repetir el intercambio. No reutilicen invitaciones anteriores.

El proveedor puede observar IP, hora y volumen de tráfico cifrado. AES-GCM y DTLS siguen protegiendo el contenido. Las credenciales TURN viajan dentro de la invitación privada: compártanla sólo entre ustedes y no la publiquen, ya que las credenciales también podrían consumir la cuota. No se persisten en localStorage, código publicado o GitHub. El campo se vacía al crear o cerrar la sesión.

Se amplió la espera para descubrir rutas de ocho a veinte segundos y se añadió un error específico si la configuración TURN no produce ninguna ruta de retransmisión. Una clave vencida, cuota agotada o bloqueo completo de red todavía puede impedir conectar. El relay real requiere las credenciales de la cuenta; no se afirma que esté verificado hasta probarlas.

## Lotes, cancelación y rendimiento

Ambos dispositivos deben recargar la web y crear una invitación nueva después de esta actualización del protocolo. Hasta 12 originales por lote, tres simultáneos. Sin acceso a carpetas, se conserva la descarga individual en memoria con un máximo de 256 MiB acumulados y reservados para archivos activos.

La lectura del emisor usa bloques de un MiB; los mensajes cifrados se mantienen menores de 16 KiB. La ventana pasó de ocho a 64 fragmentos por archivo, con confirmación tras escritura cada 16 fragmentos. El vaciado del canal y las confirmaciones despiertan al envío sin esperar un sondeo fijo. La interfaz actualiza el progreso como máximo diez veces por segundo. Son mejoras para reducir esperas de la app; no se promete multiplicar la velocidad de Internet ni del relay. Referencias: https://www.rfc-editor.org/rfc/rfc8831.html y https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/bufferedAmountLowThreshold.

En las pruebas con datos sintéticos se verificaron tres transferencias concurrentes, un cuarto archivo en cola, originales idénticos por SHA-256, conservación de nombres existentes y cancelación individual desde ambos dispositivos sin cerrar la conexión. Los selectores de archivos y carpetas del sistema se simulan: el uso real en Safari, permisos nativos y retransmisión por Metered sigue pendiente de comprobación.
