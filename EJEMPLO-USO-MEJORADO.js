/**
 * ====================================
 * 🚀 EJEMPLO DE USO - RYZE MEJORADO
 * ====================================
 * 
 * Este archivo muestra cómo integrar las mejoras de Ryze
 * en tu bot Choso para mayor estabilidad y anti-ban.
 */

const { 
    // Core
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    
    // Nuevas utilidades anti-ban
    ANTI_BAN_CONFIG,
    randomDelay,
    messageDelay,
    typingDelay,
    RateLimiter,
    PresenceManager,
    sanitizeMessage,
    globalRateLimiter,
    
    // Sistema de reconexión
    SmartReconnect,
    createConnectionHandler,
    withRetry,
    
    // Sistema de colas
    PRIORITY,
    MessageQueue,
    createMessageQueue,
    
    // Cache mejorado
    CacheManager,
    EnhancedCache,
    
    // Logger mejorado
    createLogger,
    
    // Utilidades para bots
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
    formatDuration,
    sendFast
    
} = require('./lib')

// =====================================
// CONFIGURACIÓN
// =====================================

const config = {
    // Prefijo de comandos
    prefix: '.',
    
    // Owners del bot
    owners: ['5491234567890'],
    
    // Directorio de sesión
    sessionDir: './sessions',
    
    // Configuración de logs
    logLevel: 'info'
}

// =====================================
// INICIALIZACIÓN
// =====================================

async function startBot() {
    // Logger mejorado con colores
    const logger = createLogger({
        level: config.logLevel,
        category: 'choso-bot',
        prettyPrint: true
    })
    
    // Estado de autenticación
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir)
    
    // Cola de mensajes con prioridad
    const messageQueue = createMessageQueue(logger)
    
    // Gestor de cooldowns
    const cooldowns = new CooldownManager()
    
    // Gestor de permisos
    const permissions = new PermissionManager({
        owners: config.owners
    })
    
    // Cache manager
    const cacheManager = new CacheManager(config.sessionDir, logger)
    await cacheManager.loadAll()
    
    // Crear socket de WhatsApp
    const sock = makeWASocket({
        logger,
        auth: state,
        printQRInTerminal: true,
        
        // Configuraciones anti-ban
        markOnlineOnConnect: true,
        syncFullHistory: false,
        
        // Usar cache mejorado
        cachedGroupMetadata: async (jid) => {
            return cacheManager.getCache('groups').get(jid)
        }
    })
    
    // Gestor de presencia para anti-ban
    const presenceManager = new PresenceManager(sock, logger)
    
    // Manejador de conexión inteligente
    const connectionHandler = createConnectionHandler(sock, logger)
    
    // =====================================
    // EVENTOS
    // =====================================
    
    // Guardar credenciales
    sock.ev.on('creds.update', saveCreds)
    
    // Actualización de conexión con reconexión inteligente
    sock.ev.on('connection.update', async (update) => {
        const result = await connectionHandler.handleConnectionUpdate(update, startBot)
        
        if (result.connected) {
            logger.success('¡Conectado exitosamente!')
            presenceManager.startPeriodicPresence()
        }
        
        if (result.qr) {
            logger.info('Escanea el código QR')
        }
    })
    
    // Mensajes recibidos
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return
        
        for (const msg of messages) {
            // Ignorar mensajes propios
            if (msg.key.fromMe) continue
            
            // Procesar mensaje
            await handleMessage(sock, msg, {
                logger,
                messageQueue,
                cooldowns,
                permissions,
                presenceManager,
                cacheManager,
                config
            })
        }
    })
    
    // Cache de metadatos de grupos
    sock.ev.on('groups.update', async (updates) => {
        for (const update of updates) {
            if (update.id) {
                const metadata = await sock.groupMetadata(update.id)
                cacheManager.getCache('groups').set(update.id, metadata)
            }
        }
    })
    
    return sock
}

// =====================================
// MANEJADOR DE MENSAJES
// =====================================

async function handleMessage(sock, msg, context) {
    const { 
        logger, 
        messageQueue, 
        cooldowns, 
        permissions, 
        presenceManager,
        config 
    } = context
    
    try {
        const jid = msg.key.remoteJid
        const senderJid = getSenderJid(msg)
        const text = extractText(msg.message)
        
        // Verificar si está baneado
        if (permissions.isBanned(senderJid)) {
            logger.debug({ senderJid }, 'Usuario baneado, ignorando')
            return
        }
        
        // Parsear comando
        const cmd = parseCommand(text, config.prefix)
        
        if (!cmd.isCommand) return
        
        logger.info({ 
            command: cmd.command, 
            sender: senderJid,
            args: cmd.args 
        }, 'Comando recibido')
        
        // Verificar cooldown (3 segundos entre comandos)
        const cooldownKey = `${senderJid}:${cmd.command}`
        if (cooldowns.isOnCooldown(cooldownKey, 3000)) {
            const remaining = cooldowns.getRemainingTime(cooldownKey)
            logger.debug({ remaining }, 'Usuario en cooldown')
            return
        }
        cooldowns.setCooldown(cooldownKey, 3000)
        
        // Encolar el procesamiento del comando con prioridad
        const priority = permissions.isOwner(senderJid) 
            ? PRIORITY.HIGH 
            : PRIORITY.NORMAL
        
        messageQueue.enqueue(
            async () => {
                await executeCommand(sock, msg, cmd, context)
            },
            priority,
            { jid, command: cmd.command }
        )
        
    } catch (error) {
        logger.error({ error: error.message }, 'Error procesando mensaje')
    }
}

// =====================================
// EJECUTOR DE COMANDOS
// =====================================

async function executeCommand(sock, msg, cmd, context) {
    const { logger, presenceManager, permissions } = context
    const jid = msg.key.remoteJid
    const senderJid = getSenderJid(msg)
    
    // Usar presencia para anti-ban
    await presenceManager.simulatePresence(jid, 'composing')
    
    // Delay anti-ban antes de responder
    await messageDelay(jid.endsWith('@g.us'))
    
    switch (cmd.command) {
        case 'ping': {
            const start = Date.now()
            await sock.sendMessage(jid, { 
                text: `🏓 Pong!\n⏱️ Latencia: ${Date.now() - start}ms` 
            })
            break
        }
        
        // ⚡ Respuesta INSTANTÁNEA (sin simular "escribiendo…", mínima latencia)
        // Ideal cuando quieres que el bot conteste súper rápido.
        case 'fast': {
            await sendFast(sock, jid, '⚡ Respuesta instantánea', {
                quoted: msg,      // cita el mensaje original
                markRead: true    // marca como leído en paralelo (no bloqueante)
            })
            break
        }
        
        case 'menu':
        case 'help': {
            const menu = `
╭━━━━━━━━━━━━━━╮
│   🤖 *CHOSO BOT*
╰━━━━━━━━━━━━━━╯

📋 *Comandos:*
• ${cmd.prefix}ping - Verificar latencia
• ${cmd.prefix}info - Información del bot
• ${cmd.prefix}stats - Estadísticas

👑 *Owner:*
• ${cmd.prefix}ban @user
• ${cmd.prefix}unban @user
• ${cmd.prefix}broadcast [msg]

━━━━━━━━━━━━━━━
            `.trim()
            
            await sock.sendMessage(jid, { text: sanitizeMessage(menu) })
            break
        }
        
        case 'info': {
            const stats = messageQueue.getStats()
            const info = `
📊 *Información del Bot*

🔌 Estado: Conectado
📨 Mensajes en cola: ${stats.currentQueueSize}
✅ Procesados: ${stats.totalProcessed}
❌ Fallidos: ${stats.totalFailed}
            `.trim()
            
            await sock.sendMessage(jid, { text: info })
            break
        }
        
        case 'ban': {
            if (!permissions.isOwner(senderJid)) {
                await sock.sendMessage(jid, { text: '❌ Solo el owner puede usar este comando' })
                return
            }
            
            const mentions = extractMentions(msg.message)
            if (mentions.length === 0) {
                await sock.sendMessage(jid, { text: '❌ Menciona a un usuario' })
                return
            }
            
            for (const mention of mentions) {
                permissions.ban(mention)
            }
            
            await sock.sendMessage(jid, { 
                text: `✅ ${mentions.length} usuario(s) baneado(s)` 
            })
            break
        }
        
        case 'unban': {
            if (!permissions.isOwner(senderJid)) {
                await sock.sendMessage(jid, { text: '❌ Solo el owner puede usar este comando' })
                return
            }
            
            const mentions = extractMentions(msg.message)
            for (const mention of mentions) {
                permissions.unban(mention)
            }
            
            await sock.sendMessage(jid, { 
                text: `✅ ${mentions.length} usuario(s) desbaneado(s)` 
            })
            break
        }
        
        default:
            logger.debug({ command: cmd.command }, 'Comando no reconocido')
    }
}

// =====================================
// FUNCIÓN DE ENVÍO CON ANTI-BAN
// =====================================

/**
 * Envía mensaje con todas las protecciones anti-ban
 */
async function safeSendMessage(sock, jid, content, options = {}) {
    const { presenceManager, logger } = options
    
    // Verificar rate limit
    if (!globalRateLimiter.canSend(jid)) {
        await globalRateLimiter.waitForSlot(jid)
    }
    
    // Simular presencia si está disponible
    if (presenceManager) {
        await presenceManager.simulatePresence(jid, 'composing')
    }
    
    // Delay anti-ban
    await messageDelay(jid.endsWith('@g.us'))
    
    // Sanitizar contenido de texto
    if (content.text) {
        content.text = sanitizeMessage(content.text)
    }
    
    // Enviar con retry automático
    return withRetry(
        () => sock.sendMessage(jid, content),
        {
            maxRetries: 3,
            delay: 1000,
            backoff: 2,
            onRetry: (error, attempt) => {
                logger?.warn({ error: error.message, attempt }, 'Reintentando envío')
            }
        }
    )
}

// =====================================
// BROADCAST CON ANTI-BAN
// =====================================

/**
 * Envía mensaje a múltiples usuarios con delays seguros
 */
async function safeBroadcast(sock, jids, content, options = {}) {
    const { logger, onProgress } = options
    const results = { success: 0, failed: 0 }
    
    for (let i = 0; i < jids.length; i++) {
        const jid = jids[i]
        
        try {
            // Delay largo para broadcasts
            await new Promise(r => setTimeout(r, randomDelay(2000, 4000)))
            
            await sock.sendMessage(jid, content)
            results.success++
            
            if (onProgress) {
                onProgress(i + 1, jids.length, jid, true)
            }
            
        } catch (error) {
            results.failed++
            logger?.error({ jid, error: error.message }, 'Error en broadcast')
            
            if (onProgress) {
                onProgress(i + 1, jids.length, jid, false)
            }
        }
    }
    
    return results
}

// =====================================
// INICIAR BOT
// =====================================

startBot().catch(console.error)

module.exports = {
    startBot,
    handleMessage,
    executeCommand,
    safeSendMessage,
    safeBroadcast
}
