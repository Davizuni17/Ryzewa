"use strict"

Object.defineProperty(exports, "__esModule", { value: true })

/**
 * Builder de botones clásicos (buttonsMessage) con cabecera de ubicación
 * y thumbnail opcional. Compatible con más versiones del cliente que
 * los mensajes interactivos.
 *
 * Uso:
 *   const { ButtonV2 } = require('ryzewa')
 *   await new ButtonV2(sock)
 *       .setBody('Elige')
 *       .addButton('Opción 1', 'id1')
 *       .addButton('Opción 2', 'id2')
 *       .send(jid, { quoted: m })
 */

const crypto = require("crypto")
const { generateWAMessageFromContent } = require("../Utils/messages")
const { generateMessageIDV2 } = require("../Utils/generics")
const { BaseBuilder } = require("./base-builder")
const { Toolkit } = require("./toolkit")

class ButtonV2 extends BaseBuilder {
    #client

    constructor(client) {
        super()
        if (!client) {
            throw new Error('Socket is required')
        }

        this.#client = client
        this._image = undefined
        this._data = undefined
        this._buttons = []
    }

    /** Carga el estado del builder desde un buttonsMessage existente */
    loadFrom(msg) {
        if (!msg) throw new Error('buttonsMessage needed')
        if (!msg.buttonsMessage) throw new Error('buttonsMessage not found')

        const { buttonsMessage, ...extraPayload } = msg
        const bM = buttonsMessage
        const location = bM.locationMessage || {}

        this._title = location.name || ''
        this._subtitle = location.address || ''
        this._body = bM.contentText || ''
        this._footer = bM.footerText || ''
        this._contextInfo = bM.contextInfo || {}
        this._extraPayload = extraPayload

        this._buttons = Array.isArray(bM.buttons)
            ? bM.buttons.map(button => ({
                ...button,
                ...(button.nativeFlowInfo
                    ? {
                        nativeFlowInfo: {
                            ...button.nativeFlowInfo,
                            paramsJson: typeof button.nativeFlowInfo.paramsJson === 'string' ? button.nativeFlowInfo.paramsJson : JSON.stringify(button.nativeFlowInfo.paramsJson || {})
                        }
                    }
                    : {})
            }))
            : []

        this._image = location.jpegThumbnail || undefined

        if (!this._image && bM.locationMessage) {
            this._image = undefined
        }

        if (!bM.locationMessage && bM.headerType === 6) {
            this._image = undefined
        }

        this._data = Object.keys(bM).reduce((data, key) => {
            if (!['contentText', 'footerText', 'contextInfo', 'buttons', 'headerType', 'locationMessage', 'viewOnce'].includes(key)) {
                data[key] = bM[key]
            }
            return data
        }, {})

        if (!Object.keys(this._data).length) {
            this._data = undefined
        }

        return this
    }

    /** Botón simple de respuesta */
    addButton(displayText = '', buttonId = crypto.randomUUID()) {
        this._buttons.push({
            buttonId,
            buttonText: { displayText },
            type: 1
        })
        return this
    }

    /** Botón crudo (objeto proto completo, p.ej. con nativeFlowInfo) */
    addRawButton(obj) {
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
            throw new TypeError('Buttons must be a plain object')
        }

        this._buttons.push(obj)
        return this
    }

    /** Thumbnail ya procesado (base64/bytes) sin re-redimensionar */
    setRawThumbnail(thumbnail) {
        if (!thumbnail) throw new Error('Thumbnail needed')
        this._image = { base64: thumbnail, is_raw: true }
        return this
    }

    /** Thumbnail desde url o buffer (se redimensiona a 300x300) */
    setThumbnail(path) {
        if (!path) throw new Error('Url or buffer needed')
        this._image = path
        return this
    }

    setMedia(obj) {
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
            throw new TypeError('Media must be a plain object')
        }

        this._data = obj
        return this
    }

    async build(jid, { messageId, ...options } = {}) {
        const _thumbnail = this._image?.is_raw
            ? this._image.base64
            : this._image
                ? await Toolkit.resize(Buffer.isBuffer(this._image) ? this._image : await Toolkit.fetchBuffer(this._image, {}, { silent: true }), 300, 300)
                : null
        const msg = generateWAMessageFromContent(
            jid,
            {
                ...this._extraPayload,
                buttonsMessage: {
                    contentText: this._body,
                    footerText: this._footer,
                    ...(this._data
                        ? this._data
                        : {
                            headerType: 6,
                            locationMessage: {
                                degreesLatitude: 0,
                                degreesLongitude: 0,
                                name: this._title,
                                address: this._subtitle,
                                jpegThumbnail: _thumbnail
                            }
                        }),
                    viewOnce: true,
                    contextInfo: this._contextInfo,
                    buttons: [...this._buttons]
                }
            },
            { messageId: messageId || generateMessageIDV2(), ...options }
        )
        return msg
    }

    async send(jid, { messageId, additionalNodes = [], ...options } = {}) {
        if (this._buttons.length < 1) throw new Error('ButtonV2 requires at least one button')
        const msg = await this.build(jid, { messageId, ...options })

        await this.#client.relayMessage(msg.key.remoteJid, msg.message, {
            messageId: msg.key.id,
            additionalNodes: [
                {
                    tag: 'biz',
                    attrs: {},
                    content: [
                        {
                            tag: 'interactive',
                            attrs: { type: 'native_flow', v: '1' },
                            content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
                        }
                    ]
                },
                ...additionalNodes
            ],
            ...options
        })
        return msg
    }
}

module.exports = { ButtonV2 }
