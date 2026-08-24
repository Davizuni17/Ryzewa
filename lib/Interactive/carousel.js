"use strict"

Object.defineProperty(exports, "__esModule", { value: true })

/**
 * Builder de carruseles (interactiveMessage.carouselMessage).
 * Cada card se genera con Button#toCard() — cada una debe llevar
 * imagen o video en el header.
 *
 * Uso:
 *   const { Carousel, Button } = require('ryzewa')
 *   const card = await new Button(sock)
 *       .setImage('https://.../foto.jpg')
 *       .setBody('Card 1')
 *       .addReply('Ver', '.ver1')
 *       .toCard()
 *   await new Carousel(sock)
 *       .setBody('Nuestro catálogo')
 *       .addCard(card)
 *       .send(jid, { quoted: m })
 */

const { generateWAMessageFromContent } = require("../Utils/messages")
const { generateMessageIDV2 } = require("../Utils/generics")
const { BaseBuilder } = require("./base-builder")

class Carousel extends BaseBuilder {
    #client

    constructor(client) {
        super()
        if (!client) {
            throw new Error('Socket is required')
        }

        this.#client = client
        this._cards = []
    }

    /** Carga el estado del builder desde un carouselMessage existente */
    loadFrom(msg) {
        if (!msg) throw new Error('interactiveMessage needed')
        if (!msg.interactiveMessage) throw new Error('interactiveMessage not found')

        const { interactiveMessage, ...extraPayload } = msg
        const iM = interactiveMessage
        const carousel = iM.carouselMessage || {}

        this._body = iM.body?.text || ''
        this._footer = iM.footer?.text || ''
        this._contextInfo = iM.contextInfo || {}
        this._extraPayload = extraPayload

        this._cards = Array.isArray(carousel.cards)
            ? carousel.cards.map(card => ({
                ...card,
                header: {
                    ...(card.header || {}),
                    hasMediaAttachment: !!card.header?.hasMediaAttachment,
                    ...(card.header?.imageMessage ? { imageMessage: card.header.imageMessage } : {}),
                    ...(card.header?.videoMessage ? { videoMessage: card.header.videoMessage } : {})
                },
                body: {
                    text: card.body?.text || ''
                },
                footer: {
                    text: card.footer?.text || ''
                },
                nativeFlowMessage: {
                    ...(card.nativeFlowMessage || {}),
                    buttons: Array.isArray(card.nativeFlowMessage?.buttons)
                        ? card.nativeFlowMessage.buttons.map(button => ({
                            ...button,
                            buttonParamsJson: typeof button.buttonParamsJson === 'string' ? button.buttonParamsJson : JSON.stringify(button.buttonParamsJson || {})
                        }))
                        : [],
                    messageParamsJson:
                        typeof card.nativeFlowMessage?.messageParamsJson === 'string' ? card.nativeFlowMessage.messageParamsJson : JSON.stringify(card.nativeFlowMessage?.messageParamsJson || {})
                }
            }))
            : []

        return this
    }

    /** Añade una card (o array de cards). Cada card debe tener media en el header */
    addCard(card) {
        const cards = Array.isArray(card) ? card : [card]
        const baseIndex = this._cards.length

        for (const [index, c] of cards.entries()) {
            if (!c?.header?.hasMediaAttachment) {
                throw new Error(`Card [${baseIndex + index}] must include an image or video in header`)
            }
        }

        this._cards.push(...cards)
        return this
    }

    build(jid, { messageId, ...options } = {}) {
        return generateWAMessageFromContent(
            jid,
            {
                ...this._extraPayload,
                interactiveMessage: {
                    header: {
                        hasMediaAttachment: false
                    },
                    body: { text: this._body },
                    footer: { text: this._footer },
                    contextInfo: this._contextInfo,
                    carouselMessage: {
                        cards: this._cards
                    }
                }
            },
            { messageId: messageId || generateMessageIDV2(), ...options }
        )
    }

    async send(jid, { messageId, additionalNodes, ...options } = {}) {
        const msg = this.build(jid, { messageId, ...options })

        // el relay de Ryzewa detecta los botones y genera solo el nodo <biz> completo;
        // pasarle uno propio via additionalNodes suprimiria el bueno
        await this.#client.relayMessage(msg.key.remoteJid, msg.message, {
            messageId: msg.key.id,
            ...(additionalNodes?.length ? { additionalNodes } : {}),
            ...options
        })
        return msg
    }
}

module.exports = { Carousel }
