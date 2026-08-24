# Módulo Interactive (v4.7)

> Basado en **NIXCODE MessageBuilder V4.7**, creado por [Nixel](https://whatsapp.com/channel/0029VbCV1ck8fewpdNb2TY2k) (contribuciones: ~ Ahmad tumbuh kembang). Portado a CommonJS e integrado en Ryzewa con su permiso de uso y modificación.

Builders de mensajes interactivos y enriquecidos integrados en Ryzewa. Todo se exporta desde el paquete principal:

```js
const { Button, ButtonV2, Carousel, AIRich, Toolkit } = require('ryzewa')
```

> **Dependencias opcionales:** `sharp` (redimensionar thumbnails) y `fluent-ffmpeg` + ffmpeg (miniaturas de video en `AIRich.addVideo`). Si no están instaladas, el módulo funciona igual pero sin esas mejoras.

---

## Button — mensaje interactivo (native flow)

Quick replies, listas, botones de URL, llamada, copiar código, etc.

```js
await new Button(sock)
    .setTitle('Título')          // título del header
    .setBody('Elige una opción') // cuerpo
    .setFooter('Mi Bot')         // pie
    .setImage('https://ejemplo.com/foto.jpg') // media opcional en el header
    .addReply('📋 Menú', '.menu')
    .addUrl('🌐 Canal', 'https://whatsapp.com/channel/xxxx')
    .addCopy('📎 Copiar código', 'ABC123')
    .addCall('📞 Llamar', '+50412345678')
    .send(jid, { quoted: m })
```

Lista desplegable (single select):

```js
await new Button(sock)
    .setBody('Menú principal')
    .addSelection('Ver opciones')       // crea la lista
    .makeSection('Comandos', 'NUEVO')   // crea una sección
    .makeRow('', 'Ping', 'Responde pong', '.ping')
    .makeRow('', 'Ayuda', 'Muestra la ayuda', '.help')
    .send(jid)
```

Otros botones: `addReminder()`, `addCancelReminder()`, `addAddress()`, `addLocation()`, `addButton(name, params)` (crudo), `setParams()` (ver `Button.paramsList`), `setDocument()`, `setMedia()`, `clearButtons()`, `loadFrom(msg)`.

`toCard()` devuelve la card para usarla en un `Carousel`.

## ButtonV2 — botones clásicos (buttonsMessage)

Compatibles con más versiones del cliente. Header de ubicación con thumbnail.

```js
await new ButtonV2(sock)
    .setTitle('Mi Bot')                 // nombre en el header de ubicación
    .setSubtitle('Siempre activo')
    .setThumbnail('https://ejemplo.com/logo.png') // url o buffer
    .setBody('Elige una opción')
    .setFooter('Ryzewa')
    .addButton('Opción 1', 'id1')
    .addButton('Opción 2', 'id2')
    .send(jid, { quoted: m })
```

También: `addRawButton(obj)` (con `nativeFlowInfo`), `setRawThumbnail(base64)`, `setMedia(obj)`, `loadFrom(msg)`.

## Carousel — carrusel de cards

Cada card debe llevar imagen o video en el header (usa `Button#toCard()`):

```js
const card1 = await new Button(sock)
    .setImage('https://ejemplo.com/1.jpg')
    .setBody('Card 1')
    .addReply('Ver más', '.ver1')
    .toCard()

const card2 = await new Button(sock)
    .setImage('https://ejemplo.com/2.jpg')
    .setBody('Card 2')
    .addUrl('Abrir', 'https://ejemplo.com')
    .toCard()

await new Carousel(sock)
    .setBody('🛍️ Nuestro catálogo')
    .setFooter('Desliza para ver más')
    .addCard([card1, card2])
    .send(jid, { quoted: m })
```

## AIRich — mensajes estilo Meta AI

Markdown con entidades inline, código resaltado, tablas, imágenes, videos, fuentes, productos, posts, widgets y sugerencias.

```js
await new AIRich(sock)
    .setTitle('Mi Bot AI')     // texto del disclaimer
    .setFooter('ryzewa v9')    // metadato final
    .addText('Hola, esto es *markdown* con [un link](https://ejemplo.com) y una cita [](https://fuente.com)')
    .addCode('javascript', 'console.log("hola")')
    .addTable([
        ['Comando', 'Descripción'],  // primera fila = cabecera
        ['.ping', 'Responde pong'],
        ['.menu', 'Muestra el menú']
    ])
    .addImage('https://ejemplo.com/imagen.png')
    .addSuggest(['📋 Menú', '❓ Ayuda'])   // pills tocables
    .send(jid, { quoted: m })
```

Sintaxis de entidades inline en `addText`:

- `[texto](url)` → hyperlink (con `[texto](!url)` se marca como no confiable)
- `[](url)` → cita numerada ¹
- `[expresion|ancho|alto](<url-imagen>)` → LaTeX renderizado

Más contenido: `addFOAText()`, `addSource([...])`, `addReels([...])`, `addVideo(url)`, `addProduct({...})`, `addPost({...})`, `addMetadata()`, `addTip()`, `addWidget({...})`, `addFooterAction({...})`.

### Gestión por id

Cada `add*` acepta `{ id, replace, insertAt }`:

```js
const rich = new AIRich(sock)
rich.addText('Cargando…', { id: 'estado' })
// más tarde:
rich.addText('✅ Listo', { replace: 'estado' })
rich.remove('otro-id')   // eliminar
rich.has('estado')       // true
rich.ids()               // ['estado']
```

- `insertAt: 'id'` inserta **después** del nodo con ese id; `insertAt: ['id', -1]` inserta antes (acepta `[id, offset]`).
- `replace: 'id'` reemplaza el nodo y conserva su id.
- `delete('id')` elimina un nodo; `hasId(id)`, `getIds()`, `peek(id)`, `assignId(index, id)` para inspección.
- `.items` extrae los primitivos de una instancia para mezclarlos en otra con `addSection(AIRich.newLayout('HScroll', otro.items))`.

`send()` envía y hace una **auto-edición inmediata** (`bypassDownload`, activada por defecto) para que la media se renderice sin botón de descarga. `sendEdit(jid?, id?)` edita el último mensaje enviado con el contenido actual — la edición viaja envuelta en `botForwardedMessage` (así hace Meta AI el streaming):

```js
const rich = new AIRich(conn).setTitle('Mi bot').addText('Generando el video...', { id: 'status' })
await rich.send(jid)
rich.addVideo('', { status: 'GENERATING', estimatedTime: 15000, insertAt: 'status', id: 'art' })
await rich.sendEdit()
// ...cuando el video esté listo:
rich.addVideo('https://cdn.ejemplo.com/video.mp4', { replace: 'art' })
rich.addText('Listo.', { replace: 'status' })
rich.addSuggest(['Otro', 'Más largo'])
await rich.sendEdit()
```

Opciones del constructor: `new AIRich(sock, { dynamic: true, unsupportedTypeAlert: true })` — `dynamic` regenera los response ids en cada build; `unsupportedTypeAlert` añade un aviso de texto para clientes que no renderizan ciertos primitivos.

## Toolkit

Utilidades sueltas: `Toolkit.extractIE(text)`, `Toolkit.resolveMedia(sock, media, tipo, opts)`, `Toolkit.fetchBuffer(url)`, `Toolkit.resize(buffer, w, h)`, `Toolkit.getMp4Duration(buffer)`, `Toolkit.getMp4Preview(buffer)`, `Toolkit.toUrl(sock, media)`, `Toolkit.stringifyEscaped(obj)`, `Toolkit.waitAllPromises(obj)`.

## Errores tipados

`AIRichError`, `ItemNotFoundError` (`ITEM_NOT_FOUND`), `DuplicateIdError` (`DUPLICATE_ID`), `InvalidTargetError` (`INVALID_TARGET`), `ContentValidationError` (`CONTENT_VALIDATION`) — todos con propiedad `code`.
