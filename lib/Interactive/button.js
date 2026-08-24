"use strict"

Object.defineProperty(exports, "__esModule", { value: true })

/**
 * Builder de mensajes interactivos (interactiveMessage + nativeFlowMessage):
 * quick replies, listas de selección, botones de llamada, url, copiar código, etc.
 *
 * Uso:
 *   const { Button } = require('ryzewa')
 *   await new Button(sock)
 *       .setBody('Elige una opción')
 *       .setFooter('Mi Bot')
 *       .addReply('Menú', '.menu')
 *       .addUrl('Canal', 'https://whatsapp.com/channel/...')
 *       .send(jid, { quoted: m })
 */

const { generateWAMessageFromContent, prepareWAMessageMedia } = require("../Utils/messages")
const { generateMessageIDV2 } = require("../Utils/generics")
const { BaseBuilder } = require("./base-builder")

class Button extends BaseBuilder {
    #client

    constructor(client) {
        super()
        if (!client) {
            throw new Error('Socket is required')
        }
        this.#client = client

        this._buttons = []
        this._data = undefined
        this._currentSelectionIndex = -1
        this._currentSectionIndex = -1
        this._params = {}
    }

    /** Carga el estado del builder desde un interactiveMessage existente */
    loadFrom(msg) {
        if (!msg) throw new Error('interactiveMessage needed')
        if (!msg.interactiveMessage) throw new Error('interactiveMessage not found')

        const { interactiveMessage, ...extraPayload } = msg
        const iM = interactiveMessage
        const header = iM.header || {}
        const nativeFlow = iM.nativeFlowMessage || {}

        this._title = header.title || ''
        this._subtitle = header.subtitle || ''
        this._body = iM.body?.text || ''
        this._footer = iM.footer?.text || ''
        this._contextInfo = iM.contextInfo || {}
        this._extraPayload = extraPayload

        this._buttons = Array.isArray(nativeFlow.buttons)
            ? nativeFlow.buttons.map(button => ({
                ...button,
                buttonParamsJson: typeof button.buttonParamsJson === 'string' ? button.buttonParamsJson : JSON.stringify(button.buttonParamsJson || {})
            }))
            : []

        this._data = header.imageMessage
            ? { imageMessage: header.imageMessage }
            : header.videoMessage
                ? { videoMessage: header.videoMessage }
                : header.documentMessage
                    ? { documentMessage: header.documentMessage }
                    : header.productMessage
                        ? { productMessage: header.productMessage }
                        : undefined

        this._params = {}

        if (typeof nativeFlow.messageParamsJson === 'string') {
            try {
                this._params = JSON.parse(nativeFlow.messageParamsJson || '{}')
            } catch {
                this._params = {}
            }
        } else if (nativeFlow.messageParamsJson && typeof nativeFlow.messageParamsJson === 'object') {
            this._params = { ...nativeFlow.messageParamsJson }
        }

        this._currentSelectionIndex = this._buttons.findLastIndex(button => button.name === 'single_select')

        this._currentSectionIndex = -1

        if (this._currentSelectionIndex !== -1) {
            try {
                const button = this._buttons[this._currentSelectionIndex]
                const params = JSON.parse(button.buttonParamsJson || '{}')

                if (Array.isArray(params.sections) && params.sections.length) {
                    this._currentSectionIndex = params.sections.length - 1
                }
            } catch {
                this._currentSelectionIndex = -1
                this._currentSectionIndex = -1
            }
        }

        return this
    }

    setImage(path, options = {}) {
        if (!path) throw new Error('Url or buffer needed')
        Buffer.isBuffer(path) ? (this._data = { image: path, ...options }) : (this._data = { image: { url: path }, ...options })
        return this
    }

    setDocument(path, options = {}) {
        if (!path) throw new Error('Url or buffer needed')
        Buffer.isBuffer(path) ? (this._data = { document: path, ...options }) : (this._data = { document: { url: path }, ...options })
        return this
    }

    setMedia(obj) {
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
            throw new TypeError('Media must be a plain object')
        }

        this._data = obj
        return this
    }

    clearButtons() {
        this._buttons = []
        return this
    }

    setParams(obj) {
        this._params = obj
        return this
    }

    /** Botón crudo de native flow: addButton('quick_reply', { display_text, id }) */
    addButton(name, params) {
        this._buttons.push({
            name,
            buttonParamsJson: typeof params === 'string' ? params : JSON.stringify(params)
        })

        return this
    }

    /** Fila dentro de la última sección creada con makeSection() */
    makeRow(header = '', title = '', description = '', id = '') {
        if (this._currentSelectionIndex === -1 || this._currentSectionIndex === -1) {
            throw new Error('You need to create a selection and a section first')
        }
        const buttonParams = JSON.parse(this._buttons[this._currentSelectionIndex].buttonParamsJson)
        buttonParams.sections[this._currentSectionIndex].rows.push({ header, title, description, id })
        this._buttons[this._currentSelectionIndex].buttonParamsJson = JSON.stringify(buttonParams)
        return this
    }

    /** Sección dentro de la última lista creada con addSelection() */
    makeSection(title = '', highlight_label = '') {
        if (this._currentSelectionIndex === -1) {
            throw new Error('You need to create a selection first')
        }
        const buttonParams = JSON.parse(this._buttons[this._currentSelectionIndex].buttonParamsJson)
        buttonParams.sections.push({ title, highlight_label, rows: [] })
        this._currentSectionIndex = buttonParams.sections.length - 1
        this._buttons[this._currentSelectionIndex].buttonParamsJson = JSON.stringify(buttonParams)
        return this
    }

    /** Lista desplegable (single_select) */
    addSelection(title, options = {}) {
        this._buttons.push({ name: 'single_select', buttonParamsJson: JSON.stringify({ title, sections: [], ...options }) })
        this._currentSelectionIndex = this._buttons.length - 1
        this._currentSectionIndex = -1
        return this
    }

    /** Botón de respuesta rápida */
    addReply(display_text = '', id = '', options = {}) {
        this._buttons.push({
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text,
                id,
                ...options
            })
        })
        return this
    }

    /** Botón de llamada */
    addCall(display_text = '', id = '', options = {}) {
        this._buttons.push({
            name: 'cta_call',
            buttonParamsJson: JSON.stringify({
                display_text,
                id,
                ...options
            })
        })
        return this
    }

    /** Botón de recordatorio */
    addReminder(display_text = '', id = '', options = {}) {
        this._buttons.push({
            name: 'cta_reminder',
            buttonParamsJson: JSON.stringify({
                display_text,
                id,
                ...options
            })
        })
        return this
    }

    /** Botón de cancelar recordatorio */
    addCancelReminder(display_text = '', id = '', options = {}) {
        this._buttons.push({
            name: 'cta_cancel_reminder',
            buttonParamsJson: JSON.stringify({
                display_text,
                id,
                ...options
            })
        })
        return this
    }

    /** Botón de dirección */
    addAddress(display_text = '', id = '', options = {}) {
        this._buttons.push({
            name: 'address_message',
            buttonParamsJson: JSON.stringify({
                display_text,
                id,
                ...options
            })
        })
        return this
    }

    /** Botón de enviar ubicación */
    addLocation(options = {}) {
        this._buttons.push({
            name: 'send_location',
            buttonParamsJson: JSON.stringify(options)
        })
        return this
    }

    /** Botón que abre una URL */
    addUrl(display_text = '', url = '', webview_interaction = false, options = {}) {
        this._buttons.push({
            ...options,
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
                display_text,
                url,
                webview_interaction,
                ...options
            })
        })
        return this
    }

    /** Botón de copiar código al portapapeles */
    addCopy(display_text = '', copy_code = '', options = {}) {
        this._buttons.push({
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({
                display_text,
                copy_code,
                ...options
            })
        })
        return this
    }

    /** Formas conocidas de messageParamsJson para setParams() */
    static paramsList = {
        limited_time_offer: {
            text: 'string',
            url: 'string',
            copy_code: 'string',
            expiration_time: 'number'
        },
        bottom_sheet: {
            in_thread_buttons_limit: 'number',
            divider_indices: ['number'],
            list_title: 'string',
            button_title: 'string'
        },
        tap_target_configuration: {
            title: 'string',
            description: 'string',
            canonical_url: 'string',
            domain: 'string',
            buttonIndex: 'number'
        }
    }

    /** Devuelve la card lista para incrustar (útil para Carousel.addCard) */
    async toCard() {
        return {
            body: {
                text: this._body
            },
            footer: {
                text: this._footer
            },
            header: {
                title: this._title,
                subtitle: this._subtitle,
                hasMediaAttachment: !!this._data,
                ...(this._data
                    ? await prepareWAMessageMedia(this._data, { upload: this.#client.waUploadToServer }).catch(e => {
                        if (String(e).includes('Invalid media type')) return this._data
                        throw e
                    })
                    : {})
            },
            nativeFlowMessage: {
                messageParamsJson: JSON.stringify(this._params),
                buttons: this._buttons
            }
        }
    }

    async build(jid, { messageId, ...options } = {}) {
        const message = await this.toCard()

        return generateWAMessageFromContent(
            jid,
            {
                ...this._extraPayload,
                interactiveMessage: {
                    ...message,
                    contextInfo: this._contextInfo
                }
            },
            { messageId: messageId || generateMessageIDV2(), ...options }
        )
    }

    async send(jid, { messageId, additionalNodes, ...options } = {}) {
        const msg = await this.build(jid, { messageId, ...options })

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

module.exports = { Button }
