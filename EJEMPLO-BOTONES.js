/**
 * ============================================
 * 🎛️ EJEMPLO DE BOTONES E INTERACTIVOS - RYZE
 * ============================================
 * 
 * Todos los tipos de botones, listas, interactivos
 * y mensajes especiales soportados por Ryze.
 * Compatible con la API de @fizzxydev/baileys-pro
 */

const {
    makeWASocket,
    useMultiFileAuthState,
    generateWAMessageFromContent,
    generateWAMessageContent,
    proto
} = require('./lib')

// =====================================
// 1. BOTONES SIMPLES
// =====================================

/**
 * Envía botones básicos con texto
 */
async function enviarBotonesSimples(sock, jid) {
    await sock.sendMessage(jid, {
        text: "¡Hola! Elige una opción:",
        footer: "Ryze Bot - 2025",
        buttons: [
            {
                buttonId: 'btn_1',
                buttonText: { displayText: '📋 Menu' },
                type: 1
            },
            {
                buttonId: 'btn_2',
                buttonText: { displayText: '⚡ Ping' },
                type: 1
            },
            {
                buttonId: 'btn_3',
                buttonText: { displayText: '👤 Info' },
                type: 1
            }
        ],
        headerType: 1,
        viewOnce: true
    })
}

// =====================================
// 2. BOTONES FLOW (Mixtos: botones + lista nativa)
// =====================================

/**
 * Envía botones mixtos: algunos son botones normales
 * y otros abren una lista de selección (nativeFlow)
 */
async function enviarBotonesFlow(sock, jid, quoted) {
    await sock.sendMessage(jid, {
        text: "¡Panel de Control!",
        footer: "© Ryze Bot",
        buttons: [
            {
                buttonId: '.menu',
                buttonText: { displayText: '📋 MENU PRINCIPAL' },
                type: 1,
            },
            {
                buttonId: '.owner',
                buttonText: { displayText: '👑 OWNER' },
                type: 1,
            },
            {
                buttonId: 'action_list',
                buttonText: { displayText: '🔽 Ver Categorías' },
                type: 4,
                nativeFlowInfo: {
                    name: 'single_select',
                    paramsJson: JSON.stringify({
                        title: 'Selecciona una categoría',
                        sections: [
                            {
                                title: 'Herramientas',
                                highlight_label: '🛠️',
                                rows: [
                                    {
                                        header: '🔍 Buscador',
                                        title: 'Google Search',
                                        description: 'Busca en Google desde aquí',
                                        id: '.google',
                                    },
                                    {
                                        header: '🖼️ Stickers',
                                        title: 'Crear Sticker',
                                        description: 'Convierte imagen a sticker',
                                        id: '.sticker',
                                    },
                                ],
                            },
                            {
                                title: 'Entretenimiento',
                                highlight_label: '🎮',
                                rows: [
                                    {
                                        header: '🎵 Música',
                                        title: 'Descargar Música',
                                        description: 'Descarga música de YouTube',
                                        id: '.play',
                                    },
                                    {
                                        header: '📹 Video',
                                        title: 'Descargar Video',
                                        description: 'Descarga video de YouTube',
                                        id: '.video',
                                    },
                                ],
                            },
                        ],
                    }),
                },
            },
        ],
        headerType: 1,
        viewOnce: true
    }, { quoted })
}

// =====================================
// 3. INTERACTIVO con NativeFlow Buttons
// =====================================

/**
 * Envía mensaje interactivo con múltiples tipos de botones:
 * - quick_reply: respuesta rápida
 * - cta_url: abrir URL
 * - cta_call: llamada
 * - cta_copy: copiar texto
 * - single_select: lista
 * - send_location: enviar ubicación
 */
async function enviarInteractivo(sock, jid, quoted) {
    await sock.sendMessage(jid, {
        text: "Descripción del mensaje interactivo",
        title: "🤖 Panel Interactivo",
        subtitle: "Elige una acción",
        footer: "Ryze Bot © 2025",
        interactiveButtons: [
            {
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                    display_text: "✅ Aceptar",
                    id: "accept"
                })
            },
            {
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                    display_text: "❌ Rechazar",
                    id: "reject"
                })
            },
            {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                    display_text: "🌐 Visitar Web",
                    url: "https://github.com"
                })
            },
            {
                name: "cta_copy",
                buttonParamsJson: JSON.stringify({
                    display_text: "📋 Copiar Código",
                    id: "copy_code",
                    copy_code: "ABC123XYZ"
                })
            },
            {
                name: "cta_call",
                buttonParamsJson: JSON.stringify({
                    display_text: "📞 Llamar",
                    id: "+1234567890"
                })
            },
            {
                name: "single_select",
                buttonParamsJson: JSON.stringify({
                    title: "📜 Ver Opciones",
                    sections: [
                        {
                            title: "Configuración",
                            highlight_label: "⚙️",
                            rows: [
                                {
                                    header: "Idioma",
                                    title: "Cambiar Idioma",
                                    description: "Español / English",
                                    id: "change_lang"
                                },
                                {
                                    header: "Tema",
                                    title: "Cambiar Tema",
                                    description: "Claro / Oscuro",
                                    id: "change_theme"
                                }
                            ]
                        }
                    ]
                })
            },
            {
                name: "send_location",
                buttonParamsJson: ""
            }
        ]
    }, { quoted })
}

// =====================================
// 4. INTERACTIVO CON IMAGEN/VIDEO
// =====================================

/**
 * Envía interactivo con imagen como header
 */
async function enviarInteractivoConImagen(sock, jid, quoted) {
    await sock.sendMessage(jid, {
        image: { url: "https://placehold.co/600x400/png" },
        caption: "Descripción con imagen",
        title: "Título del Mensaje",
        subtitle: "Subtítulo",
        footer: "Ryze Bot",
        media: true,
        interactiveButtons: [
            {
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                    display_text: "👍 Me gusta",
                    id: "like"
                })
            },
            {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                    display_text: "🔗 Ver más",
                    url: "https://example.com"
                })
            }
        ]
    }, { quoted })
}

// =====================================
// 5. INTERACTIVO CON PRODUCTO
// =====================================

/**
 * Header con producto
 */
async function enviarInteractivoProducto(sock, jid, quoted) {
    await sock.sendMessage(jid, {
        product: {
            productImage: { url: "https://placehold.co/600x400/png" },
            productImageCount: 1,
            title: "Producto Premium",
            description: "La mejor calidad",
            priceAmount1000: 20000 * 1000,
            currencyCode: "USD",
            retailerId: "shop001",
            url: "https://example.com/product",
        },
        businessOwnerJid: "1234@s.whatsapp.net",
        caption: "¡Oferta especial!",
        title: "Tienda Ryze",
        footer: "Envío gratis",
        media: true,
        interactiveButtons: [
            {
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                    display_text: "🛒 Comprar",
                    id: "buy"
                })
            },
            {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                    display_text: "🔗 Ver en tienda",
                    url: "https://example.com"
                })
            }
        ]
    }, { quoted })
}

// =====================================
// 6. MENSAJE INTERACTIVO con Proto directo
// =====================================

/**
 * Uso avanzado: crear interactivo usando proto directamente
 * (máxima flexibilidad)
 */
async function enviarInteractivoProto(sock, jid) {
    let msg = generateWAMessageFromContent(jid, {
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2
                },
                interactiveMessage: proto.Message.InteractiveMessage.create({
                    body: proto.Message.InteractiveMessage.Body.create({
                        text: "Cuerpo del mensaje"
                    }),
                    footer: proto.Message.InteractiveMessage.Footer.create({
                        text: "Ryze Bot"
                    }),
                    header: proto.Message.InteractiveMessage.Header.create({
                        title: "Título",
                        subtitle: "Subtítulo",
                        hasMediaAttachment: false
                    }),
                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                        buttons: [
                            {
                                name: "single_select",
                                buttonParamsJson: JSON.stringify({
                                    title: "Menú",
                                    sections: [{
                                        title: "Sección 1",
                                        highlight_label: "⭐",
                                        rows: [
                                            { header: "Opción 1", title: "Primera opción", description: "Descripción", id: "opt1" },
                                            { header: "Opción 2", title: "Segunda opción", description: "Descripción", id: "opt2" }
                                        ]
                                    }]
                                })
                            },
                            {
                                name: "cta_reply",
                                buttonParamsJson: JSON.stringify({ display_text: "Responder", id: "reply" })
                            },
                            {
                                name: "cta_url",
                                buttonParamsJson: JSON.stringify({ display_text: "Abrir URL", url: "https://google.com", merchant_url: "https://google.com" })
                            },
                            {
                                name: "cta_call",
                                buttonParamsJson: JSON.stringify({ display_text: "Llamar", id: "+1234567890" })
                            },
                            {
                                name: "cta_copy",
                                buttonParamsJson: JSON.stringify({ display_text: "Copiar", id: "copy123", copy_code: "CODIGO123" })
                            },
                            {
                                name: "cta_reminder",
                                buttonParamsJson: JSON.stringify({ display_text: "Recordatorio", id: "reminder" })
                            },
                            {
                                name: "cta_cancel_reminder",
                                buttonParamsJson: JSON.stringify({ display_text: "Cancelar Recordatorio", id: "cancel_rem" })
                            },
                            {
                                name: "address_message",
                                buttonParamsJson: JSON.stringify({ display_text: "Enviar Dirección", id: "address" })
                            },
                            {
                                name: "send_location",
                                buttonParamsJson: ""
                            }
                        ],
                    })
                })
            }
        }
    }, {})

    await sock.relayMessage(msg.key.remoteJid, msg.message, { messageId: msg.key.id })
}

// =====================================
// 7. RESPUESTA INTERACTIVA
// =====================================

/**
 * Enviar una respuesta interactiva (Interactive Response)
 */
async function enviarRespuestaInteractiva(sock, jid) {
    await sock.sendMessage(jid, {
        buttonReply: {
            text: 'Texto de respuesta',
            nativeFlows: {
                name: 'menu_options',
                paramsJson: '{}',
                version: 3,
            },
        },
        type: 'interactive',
        ephemeral: true,
    })
}

// =====================================
// 8. LISTA (Sections)
// =====================================

/**
 * Envía lista con secciones
 */
async function enviarLista(sock, jid) {
    await sock.sendMessage(jid, {
        text: "Elige una opción del menú",
        title: "📋 Menú Principal",
        buttonText: "Ver opciones",
        footer: "Ryze Bot",
        sections: [
            {
                title: "🛠️ Herramientas",
                rows: [
                    { title: "Sticker", rowId: ".sticker", description: "Crear sticker de imagen" },
                    { title: "TTP", rowId: ".ttp", description: "Texto a imagen" },
                ]
            },
            {
                title: "🎵 Multimedia",
                rows: [
                    { title: "Play", rowId: ".play", description: "Buscar y descargar música" },
                    { title: "Video", rowId: ".ytmp4", description: "Descargar video" },
                ]
            }
        ]
    })
}

// =====================================
// 9. ALBUM (Múltiples medios)
// =====================================

/**
 * Envía album con múltiples imágenes/videos
 */
async function enviarAlbum(sock, jid, quoted) {
    // Método 1: sendAlbumMessage
    await sock.sendAlbumMessage(jid, [
        {
            image: { url: "https://placehold.co/600x400/png" },
            caption: "Imagen 1"
        },
        {
            image: { url: "https://placehold.co/600x400/png" },
            caption: "Imagen 2"
        },
        {
            video: { url: "https://www.w3schools.com/html/mov_bbb.mp4" },
            caption: "Video 1"
        }
    ], { quoted, delay: 2000 })

    // Método 2: sendMessage con album
    await sock.sendMessage(jid, {
        album: [
            { image: { url: "https://placehold.co/600x400/png" }, caption: "Foto A" },
            { image: { url: "https://placehold.co/600x400/png" }, caption: "Foto B" },
        ]
    })
}

// =====================================
// 10. ENCUESTAS (Polls)
// =====================================

async function enviarEncuesta(sock, jid) {
    await sock.sendMessage(jid, {
        poll: {
            name: '¿Cuál es tu lenguaje favorito?',
            values: ['JavaScript', 'Python', 'TypeScript', 'Rust', 'Go'],
            selectableCount: 1,
            toAnnouncementGroup: false
        }
    })
}

// =====================================
// 11. RESULTADO DE ENCUESTA (Fake)
// =====================================

async function enviarResultadoEncuesta(sock, jid, quoted) {
    await sock.sendMessage(jid, {
        pollResult: {
            name: "Encuesta de ejemplo",
            votes: [["Opción A", 42], ["Opción B", 18], ["Opción C", 7]]
        }
    }, { quoted })
}

// =====================================
// 12. EVENTO
// =====================================

async function enviarEvento(sock, jid, quoted) {
    await sock.sendMessage(jid, {
        event: {
            isCanceled: false,
            name: "🎉 Reunión del Equipo",
            description: "Reunión semanal para discutir avances",
            location: {
                degressLatitude: -34.6037,
                degressLongitude: -58.3816
            },
            startTime: Math.floor(Date.now() / 1000) + 86400, // mañana
            endTime: Math.floor(Date.now() / 1000) + 86400 + 3600, // mañana + 1 hora
            extraGuestsAllowed: true
        }
    }, { quoted })
}

// =====================================
// 13. SOLICITUD DE PAGO
// =====================================

/**
 * Método 1: usando clave 'payment'
 */
async function enviarSolicitudPago(sock, jid, quoted) {
    await sock.sendMessage(jid, {
        payment: {
            currency: "USD",
            amount: "50000",
            from: "123456@s.whatsapp.net",
            note: "Pago por servicio premium",
            background: {
                placeholderArgb: 4278190080,
                textArgb: 4294967295,
                subtextArgb: 4294967295
            }
        }
    }, { quoted })
}

/**
 * Método 2: usando clave 'requestPayment' (compatible baileys-pro)
 */
async function enviarSolicitudPagoV2(sock, jid, quoted) {
    await sock.sendMessage(jid, {
        requestPayment: {
            currency: "USD",
            amount: "100000",
            from: "123456@s.whatsapp.net",
            note: "Pago mensual"
        }
    }, { quoted })
}

/**
 * Método 3: Pago con sticker
 */
async function enviarPagoConSticker(sock, jid, quoted, stickerBuffer) {
    await sock.sendMessage(jid, {
        requestPayment: {
            currency: "USD",
            amount: "25000",
            from: "123456@s.whatsapp.net",
            sticker: stickerBuffer, // Buffer o { url: "..." }
            background: {
                placeholderArgb: 4278190080,
                textArgb: 4294967295,
                subtextArgb: 4294967295
            }
        }
    }, { quoted })
}

// =====================================
// 14. MENTION STATUS
// =====================================

/**
 * Envía estado con menciones a grupos y usuarios
 */
async function enviarEstadoConMenciones(sock) {
    await sock.sendStatusMentions(
        {
            text: "¡Nuevo update del bot! 🚀",
        },
        [
            "123456789123456789@g.us",  // Grupo
            "5491234567890@s.whatsapp.net", // Usuario
        ]
    )
}

/**
 * Estado con imagen
 */
async function enviarEstadoImagenConMenciones(sock) {
    await sock.sendStatusMentions(
        {
            image: { url: "https://placehold.co/600x400/png" },
            caption: "¡Mira esta imagen!",
        },
        [
            "5491234567890@s.whatsapp.net",
        ]
    )
}

// =====================================
// 15. CARRUSEL (Cards)
// =====================================

/**
 * Envía carrusel de tarjetas con botones
 */
async function enviarCarrusel(sock, jid) {
    await sock.sendMessage(jid, {
        text: "Nuestros productos destacados",
        footer: "Desliza para ver más →",
        cards: [
            {
                image: { url: "https://placehold.co/600x400/png" },
                title: "Producto 1",
                body: "Descripción del producto 1",
                footer: "$19.99",
                buttons: [
                    {
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "🛒 Comprar",
                            id: "buy_1"
                        })
                    },
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "Ver detalles",
                            url: "https://example.com/1"
                        })
                    }
                ]
            },
            {
                image: { url: "https://placehold.co/600x400/png" },
                title: "Producto 2",
                body: "Descripción del producto 2",
                footer: "$29.99",
                buttons: [
                    {
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "🛒 Comprar",
                            id: "buy_2"
                        })
                    }
                ]
            },
            {
                image: { url: "https://placehold.co/600x400/png" },
                title: "Producto 3",
                body: "Descripción del producto 3",
                footer: "$39.99",
                buttons: [
                    {
                        name: "quick_reply",
                        buttonParamsJson: JSON.stringify({
                            display_text: "🛒 Comprar",
                            id: "buy_3"
                        })
                    }
                ]
            }
        ]
    })
}

// =====================================
// 16. TEMPLATE BUTTONS
// =====================================

async function enviarTemplateButtons(sock, jid) {
    await sock.sendMessage(jid, {
        text: "Mensaje con template buttons",
        footer: "Ryze Bot",
        template: true,
        templateButtons: [
            { index: 1, urlButton: { displayText: '🌐 GitHub', url: 'https://github.com' } },
            { index: 2, callButton: { displayText: '📞 Llamar', phoneNumber: '+1234567890' } },
            { index: 3, quickReplyButton: { displayText: '💬 Responder', id: 'reply_1' } }
        ]
    })
}

// =====================================
// EXPORTAR
// =====================================

module.exports = {
    enviarBotonesSimples,
    enviarBotonesFlow,
    enviarInteractivo,
    enviarInteractivoConImagen,
    enviarInteractivoProducto,
    enviarInteractivoProto,
    enviarRespuestaInteractiva,
    enviarLista,
    enviarAlbum,
    enviarEncuesta,
    enviarResultadoEncuesta,
    enviarEvento,
    enviarSolicitudPago,
    enviarSolicitudPagoV2,
    enviarPagoConSticker,
    enviarEstadoConMenciones,
    enviarEstadoImagenConMenciones,
    enviarCarrusel,
    enviarTemplateButtons,
}
