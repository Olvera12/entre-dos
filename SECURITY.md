# Seguridad y privacidad de Entre dos

## Alcance

Está diseñada para dos personas que se conocen y pueden estar conectadas a la vez. No es un buzón, plataforma pública de intercambio ni sistema de anonimato. No tiene una auditoría criptográfica externa; las pruebas realizadas no equivalen a certificar su seguridad.

## Qué protege

- WebRTC transporta los archivos por un canal de datos fiable y ordenado, protegido por DTLS. No se crean pistas de cámara ni micrófono. [MDN: canales de datos](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels).
- La app añade AES-256-GCM con Web Crypto a todos los mensajes del canal, incluidos nombres, tamaños, confirmaciones y fragmentos. HKDF-SHA-256 deriva claves separadas para ambas direcciones y para la respuesta de conexión. Cada dirección usa un contador de 64 bits en el IV y exige recibirlo en orden; mensajes repetidos, modificados o fuera de orden cierran la sesión.
- La invitación usa una clave aleatoria de 256 bits, ID aleatorio y vencimiento. La respuesta de conexión se cifra con una clave derivada de esa invitación. La conexión sólo acepta una respuesta; una sesión nueva genera claves nuevas.
- Los enlaces ponen la información de conexión después de `#`. Los fragmentos no se envían en la petición HTTP al host; la app los retira de la dirección visible al iniciar. Se establece `no-referrer`. La invitación original puede permanecer en el chat, portapapeles, sincronización del navegador o registros del sistema.
- Cada archivo requiere aprobación. Los nombres se normalizan, se eliminan caracteres peligrosos de rutas y se muestran con `textContent`. Se rechazan páginas web, SVG y ejecutables por extensión. No se muestran miniaturas ni se reproduce el contenido.
- La ventana de envío limita los fragmentos sin confirmar. La cola de recepción tiene un límite y el receptor confirma después de escribir. SHA-256 se calcula por fragmentos en ambos extremos y sólo se finaliza el guardado cuando los resultados coinciden.
- No hay analítica, scripts CDN, fuentes externas, contraseñas, cookies de la app, localStorage, IndexedDB, service worker ni archivos persistidos por un servidor propio. CSP restringe recursos a los del sitio. Al cerrar se liberan las referencias a claves y temporales; JavaScript no puede garantizar un borrado físico de RAM o swap.

SHA-256 incremental se implementa localmente para evitar cargar un archivo entero en memoria y se compara en pruebas con `node:crypto`. Se usa para integridad de archivos; el cifrado depende de las implementaciones del navegador mediante Web Crypto.

## Quién ve qué

| Participante | Información accesible |
|---|---|
| Pareja receptora | Los archivos aprobados, nombres, tamaños, progreso, metadatos originales y direcciones de conexión. |
| Host de la interfaz (GitHub Pages) | Visitas, IP, peticiones del sitio y el código público. El funcionamiento previsto no le envía claves ni archivos transferidos. |
| STUN de Google, cuando se habilita | IP, consulta y momento de conexión; no retransmite los archivos. |
| Proveedor de Internet y redes | Destinos, IP, horario, tamaño y patrones de tráfico. El contenido del canal va cifrado. |
| Quien obtiene la invitación | La clave compartida y los datos de conexión. Puede intentar hacerse pasar por la pareja mientras siga pendiente. |
| Navegador, sistema operativo y extensiones | Potencial acceso a archivos, portapapeles, memoria y descargas, según sus permisos. |

## Riesgos que permanecen

**La invitación es una credencial**, aunque no haya cuenta ni contraseña. Compártanla sólo por su chat privado y creen otra si se filtra. Comparar el código sirve para comprobar que ambos usan la misma sesión; **no autentica a la persona si alguien ya robó la invitación y su clave**. La confianza en el chat y en el dispositivo sigue siendo necesaria.

El host sirve JavaScript que necesariamente puede leer el archivo elegido antes de cifrarlo. Una cuenta de GitHub comprometida, un cambio malicioso del código, una extensión con acceso al sitio o un dispositivo comprometido podrían robar el contenido. HTTPS y CSP reducen ataques, pero no protegen contra código autorizado malicioso del propio sitio. Mantengan el repositorio bajo su control, 2FA activo, revisen cambios y eviten insertar dependencias externas.

La app no analiza la estructura real ni busca malware en el archivo: una extensión permitida no acredita un contenido seguro. Reciban archivos sólo de su pareja y mantengan sus programas actualizados. El límite de tamaño y de cola reduce consumo accidental o malicioso, pero no convierte esta app en un servicio público resistente a abuso.

La conexión directa revela datos de red entre ambos y no funciona con todas las NAT. Por defecto no usa TURN. Si el dueño configura credenciales de transporte por sesión, un relay retransmite paquetes cifrados: puede observar IP, tiempo y volumen de tráfico, pero no recibe las claves AES del contenido mediante esta función. No se garantiza conexión global.

Conservar el original conserva metadatos y ubicación. Cerrar la sesión no borra archivos ya guardados, registros del chat, sincronización de Fotos/iCloud/OneDrive ni copias del sistema. El consentimiento para enviar y recibir debe existir entre ambos; el receptor controla qué hace después con su copia.

GitHub Pages aloja solamente la interfaz pública. No se guardan ni se publican fotos, videos privados, invitaciones o respuestas en el repositorio. [Límites y condiciones de Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

## Comprobaciones pendientes antes del uso habitual

Prueben primero con un video no privado, en Safari del iPhone real y Chrome/Edge de la computadora. Confirmen que el guardado nativo, el formato y tamaño originales, el código de sesión y la verificación final funcionan en sus redes. Comprueben también el comportamiento al bloquear el teléfono: iOS puede suspender Safari y detener el envío. No se promete transferencia en segundo plano.

## TURN opcional por sesión

La configuración del dueño se valida antes de usarla y en el iPhone al abrir la invitación. Se limita a listas iceServers con esquemas STUN/TURN, puertos válidos y proveedores Metered/Cloudflare permitidos. Campos de administración como API Key se rechazan. No se obtiene configuración de URLs externas introducidas por una invitación. No se añaden permisos de cámara o micrófono ni scripts de terceros.

Las credenciales de transporte se incluyen en el fragmento privado de la invitación, sólo para esta sesión, y deben tratarse como secretos de cuota. Deben tener vencimiento y restricciones cuando el proveedor lo permita. Nunca se publican en el repositorio ni se guardan en el navegador. Un relay no convierte el alojamiento del código en una frontera de confianza distinta: la app y dispositivos siguen teniendo acceso al original.

El sondeo de las credenciales estáticas públicas antiguas de Open Relay no obtuvo una ruta en esta computadora; esas credenciales no se incorporaron al producto. El soporte añadido debe probarse con las credenciales vigentes de la cuenta propia, antes de usar archivos privados.

## Lotes y cancelación individual

El protocolo de datos versión 2 identifica cada fragmento mediante UUID binario dentro del mensaje AES-GCM. Se admiten hasta 12 archivos por lote y tres transferencias simultáneas. La aprobación de una carpeta sólo cubre los IDs de los archivos mostrados, nunca lotes posteriores. La memoria de fallback reserva el tamaño de cada archivo activo además de los Blob pendientes, con un máximo total de 256 MiB.

Cada ventana admite hasta 64 fragmentos sin confirmar, con cola de recepción limitada a 256 mensajes. La cancelación conserva marcadores acotados para descartar paquetes ya enviados sin perder el contador de cifrado. Si cancela el receptor, la ventana se reutiliza después de recibir una confirmación ordenada de que el emisor dejó de enviar ese archivo. Los paquetes siguen cifrados y autenticados, incluso si se descartan después de cancelar.

Un archivo parcial se aborta; los archivos nuevos creados por el guardado de lote se eliminan de la carpeta autorizada al cancelar. El selector individual aborta los cambios sin borrar un archivo previo elegido por el usuario. La finalización verificada deshabilita la cancelación cuando ya se está confirmando el guardado. Los nombres existentes en la carpeta se comprueban y reciben un sufijo; no debe modificarse esa carpeta desde otra aplicación durante el guardado. Los archivos completos guardados anteriormente no se borran.
