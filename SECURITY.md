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

La conexión directa revela datos de red entre ambos y no funciona con todas las NAT. No usa un servidor TURN; por tanto no hay un tercero que almacene o retransmita los archivos como parte de esta app, pero tampoco una garantía de conexión global.

Conservar el original conserva metadatos y ubicación. Cerrar la sesión no borra archivos ya guardados, registros del chat, sincronización de Fotos/iCloud/OneDrive ni copias del sistema. El consentimiento para enviar y recibir debe existir entre ambos; el receptor controla qué hace después con su copia.

GitHub Pages aloja solamente la interfaz pública. No se guardan ni se publican fotos, videos privados, invitaciones o respuestas en el repositorio. [Límites y condiciones de Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

## Comprobaciones pendientes antes del uso habitual

Prueben primero con un video no privado, en Safari del iPhone real y Chrome/Edge de la computadora. Confirmen que el guardado nativo, el formato y tamaño originales, el código de sesión y la verificación final funcionan en sus redes. Comprueben también el comportamiento al bloquear el teléfono: iOS puede suspender Safari y detener el envío. No se promete transferencia en segundo plano.
