  <h1 align="center">
 <span style="color:#25D366;">[🟢] Ryze</span> <span style="color:#FFFFFF;">WhatsApp Web API</span>
</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Versión-9.2.2-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" />
  <img src="https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Estado-Beta-FFAA00?style=for-the-badge" />
</p>

---
⊹ **Ryze** es una librería de JavaScript ligera y completa para interactuar con la API Web de WhatsApp mediante WebSocket.

> [!IMPORTANT]  
> Este proyecto es una versión mejorada de Baileys, diseñada específicamente para facilitar el uso y corregir errores comunes en el desarrollo de bots de WhatsApp.

---

## ⟩ Características

- ✅ **Soporte Multi-Dispositivo**
- 🔄 **Mensajería en Tiempo Real** (texto, multimedia, encuestas, botones)
- 🛠️ **Gestión de Grupos y Canales** (crear, modificar, invitar)
- 🔒 **Cifrado de Extremo a Extremo**
- 📦 **Persistencia de Sesiones**

---

## ⟩ Registro de Cambios

> [!NOTE]
> Mejoras las cuales trae la Baileys.

- 🦖 Mensaje con Logo AI
- 🚀 Limpieza de Buffer del Logger
- 🗄️ Corrección en makeInMemoryStore
- 🍟 Conversión automática de Menciones LID a JID
- 🤖 Conversión de Remitente LID a JID
- 👥 Conversión de ID de Grupo LID a JID
- 🩸 Solución a todos los Bugs LID (participantes, menciones, remitentes, admins)
- 💨 Corrección de Respuesta Lenta
- ⚠️ Botones ContextInfo arreglados según estándares de WhatsApp
- 📣 Soporte completo para Newsletters (Canales)

---

# ⊹ Instalación

> [!NOTE] 
> Copia y pega los comandos en tu terminal.

```bash
npm install github:Ryze/Ryze
```
*O si prefieres yarn:*
```bash
yarn add github:Ryze/Ryze
```

---

# ✜ Inicio Rápido

```javascript
const {
  default: makeWASocket,
  useMultiFileAuthState,
} = require('Ryze');

const {
  state,
  saveCreds
} = await useMultiFileAuthState("./ruta/a/carpeta/sesiones")

/*
 * const sock = makeWASocket({ printQRInTerminal: true });
 * código para obtener la conexión web de WhatsApp
 * disponible código QR o código de emparejamiento
 */

sock.ev.on('messages.upsert', ({ messages }) => {
  console.log('Nuevo mensaje:', messages[0].message);
});
```

---

# ✜ Documentación

### ➤ Conectar Cuenta

<details>
<summary><strong>🔗 Conectar con Código QR</strong></summary>

```javascript
const sock = makeWASocket({
  printQRInTerminal: true, // true para mostrar el código QR
  auth: state
})
```
</details>

<details>
<summary><strong>🔢 Conectar con Código de Emparejamiento</strong></summary>

```javascript
const sock = makeWASocket({
  printQRInTerminal: false, // false para que el código de emparejamiento no se interrumpa
  auth: state
})

if (!sock.authState.creds.registered) {
  const numero = "62xxxx" // Tu número de teléfono

  // usar código de emparejamiento por defecto (ej. 123-456)
  const codigo = await sock.requestPairingCode(numero)

  // usar código personalizado (8 dígitos)
  const codigoPersonalizado = "ABCD4321"
  const codigo = await sock.requestPairingCode(numero, codigoPersonalizado)
  console.log(codigo)
}
```
</details>

<br>

### ➤ Manejo de Eventos

<details>
<summary><strong>📌 Ejemplo para Empezar</strong></summary>

```javascript
sock.ev.on('messages.upsert', ({ messages }) => {
  console.log('Nuevo mensaje:', messages[0].message);
});
```
</details>

<details>
<summary><strong>🗳️ Descifrar Votos de Encuestas</strong></summary>

```javascript
sock.ev.on('messages.update', (m) => {
  if (m.pollUpdates) console.log('Voto de encuesta:', m.pollUpdates);
});
```
</details>

<br>

### ➤ Enviar Mensajes

```javascript
/**
 * Envía un mensaje usando la conexión socket de WhatsApp.
 * 
 * @param {string} jid - El JID (Jabber ID) del destinatario/usuario.
 *                       Es el identificador único para el usuario o grupo de WhatsApp.
 * @param {Object} content - El contenido del mensaje a enviar (texto, imagen, video, etc.).
 * @param {Object} [options] - Parámetros opcionales (citado, efímero, etc.).
 */
const jid = '';        // JID del destinatario
const content = {};     // Objeto del contenido
const options = {};     // Opciones opcionales

// Función base
sock.sendMessage(jid, content, options)
```

<details>
<summary><strong>📝 Mensaje de Texto</strong></summary>

```javascript
// Texto Simple
await sock.sendMessage(jid, { text: '¡Hola!' });
```

```javascript
// Texto con vista previa de enlace
await sock.sendMessage(jid, {
  text: 'Visita https://ejemplo.com',
  linkPreview: {
    'canonical-url': 'https://ejemplo.com',
    title: 'Dominio de Ejemplo',
    description: 'Un sitio web de demostración',
    jpegThumbnail: fs.readFileSync('preview.jpg')
  }
});
```

```javascript
// Con Respuesta Citada (Quoted)
await sock.sendMessage(jid, { text: '¡Hola!' }, { quoted: mensaje });
```
</details>


<details>
<summary><strong>🖼️ Mensaje de Imagen</strong></summary>

```javascript
// Con buffer de archivo local
await sock.sendMessage(jid, { 
  image: fs.readFileSync('imagen.jpg'),
  caption: '¡Mi gato!',
  mentions: ['1234567890@s.whatsapp.net'] // Etiquetar usuarios
});
```

```javascript
// Con URL
await sock.sendMessage(jid, { 
  image: { url: 'https://ejemplo.com/imagen.jpg' },
  caption: 'Imagen descargada'
});
```
</details>

<details>
<summary><strong>🎥 Mensaje de Video</strong></summary>

```javascript
// Con archivo local
await sock.sendMessage(jid, { 
  video: fs.readFileSync('video.mp4'),
  caption: '¡Video divertido!'
});
```

```javascript
// Con URL
await sock.sendMessage(jid, { 
  video: { url: 'https://ejemplo.com/video.mp4' },
  caption: 'Video transmitido'
});
```

```javascript
// Mensaje de "Ver una vez" (View Once)
await sock.sendMessage(jid, {
  video: fs.readFileSync('secreto.mp4'),
  viewOnce: true // Desaparece después de verlo
});
```
</details>

<details>
<summary><strong>🎵 Audio/PTT (Nota de Voz)</strong></summary>

```javascript
// Audio regular (música)
await sock.sendMessage(jid, { 
  audio: fs.readFileSync('audio.mp3'),
  ptt: false 
});
```

```javascript
// Nota de voz (PTT - Push To Talk)
await sock.sendMessage(jid, { 
  audio: fs.readFileSync('voz.ogg'),
  ptt: true, // Aparece como nota de voz
  waveform: [0, 1, 0, 1, 0] // Onda de audio opcional
});
```
</details>

<details>
<summary><strong>👤 Mensaje de Contacto</strong></summary>

```javascript
const vcard = 'BEGIN:VCARD\n' // metadatos de la tarjeta de contacto
  + 'VERSION:3.0\n' 
  + 'FN:Juan Perez\n' // nombre completo
  + 'ORG:Empresa XYZ\n' // organización
  + 'TEL;type=CELL;type=VOICE;waid=521234567890:+52 1 234 567 890\n' // ID + número
  + 'END:VCARD'

await sock.sendMessage(jid, { 
  contacts: { 
    displayName: 'Tu Nombre', 
    contacts: [{ vcard }] 
  }
})
```
</details>

<details>
<summary><strong>💥 Reacciones</strong></summary>

```javascript
await sock.sendMessage(jid, {
  react: {
    text: '👍', // string vacío para quitar la reacción
    key: message.key // clave del mensaje a reaccionar
  }
})
```
</details>

<details>
<summary><strong>📌 Fijar y Mantener Mensajes</strong></summary>

| Tiempo | Segundos        |
|--------|-----------------|
| 24h    | 86.400        |
| 7d     | 604.800       |
| 30d    | 2.592.000     |

```javascript
// Fijar Mensaje
await sock.sendMessage(jid, {
  pin: {
    type: 1, // 1 para fijar, 2 para quitar
    time: 86400,
    key: message.key
  }
})
```

```javascript
// Mantener Mensaje (Keep in Chat)
await sock.sendMessage(jid, {
  keep: {
    key: message.key,
    type: 1 // 1 para mantener, 2 para quitar
  }
})
```
</details>

<details>
<summary><strong>📍 Ubicación</strong></summary>

```javascript
// Ubicación estática
await sock.sendMessage(jid, {
  location: {
    degreesLatitude: 37.422,
    degreesLongitude: -122.084,
    name: 'Sede de Google'
  }
});
```

```javascript
// Ubicación en tiempo real (Live Location)
await sock.sendMessage(jid, {
  location: {
    degreesLatitude: 37.422,
    degreesLongitude: -122.084,
    accuracyInMeters: 10
  },
  live: true, // Habilitar seguimiento en vivo
  caption: '¡Estoy aquí!'
});
```
</details>

<details>
<summary><strong>📞 Llamada</strong></summary>

```javascript
await sock.sendMessage(jid, {
  call: {
    name: 'Mensaje de llamada',
    type: 1 // 1 para audio, 2 para video
  }
})
```
</details>

<details>
<summary><strong>🛒 Pedido (Order)</strong></summary>

```javascript
await sock.sendMessage(jid, {
  order: {
    orderId: '123xxx',
    thumbnail: fs.readFileSync('preview.jpg'),
    itemCount: '123',
    status: 'INQUIRY', // INQUIRY (Consulta) || ACCEPTED (Aceptado) || DECLINED (Rechazado)
    surface: 'CATALOG',
    message: 'Mensaje del pedido',
    orderTitle: 'Título del pedido',
    sellerJid: '628xxx@s.whatsapp.net',
    token: 'token_aqui',
    totalAmount1000: '300000',
    totalCurrencyCode: 'IDR'
  }
})
```
</details>

<details>
<summary><strong>📊 Encuesta</strong></summary>

```javascript
// Crear una encuesta
await sock.sendMessage(jid, {
  poll: {
    name: '¿Color favorito?',
    values: ['Rojo', 'Azul', 'Verde'],
    selectableCount: 1 // 1 para elección única, 0 para múltiple
  }
});
```
</details>

<details>
<summary><strong>👥 Invitación a Grupo</strong></summary>

```javascript
await sock.sendMessage(jid, {
  groupInvite: {
    jid: '123xxx@g.us',
    name: '¡Nombre del Grupo!', 
    caption: 'Invitación para unirte a mi grupo',
    code: 'xYz3yAtf...', // código del enlace de invitación
    expiration: 86400,
    jpegThumbnail: fs.readFileSync('preview.jpg') // opcional            
  }
})
```
</details>

<details>
<summary><strong>↪️ Botones de Respuesta</strong></summary>

```javascript
// Mensaje de Lista (List Message)
await sock.sendMessage(jid, {
  buttonReply: {
    name: 'Hola',
    description: 'descripción', 
    rowId: 'ID'
  }, 
  type: 'list'
})
```

```javascript
// Mensaje de Botón Simple
await sock.sendMessage(jid, {
  buttonReply: {
    displayText: 'Hola', 
    id: 'ID'
  }, 
  type: 'plain'
})
```

```javascript
// Mensaje Interactivo (Native Flow)
await sock.sendMessage(jid, {
  buttonReply: {
    body: 'Hola', 
    nativeFlows: {
      name: 'menu_options', 
      paramsJson: JSON.stringify({ id: 'ID', description: 'descripción' }),
      version: 1 // 2 | 3
    }
  }, 
  type: 'interactive'
})
```
</details>

<details>
<summary><strong>📸 Álbum de Medios</strong></summary>

```javascript
await sock.sendAlbumMessage(jid,
  [{
    image: { url: 'https://ejemplo.com/imagen.jpg' },
    caption: 'Hola Mundo'
  },
  {
    image: fs.readFileSync('imagen.jpg'), 
    caption: 'Hola Mundo'
  },
  {
    video: { url: 'https://ejemplo.com/video.mp4' },
    caption: 'Hola Mundo'
  }],
{ quoted: mensaje, delay: 3000 })
```
</details>

<details>
<summary><strong>👨‍💻 Mensajes Interactivos (Avanzado)</strong></summary>

> Estos mensajes simulan interacciones empresariales avanzadas.

<details>
<summary><strong>Mensaje tipo Tienda (Shop)</strong></summary>

```javascript
// Encabezado de Imagen
await sock.sendMessage(jid, { 
  image: {
    url: 'https://www.ejemplo.com/imagen.jpg'
  },    
  caption: 'Cuerpo del mensaje',
  title: 'Título', 
  subtitle: 'Subtítulo', 
  footer: '© Ryze',
  shop: {
    surface: 1, // 2 | 3 | 4
    id: 'nombre_tienda_facebook'
  }, 
  hasMediaAttachment: true,
  viewOnce: true
})
```
</details>

<details>
<summary><strong>Mensaje Carrusel</strong></summary>
Muestra tarjetas deslizables.

```javascript
await sock.sendMessage(jid, {
  text: 'Cuerpo del mensaje',
  title: 'Título', 
  footer: '© Ryze',
  cards: [{
    image: { url: 'https://www.ejemplo.com/imagen.jpg' },
    title: 'Título tarjeta 1',
    body: 'Cuerpo tarjeta 1',
    footer: '© Ryze',
    buttons: [{
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: 'Ver Más',
        id: '123'
      })
    }]
  }]
})
```
</details>

<details>
<summary><strong>Flujo Nativo (Native Flow Buttons)</strong></summary>

```javascript
// Botón de URL
const native_flow_button = [{
  name: 'cta_url',
  buttonParamsJson: JSON.stringify({
    display_text: 'Visitar Sitio',
    url: 'https://www.ejemplo.com',
    merchant_url: 'https://www.ejemplo.com'
  })
}]

// Botón de Copiar
const native_flow_button_copy = [{
  name: 'cta_copy',
  buttonParamsJson: JSON.stringify({
    display_text: 'Copiar Código',
    copy_code: '12345678'
  })
}]

// Enviar el mensaje con los botones
await sock.sendMessage(jid, {
  text: '¡Elige una opción!',
  title: 'Menú Interactivo',
  footer: '© Ryze',
  interactive: native_flow_button
})
```
</details>
</details>

<br>

### ➤ Canales (Newsletter)

<details>
<summary><strong>📋 Metadatos del Canal</strong></summary>

```javascript
// Usar código de invitación (sin url)
const newsletter = await sock.newsletterMetadata("invite", "0029Vaf0HPMLdQeZsp3XRp2T")
console.log("Metadatos:", newsletter)
```
</details>

<details>
<summary><strong>👥 Seguir / Dejar de Seguir</strong></summary>

```javascript
// Seguir
await sock.newsletterFollow("120363282083849178@newsletter")

// Dejar de seguir
await sock.newsletterUnfollow("120363282083849178@newsletter")
```
</details>

<details>
<summary><strong>🔈 Silenciar / Des-silenciar</strong></summary>

```javascript
await sock.newsletterMute("120363282083849178@newsletter")
await sock.newsletterUnmute("120363282083849178@newsletter")
```
</details>

<details>
<summary><strong>📣 Crear Canal</strong></summary>

```javascript
const newsletter = await sock.newsletterCreate(
  "¡Nombre del Canal!", 
  "¡Descripción aquí!", 
  { url: 'https://ejemplo.com/imagen.jpg' }
)
console.log("Datos del nuevo canal:", newsletter)
```
</details>

<br>

### ➤ Gestión de Grupos

<details>
<summary><strong>🔄 Crear Grupo</strong></summary>

```javascript
const group = await sock.groupCreate("Título del Grupo", ["123@s.whatsapp.net", "456@s.whatsapp.net"]);
console.log("Grupo creado:", group)
```
</details>

<details>
<summary><strong>💯 Añadir, Eliminar, Promover, Degrad</strong></summary>

```javascript
// añadir miembro
await sock.groupParticipantsUpdate(jid, ['usuario@s.whatsapp.net'], 'add')

// eliminar miembro
await sock.groupParticipantsUpdate(jid, ['usuario@s.whatsapp.net'], 'remove')

// promover a admin
await sock.groupParticipantsUpdate(jid, ['usuario@s.whatsapp.net'], 'promote')

// degradar (quitar admin)
await sock.groupParticipantsUpdate(jid, ['usuario@s.whatsapp.net'], 'demote')
```
</details>

<details>
<summary><strong>⚙️ Ajustes del Grupo</strong></summary>

```javascript
// solo admins envían mensajes
await sock.groupSettingUpdate(jid, 'announcement')

// todos envían mensajes
await sock.groupSettingUpdate(jid, 'not_announcement')
```
</details>

<br>

### ➤ Privacidad

<details>
<summary><strong>🚫 Bloquear/Desbloquear</strong></summary>

```javascript
// Bloquear
await sock.updateBlockStatus(jid, 'block');

// Desbloquear
await sock.updateBlockStatus(jid, 'unblock');
```
</details>

<details>
<summary><strong>👀 Última Vez (Last Seen)</strong></summary>

```javascript
// Todos
await sock.updateLastSeenPrivacy("all")
// Nadie
await sock.updateLastSeenPrivacy("none")
```
</details>

<details>
<summary><strong>👁️ Confirmación de Lectura (Blue Ticks)</strong></summary>

```javascript
// Mostrar
await sock.updateReadReceiptsPrivacy("all")
// Ocultar
await sock.updateReadReceiptsPrivacy("none")
```
</details>

<br>

### ➤ Avanzado

<details>
<summary><strong>🔧 Logs de Depuración</strong></summary>

```javascript
const sock = makeWASocket({ logger: { level: 'debug' } });
```
</details>

---

## 🐣 Autor [ Editor ]

<p align="center">
  <img src="https://github.com/Ryze.png" width="120" height="120" alt="Ryze" style="border-radius: 50%;" />
  <br>
  <strong>Ryze</strong>
</p>

---

## ✰ Licencia

Este proyecto está licenciado para **uso personal y no comercial únicamente**.  
Se permite la redistribución, modificación o renombrado para propósitos personales.  
**El uso comercial, reventa está estrictamente prohibido.**

Derechos reservados por **Ryze**.
