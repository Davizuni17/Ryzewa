# 🚀 Ryzewa v9.3.0 - Guía de Mejoras

## 📋 Actualizaciones v9.3.0 (Sincronización con Baileys Oficial)

### Cambios Principales:

- **groups.js**: Mejor manejo de errores (surfacing de errores del servidor), campos nuevos: `notify`, `username`, `phoneNumber`, `descOwnerPn`, `descOwnerUsername`, `ownerPn`, `ownerUsername`, `subjectOwnerPn`, `subjectOwnerUsername`, `descTime`
- **newsletter.js**: Nuevos métodos `newsletterAdminCount()` y `newsletterSubscribers()`
- **messages-send.js**: Tracking de `mediaHost`, `devicesMutex` para seguridad de hilos, mejor deduplicación LID/PN
- **socket.js**: Deprecación de `printQRInTerminal`, tolerancia configurable de keep-alive (`KEEP_ALIVE_TOLERANCE_MS`)
- **messages-recv.js**: Fix de null-checks en `handleNewsletterNotification`, caché de grupo con mejor filtrado LID
- **generics.js**: Nueva función `generateMessageIDV2()` compatible con el oficial, versión WA actualizada a `[2, 3000, 1035194821]`
- **Types/Newsletter.js**: Nuevos QueryIds: `SUBSCRIBERS`, `UPDATE_METADATA`
- **package.json**: Dependencias actualizadas (`protobufjs ^7.5.6`, `ws ^8.18.0`, `p-queue ^8.1.0`, etc.), eliminación de dependencias obsoletas

---

## 📦 Módulos Incluidos

### 1. 🛡️ Anti-Ban (`anti-ban.js`)

Sistema completo de protección contra baneos con delays inteligentes.

```javascript
const { 
    randomDelay,        // Genera delays aleatorios
    messageDelay,       // Delay para mensajes (considera si es grupo)
    typingDelay,        // Delay basado en longitud del texto
    RateLimiter,        // Limitador de rate personalizable
    PresenceManager,    // Gestor de presencia humana
    sanitizeMessage,    // Limpia caracteres sospechosos
    globalRateLimiter   // Rate limiter preconfigurado
} = require('./lib')

// Ejemplo: Delay antes de enviar
await messageDelay(true)  // Para grupos (delay más largo)
await messageDelay(false) // Para privados

// Ejemplo: Rate limiter personalizado
const limiter = new RateLimiter(30, 60000) // 30 msgs/minuto
if (limiter.canSend(jid)) {
    await sock.sendMessage(jid, content)
    limiter.recordSend(jid)
}

// Ejemplo: Presencia realista
const presence = new PresenceManager(sock, logger)
await presence.sendWithPresence(jid, () => sock.sendMessage(jid, msg), msg.text)
```

---

### 2. 🔄 Reconexión Inteligente (`smart-reconnect.js`)

Sistema de reconexión con backoff exponencial y detección de errores.

```javascript
const { 
    SmartReconnect,
    createConnectionHandler,
    withRetry 
} = require('./lib')

// Ejemplo: Manejador de conexión automático
const handler = createConnectionHandler(sock, logger)

sock.ev.on('connection.update', async (update) => {
    const result = await handler.handleConnectionUpdate(update, startBot)
    
    if (result.connected) {
        console.log('✅ Conectado!')
    }
})

// Ejemplo: Ejecutar con reintentos
const result = await withRetry(
    () => sock.sendMessage(jid, content),
    { maxRetries: 3, delay: 1000, backoff: 2 }
)
```

---

### 3. 📋 Cola de Mensajes (`message-queue.js`)

Sistema de colas con prioridad y rate limiting integrado.

```javascript
const { 
    PRIORITY,
    createMessageQueue 
} = require('./lib')

const queue = createMessageQueue(logger)

// Encolar con prioridad
queue.enqueue(
    async () => await sock.sendMessage(jid, content),
    PRIORITY.HIGH,
    { jid, type: 'message' }
)

// Prioridades disponibles:
// PRIORITY.CRITICAL = 0
// PRIORITY.HIGH = 1
// PRIORITY.NORMAL = 2
// PRIORITY.LOW = 3
// PRIORITY.BACKGROUND = 4

// Estadísticas
console.log(queue.getStats())
```

---

### 4. 📦 Caché Mejorado (`enhanced-cache.js`)

Sistema de caché multi-nivel con hot cache y persistencia.

```javascript
const { CacheManager, EnhancedCache } = require('./lib')

const cacheManager = new CacheManager('./cache', logger)
await cacheManager.loadAll()

// Cachés disponibles: signal, groups, profiles, messages, misc
const groupCache = cacheManager.getCache('groups')

// Guardar metadatos de grupo
groupCache.set(groupJid, metadata)

// Obtener con hit rate tracking
const metadata = groupCache.get(groupJid)

// Estadísticas (muestra hit rate, tamaño, etc)
console.log(groupCache.getStats())
```

---

### 5. 📝 Logger Mejorado (`enhanced-logger.js`)

Logger con colores, categorías y historial.

```javascript
const { createLogger } = require('./lib')

const logger = createLogger({
    level: 'debug',
    category: 'mi-bot',
    prettyPrint: true
})

logger.info('Mensaje informativo')
logger.success('¡Operación exitosa!')  // Con emoji ✅
logger.error({ error }, 'Algo falló')

// Child logger con categoría
const msgLogger = logger.child({ class: 'messages' })

// Medir tiempo de operación
const timer = logger.time('operacion')
// ... hacer algo
timer.end('Operación completada')  // Output: "Operación completada: 150ms"

// Log con throttle (evita spam)
logger.throttle('mi-key', 'Este mensaje se mostrará max 1 vez cada 5s')
```

---

### 6. 🤖 Utilidades para Bots (`bot-utils.js`)

Herramientas esenciales para desarrollo de bots.

```javascript
const {
    parseCommand,
    extractMentions,
    extractText,
    extractQuotedMessage,
    isGroupAdmin,
    isBotAdmin,
    getSenderJid,
    CooldownManager,
    PermissionManager,
    parseTime,
    formatDuration
} = require('./lib')

// Parsear comandos
const cmd = parseCommand('.ban @user --reason spam', '.')
// Result: { isCommand: true, command: 'ban', args: ['@user'], flags: { reason: 'spam' } }

// Extraer texto de cualquier tipo de mensaje
const text = extractText(msg.message)

// Obtener mensaje citado
const quoted = extractQuotedMessage(msg.message)

// Verificar si es admin
const isAdmin = await isGroupAdmin(sock, groupJid, userJid)

// Cooldown manager
const cooldowns = new CooldownManager()
if (!cooldowns.isOnCooldown(`${jid}:${cmd}`, 5000)) {
    cooldowns.setCooldown(`${jid}:${cmd}`, 5000)
    // Ejecutar comando
}

// Permission manager
const perms = new PermissionManager({ owners: ['5491234567890'] })
perms.ban('5499876543210@s.whatsapp.net')
if (perms.isOwner(senderJid)) {
    // Comando de owner
}

// Parsear tiempo
const ms = parseTime('2h')  // 7200000
const duration = formatDuration(ms)  // "2h 0m"
```

---

## ⚙️ Configuración Recomendada

```javascript
const sock = makeWASocket({
    logger: createLogger({ level: 'info' }),
    auth: state,
    
    // Anti-ban
    markOnlineOnConnect: true,
    syncFullHistory: false,
    
    // Reconexión
    connectTimeoutMs: 8000,
    keepAliveIntervalMs: 10000,
    maxMsgRetryCount: 10,
    
    // Performance
    enableRecentMessageCache: true,
    
    // Cache de grupos
    cachedGroupMetadata: async (jid) => {
        return cacheManager.getCache('groups').get(jid)
    }
})
```

---

## 🔧 Mejores Prácticas

1. **Siempre usa delays** antes de enviar mensajes
2. **Usa el rate limiter** para evitar enviar demasiados mensajes
3. **Simula presencia** antes de responder
4. **Cachea metadatos** de grupos para reducir requests
5. **Usa colas** para ordenar envíos por prioridad
6. **Implementa cooldowns** para evitar spam de comandos
7. **Sanitiza mensajes** antes de enviar

---

## 📊 Monitoreo

```javascript
// Ver estadísticas de cola
console.log(messageQueue.getStats())

// Ver estadísticas de caché
console.log(cacheManager.getAllStats())

// Ver estadísticas de reconexión
console.log(connectionHandler.getStatus())

// Ver historial de logs
console.log(logger.getHistory({ level: 'error', limit: 10 }))
```

---

## 🎯 Compatibilidad con Choso

Estas mejoras son 100% compatibles con tu bot Choso. Solo necesitas:

1. Actualizar el import de baileys a tu Ryze mejorado
2. Inicializar los managers (queue, cache, cooldowns)
3. Usar los helpers en tu handler

¡Listo! Tu bot será más estable y seguro contra baneos.
