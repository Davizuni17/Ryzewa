"use strict"

Object.defineProperty(exports, "__esModule", { value: true })

/**
 * Builder de mensajes AI Rich (richResponseMessage envuelto en botForwardedMessage):
 * texto markdown con entidades inline, código resaltado, tablas, fuentes,
 * reels, imágenes, videos, productos, posts, widgets, sugerencias, etc.
 *
 * Uso:
 *   const { AIRich } = require('ryzewa')
 *   await new AIRich(sock)
 *       .setTitle('Mi Bot AI')
 *       .addText('Hola, esto es *markdown* con [un link](https://example.com)')
 *       .addCode('javascript', 'console.log("hola")')
 *       .addSuggest(['Menú', 'Ayuda'])
 *       .send(jid, { quoted: m })
 *
 * Cada `add*` acepta { id, replace, insertAt } para gestionar secciones por id.
 */

const crypto = require("crypto")
const { proto } = require("../../WAProto")
const { generateWAMessageFromContent } = require("../Utils/messages")
const { generateMessageIDV2 } = require("../Utils/generics")
const { isJidNewsletter } = require("../WABinary")
const { tokenizeCode, botMetadataCertificate, botMetadataSignature } = require("../Utils/rich-message-utils")
const { CodeHighlightType } = require("../Types/RichType")
const { BaseBuilder } = require("./base-builder")
const { Toolkit, extractIE, waitAllPromises } = require("./toolkit")
const { ItemNotFoundError, DuplicateIdError, InvalidTargetError, ContentValidationError } = require("./errors")

class AIRich extends BaseBuilder {
    #client

    constructor(client, { dynamic = true, unsupportedTypeAlert = true } = {}) {
        if (!client) {
            throw new Error('Socket is required')
        }

        super()
        this.#client = client
        this._contextInfo = {}
        this._nodes = []
        this._idIndex = new Map()
        this._unsupportedTypeAlert = !!unsupportedTypeAlert
        this._dynamic = !!dynamic
        this._responseId = crypto.randomUUID()
        this._botResponseId = crypto.randomUUID()
        this._lastMessageKey = null
    }

    /* ------------------------------------------------------------------ *
     * Gestión interna de nodos (cada nodo = { id, section, submessage }) *
     * ------------------------------------------------------------------ */

    get _sections() {
        return this._nodes.map(node => node.section).filter(section => section != null)
    }

    get _submessages() {
        return this._nodes.map(node => node.submessage).filter(submessage => submessage != null)
    }

    _reindex() {
        this._idIndex.clear()
        for (const [index, node] of this._nodes.entries()) {
            if (node.id != null) {
                this._idIndex.set(node.id, index)
            }
        }
    }

    /**
     * Inserta contenido en la lista de nodos.
     * - `id`: asigna un id al nodo (solo contenido de un único item)
     * - `replace`: id de un nodo existente a reemplazar
     * - `insertAt`: índice (número) o id (string) de un nodo existente donde insertar;
     *   por defecto al final
     */
    _addContent(section, submessage, { id, replace, insertAt } = {}) {
        const sections = section == null ? [] : Array.isArray(section) ? section : [section]
        const submessages = submessage == null ? [] : Array.isArray(submessage) ? submessage : [submessage]

        const length = Math.max(sections.length, submessages.length, 1)

        if (id != null && typeof id !== 'string') {
            throw new ContentValidationError('Item id must be a string', { id })
        }

        if (id != null && length > 1) {
            throw new InvalidTargetError('Cannot assign one id to multiple content nodes', { id })
        }

        const nodes = []
        for (let i = 0; i < length; i++) {
            nodes.push({
                id: length === 1 ? (id ?? null) : null,
                section: sections[i] ?? null,
                submessage: submessages[i] ?? null
            })
        }

        if (replace != null) {
            if (!this._idIndex.has(replace)) {
                throw new ItemNotFoundError(replace, [...this._idIndex.keys()])
            }

            if (nodes.length !== 1) {
                throw new InvalidTargetError('Cannot replace one item with multiple content nodes', { replace })
            }

            if (id != null && id !== replace && this._idIndex.has(id)) {
                throw new DuplicateIdError(id)
            }

            const index = this._idIndex.get(replace)

            // si no se indica un id nuevo, el nodo reemplazado conserva el anterior
            nodes[0].id = id ?? replace
            this._nodes.splice(index, 1, nodes[0])
        } else {
            if (id != null && this._idIndex.has(id)) {
                throw new DuplicateIdError(id)
            }

            if (insertAt != null) {
                // insertAt admite el id (string) de un nodo existente: inserta en su posición
                if (typeof insertAt === 'string') {
                    if (!this._idIndex.has(insertAt)) {
                        throw new ItemNotFoundError(insertAt, [...this._idIndex.keys()])
                    }
                    insertAt = this._idIndex.get(insertAt)
                }
                if (!Number.isInteger(insertAt) || insertAt < 0 || insertAt > this._nodes.length) {
                    throw new InvalidTargetError(`insertAt must be an integer between 0 and ${this._nodes.length}, or an existing item id`, { insertAt })
                }
                this._nodes.splice(insertAt, 0, ...nodes)
            } else {
                this._nodes.push(...nodes)
            }
        }

        this._reindex()

        return this
    }

    /** Elimina un nodo por id */
    remove(id) {
        if (!this._idIndex.has(id)) {
            throw new ItemNotFoundError(id, [...this._idIndex.keys()])
        }
        this._nodes.splice(this._idIndex.get(id), 1)
        this._reindex()
        return this
    }

    /** Comprueba si existe un nodo con ese id */
    has(id) {
        return this._idIndex.has(id)
    }

    /** Ids registrados en orden de aparición */
    ids() {
        return [...this._idIndex.keys()]
    }

    /** Vacía todo el contenido */
    clear() {
        this._nodes = []
        this._idIndex.clear()
        return this
    }

    /* ------------------------- helpers estáticos ------------------------- */

    /**
     * Envuelve un primitivo (o array de primitivos) en un view_model de sección.
     * layouts: 'Single' | 'HScroll' | 'ActionRow'
     */
    static newLayout(layout, content, options = {}) {
        const typename = `GenAI${layout}LayoutViewModel`

        const view_model =
            layout === 'Single'
                ? {
                    primitive: content,
                    __typename: typename
                }
                : {
                    primitives: Array.isArray(content) ? content : [content],
                    __typename: typename
                }

        return {
            view_model,
            ...options
        }
    }

    /** Tokeniza código para submessage (proto) y para unifiedResponse (json) */
    static tokenizer(code, language = 'javascript') {
        const codeBlock = tokenizeCode(code, language)

        const unified_codeBlock = codeBlock.map(block => ({
            content: block.codeContent,
            type: CodeHighlightType[block.highlightType]
        }))

        return { codeBlock, unified_codeBlock }
    }

    /**
     * Convierte un array de filas (arrays de strings; la primera es cabecera)
     * al formato de tabla del submessage y del unifiedResponse.
     */
    static toTableMetadata(table, { hyperlink = true, citation = true, latex = true } = {}) {
        let title = ''
        let rawRows = table

        if (table && !Array.isArray(table) && typeof table === 'object') {
            title = table.title ?? ''
            rawRows = table.rows ?? []
        }

        if (!Array.isArray(rawRows)) {
            throw new ContentValidationError('Table rows must be an array')
        }

        const rows = rawRows.map((row, index) => {
            const isObject = row && typeof row === 'object' && !Array.isArray(row)
            const items = (isObject ? row.items ?? [] : row).map(item => String(item ?? ''))

            return {
                isHeading: isObject ? !!row.isHeading : index === 0,
                items
            }
        })

        const unified_rows = rows.map(row => ({
            is_header: row.isHeading,
            cells: row.items,
            markdown_cells: row.items.map(item => {
                const { text, inline_entities } = extractIE(item, { hyperlink, citation, latex })
                return {
                    text,
                    ...(inline_entities.length ? { inline_entities } : {})
                }
            })
        }))

        return { title, rows, unified_rows }
    }

    /* ----------------------------- estado ----------------------------- */

    /** Carga el estado desde un mensaje AI Rich existente */
    loadFrom(msg) {
        if (!msg) throw new Error('AI Rich message needed')

        const message = msg.message ?? msg

        let richResponseMessage = message?.botForwardedMessage?.message?.richResponseMessage

        if (!richResponseMessage) {
            richResponseMessage = message?.botForwardedMessage?.richResponseMessage
        }

        if (!richResponseMessage) {
            richResponseMessage = message?.richResponseMessage
        }

        if (!richResponseMessage) {
            throw new Error('richResponseMessage not found')
        }

        const messageContextInfo = message?.messageContextInfo ?? {}
        const botMetadata = messageContextInfo?.botMetadata ?? {}

        this._title = botMetadata?.messageDisclaimerText ?? ''

        this._contextInfo = structuredClone(richResponseMessage?.contextInfo ?? {})

        const loadedSubmessages = Array.isArray(richResponseMessage?.submessages) ? structuredClone(richResponseMessage.submessages) : []

        let loadedSections = []

        const unifiedData = richResponseMessage?.unifiedResponse?.data

        if (unifiedData) {
            try {
                const decoded = Buffer.isBuffer(unifiedData) || unifiedData instanceof Uint8Array
                    ? Buffer.from(unifiedData).toString('utf8')
                    : Buffer.from(unifiedData, 'base64').toString('utf8')
                const unifiedResponse = JSON.parse(decoded)

                if (Array.isArray(unifiedResponse?.sections)) {
                    loadedSections = structuredClone(unifiedResponse.sections)
                }
            } catch {}
        }

        this._nodes = []
        this._idIndex = new Map()

        const maxLength = Math.max(loadedSections.length, loadedSubmessages.length)

        for (let i = 0; i < maxLength; i++) {
            this._nodes.push({
                id: null,
                section: loadedSections[i] ?? null,
                submessage: loadedSubmessages[i] ?? null
            })
        }

        this._extraPayload = {}

        for (const [key, value] of Object.entries(message)) {
            if (key !== 'messageContextInfo' && key !== 'botForwardedMessage' && key !== 'richResponseMessage') {
                this._extraPayload[key] = structuredClone(value)
            }
        }

        return this
    }

    setResponseId(id) {
        if (typeof id !== 'string') {
            throw new TypeError('ID must be a string')
        }
        this._responseId = id

        return this
    }

    refreshResponseId() {
        this._responseId = crypto.randomUUID()

        return this
    }

    setBotResponseId(id) {
        if (typeof id !== 'string') {
            throw new TypeError('ID must be a string')
        }
        this._botResponseId = id

        return this
    }

    refreshBotResponseId() {
        this._botResponseId = crypto.randomUUID()

        return this
    }

    /** Submessage de aviso para tipos que el cliente antiguo no puede renderizar */
    createAlert(type) {
        if (this._unsupportedTypeAlert) {
            return {
                messageType: 2,
                messageText: `[ UNSUPPORTED_TYPE - ${type}]`
            }
        }

        return undefined
    }

    /* --------------------------- contenido --------------------------- */

    /** Texto markdown con hyperlinks [t](url), citas [](url) y LaTeX [expr]<url> */
    addText(text, { hyperlink = true, citation = true, latex = true, id, replace, insertAt } = {}) {
        if (typeof text !== 'string') {
            throw new TypeError('Text must be a string')
        }

        const { text: extractedText, inline_entities } = extractIE(text, {
            hyperlink,
            citation,
            latex
        })

        const section = AIRich.newLayout('Single', {
            text: extractedText,
            ...(inline_entities.length && { inline_entities }),
            __typename: 'GenAIMarkdownTextUXPrimitive'
        })

        const submessages = [
            {
                messageType: 2,
                messageText: text
            }
        ].filter(Boolean)

        return this._addContent(section, submessages, {
            id,
            replace,
            insertAt
        })
    }

    /** Texto plano estilo FOA (sin markdown) */
    addFOAText(text, { id, replace, insertAt } = {}) {
        if (typeof text !== 'string') {
            throw new TypeError('Text must be a string')
        }

        const section = AIRich.newLayout('Single', {
            text,
            __typename: 'FOATextPrimitive'
        })

        const submessages = [
            {
                messageType: 2,
                messageText: text
            }
        ]

        return this._addContent(section, submessages, {
            id,
            replace,
            insertAt
        })
    }

    /** Bloque de código con resaltado de sintaxis */
    addCode(language, code, { id, replace, insertAt } = {}) {
        if (typeof language !== 'string' || typeof code !== 'string') {
            throw new TypeError('Language and code must be a string')
        }

        const meta = AIRich.tokenizer(code, language)

        const section = AIRich.newLayout('Single', {
            language,
            code_blocks: meta.unified_codeBlock,
            __typename: 'GenAICodeUXPrimitive'
        })

        const submessages = [
            {
                messageType: 5,
                codeMetadata: {
                    codeLanguage: language,
                    codeBlocks: meta.codeBlock
                }
            }
        ]

        return this._addContent(section, submessages, {
            id,
            replace,
            insertAt
        })
    }

    /** Tabla (array de filas; la primera fila es la cabecera) */
    addTable(table, { hyperlink = true, citation = true, latex = true, id, replace, insertAt } = {}) {
        if (!Array.isArray(table)) {
            throw new TypeError('Table must be an array')
        }

        const meta = AIRich.toTableMetadata(table, {
            hyperlink,
            citation,
            latex
        })

        const section = AIRich.newLayout('Single', {
            rows: meta.unified_rows,
            __typename: 'GenATableUXPrimitive'
        })

        const submessages = [
            {
                messageType: 4,
                tableMetadata: {
                    title: meta.title,
                    rows: meta.rows
                }
            }
        ]

        return this._addContent(section, submessages, {
            id,
            replace,
            insertAt
        })
    }

    /** Tarjetas de fuentes/referencias web */
    addSource(sources = [], { id, replace, insertAt } = {}) {
        if (!Array.isArray(sources)) {
            throw new TypeError('Sources must be an array of strings, arrays, or objects')
        }

        const isStringArray = sources.every(item => typeof item === 'string')

        const isArrayFormat = sources.every(item => Array.isArray(item) && item.every(value => typeof value === 'string'))

        const isObjectFormat = sources.every(item => item && typeof item === 'object' && !Array.isArray(item))

        if (!isStringArray && !isArrayFormat && !isObjectFormat) {
            throw new TypeError('Sources must be a string array, array of string arrays, or array of objects')
        }

        if (isStringArray) {
            sources = [sources]
        }

        const normalizedSources = sources.map(source => {
            if (Array.isArray(source)) {
                const [icon, url, title, subtitle] = source

                return {
                    icon,
                    url,
                    title,
                    subtitle
                }
            }

            return {
                icon: source.favicon ?? source.icon ?? '',
                url: source.url ?? '',
                title: source.title ?? '',
                subtitle: source.subtitle ?? ''
            }
        })

        const source = normalizedSources.map(({ icon, url, title, subtitle }) => ({
            source_type: 'THIRD_PARTY',
            source_display_name: title,
            source_subtitle: subtitle,
            source_url: url,
            favicon: {
                url: Toolkit.resolveMedia(this.#client, icon, 'image'),
                mime_type: 'image/jpeg',
                width: 16,
                height: 16
            }
        }))

        const submessage = this.createAlert('GenAISearchResultPrimitive')

        const section = AIRich.newLayout('Single', {
            sources: source,
            __typename: 'GenAISearchResultPrimitive'
        })

        return this._addContent(section, submessage, {
            id,
            replace,
            insertAt
        })
    }

    /** Carrusel de reels */
    addReels(reelsItems = [], { id, replace, insertAt } = {}) {
        if (
            !(
                (reelsItems && typeof reelsItems === 'object' && !Array.isArray(reelsItems)) ||
                (Array.isArray(reelsItems) && reelsItems.every(item => item && typeof item === 'object' && !Array.isArray(item)))
            )
        ) {
            throw new TypeError('Reels items must be an object or an array of objects')
        }

        const items = Array.isArray(reelsItems) ? reelsItems : [reelsItems]

        const reels = items.map(item => ({
            ...item,
            _avatar: Toolkit.resolveMedia(this.#client, item.profileIconUrl ?? item.profile_url ?? item.profile ?? '', 'image'),
            _thumbnail: Toolkit.resolveMedia(this.#client, item.thumbnailUrl ?? item.thumbnail ?? '', 'image')
        }))

        const section = AIRich.newLayout(
            'HScroll',
            reels.map(item => ({
                reels_url: item.videoUrl ?? item.url ?? '',
                thumbnail_url: item._thumbnail,
                creator: item.username ?? item.title ?? '',
                avatar_url: item._avatar,
                reels_title: item.reels_title ?? item.title ?? '',
                likes_count: item.likes_count ?? item.like ?? 0,
                shares_count: item.shares_count ?? item.share ?? 0,
                view_count: item.view_count ?? item.view ?? 0,
                reel_source: item.reel_source ?? item.source ?? 'IG',
                is_verified: !!(item.is_verified || item.verified),
                __typename: 'GenAIReelPrimitive'
            }))
        )

        const submessages = [
            {
                messageType: 9,
                contentItemsMetadata: {
                    contentType: 1,
                    itemsMetadata: reels.map(item => ({
                        reelItem: {
                            title: item.username ?? '',
                            profileIconUrl: item._avatar,
                            thumbnailUrl: item._thumbnail,
                            videoUrl: item.videoUrl ?? item.url ?? ''
                        }
                    }))
                }
            }
        ]

        return this._addContent(section, submessages, {
            id,
            replace,
            insertAt
        })
    }

    /** Imagen (o grid de imágenes) generadas estilo AI */
    addImage(imageUrl, { width, height, status = 'READY', update_text, resolveUrl = false, id, replace, insertAt } = {}) {
        if (!(typeof imageUrl === 'string' || Buffer.isBuffer(imageUrl) || (Array.isArray(imageUrl) && imageUrl.every(v => typeof v === 'string' || Buffer.isBuffer(v))))) {
            throw new TypeError('imageUrl must be string | buffer | array of string/buffer')
        }

        const list = Array.isArray(imageUrl)
            ? imageUrl.map(v => {
                const url = Toolkit.resolveMedia(this.#client, v, 'image', { resolveUrl })

                return {
                    imagePreviewUrl: url,
                    imageHighResUrl: url,
                    sourceUrl: url
                }
            })
            : (() => {
                const url = Toolkit.resolveMedia(this.#client, imageUrl, 'image', { resolveUrl })

                return [
                    {
                        imagePreviewUrl: url,
                        imageHighResUrl: url,
                        sourceUrl: url
                    }
                ]
            })()

        const sections = list.map(({ imagePreviewUrl }) =>
            AIRich.newLayout('Single', {
                media: {
                    url: imagePreviewUrl,
                    mime_type: 'image/png',
                    width,
                    height
                },
                imagine_type: 'IMAGE',
                status: {
                    status,
                    update_text
                },
                __typename: 'GenAIImaginePrimitive'
            })
        )

        const submessage = {
            messageType: 1,
            gridImageMetadata: {
                gridImageUrl: {
                    imagePreviewUrl: list[0]?.imagePreviewUrl
                },
                imageUrls: list
            }
        }

        if (id && sections.length !== 1) {
            throw new Error('Cannot assign one id to multiple image sections')
        }

        return this._addContent(sections, submessage, {
            id,
            replace,
            insertAt
        })
    }

    /** Video estilo AI (imagine ANIMATE) con thumbnail y duración autocalculados */
    addVideo(videoUrl, { autoFill = true, status = 'READY', estimatedTime, id, replace, insertAt } = {}) {
        const isObjectVideo = v => v && typeof v === 'object' && !Array.isArray(v) && v.url

        const isValidPrimitive =
            typeof videoUrl === 'string' ||
            Buffer.isBuffer(videoUrl) ||
            isObjectVideo(videoUrl) ||
            (Array.isArray(videoUrl) && videoUrl.every(v => typeof v === 'string' || Buffer.isBuffer(v) || isObjectVideo(v)))

        if (!isValidPrimitive) {
            throw new TypeError('videoUrl must be string | buffer | object | array')
        }

        const items = Array.isArray(videoUrl) ? videoUrl : [videoUrl]

        const alert = this.createAlert('GenAIImaginePrimitive (ANIMATE)')

        const sections = []
        const submessages = []

        for (const item of items) {
            const isObject = isObjectVideo(item)

            const url = isObject ? Toolkit.resolveMedia(this.#client, item.url ?? '', 'video') : Toolkit.resolveMedia(this.#client, item, 'video')

            const bufferPromise = autoFill ? Promise.resolve(url).then(u => Toolkit.fetchBuffer(u)) : null

            const file_length = isObject && item.file_length != null ? item.file_length : autoFill ? bufferPromise.then(b => b?.length ?? 0) : 0

            const duration =
                isObject && item.duration != null
                    ? item.duration
                    : autoFill
                        ? bufferPromise.then(b =>
                            Toolkit.getMp4Duration(b, {
                                silent: true
                            })
                        )
                        : 0

            const thumbnail =
                isObject && item.thumbnail
                    ? Toolkit.resolveMedia(this.#client, item.thumbnail, 'image', {
                        result: 'base64',
                        resize: true,
                        width: 300,
                        height: 300
                    })
                    : autoFill
                        ? bufferPromise?.then(b =>
                            Toolkit.getMp4Preview(b, {
                                time: 0,
                                result: 'base64'
                            })
                        )
                        : null

            sections.push(
                AIRich.newLayout('Single', {
                    media: {
                        url,
                        mime_type: isObject ? (item.mime_type ?? 'video/mp4') : 'video/mp4',
                        file_length,
                        duration
                    },
                    imagine_type: 'ANIMATE',
                    status: {
                        status,
                        estimated_completion_time: estimatedTime != null ? Math.floor((Date.now() + estimatedTime) / 1000) : undefined
                    },
                    thumbnail: {
                        raw_media: thumbnail
                    },
                    __typename: 'GenAIImaginePrimitive'
                })
            )
        }

        if (alert !== undefined) {
            submessages.push(alert)
        }

        if (submessages.length > 1) {
            throw new Error('Video content can only have one submessage')
        }

        return this._addContent(sections, submessages[0], {
            id,
            replace,
            insertAt
        })
    }

    /** Card(s) de producto */
    addProduct(data = {}, { id, replace, insertAt } = {}) {
        if (!((data && typeof data === 'object' && !Array.isArray(data)) || (Array.isArray(data) && data.every(item => item && typeof item === 'object' && !Array.isArray(item))))) {
            throw new TypeError('Product items must be an object or an array of objects')
        }

        const items = Array.isArray(data) ? data : [data]

        const product = items.map(item => ({
            title: item.title,
            brand: item.brand,
            price: item.price,
            sale_price: item.sale_price,
            product_url: item.product_url ?? item.url,
            image: {
                url: Toolkit.resolveMedia(this.#client, item.image_url ?? item.image, 'image')
            },
            additional_images: [
                {
                    url: Toolkit.resolveMedia(this.#client, item.icon_url ?? item.icon, 'image')
                }
            ],
            __typename: 'GenAIProductItemCardPrimitive'
        }))

        const section = AIRich.newLayout(Array.isArray(data) ? 'HScroll' : 'Single', Array.isArray(data) ? product : product[0])

        const submessage = this.createAlert('GenAIProductItemCardPrimitive')

        return this._addContent(section, submessage, {
            id,
            replace,
            insertAt
        })
    }

    /** Card(s) de post estilo Instagram/Facebook */
    addPost(data = {}, { id, replace, insertAt } = {}) {
        if (!((data && typeof data === 'object' && !Array.isArray(data)) || (Array.isArray(data) && data.every(item => item && typeof item === 'object' && !Array.isArray(item))))) {
            throw new TypeError('Post items must be an object or an array of objects')
        }

        const posts = Array.isArray(data) ? data : [data]

        const primitives = posts.map(p => ({
            title: p.title ?? '',
            subtitle: p.subtitle ?? '',
            username: p.username ?? '',
            profile_picture_url: Toolkit.resolveMedia(this.#client, p.profile_picture_url ?? p.profile_url ?? p.profile ?? '', 'image'),
            is_verified: !!(p.is_verified || p.verified),
            thumbnail_url: Toolkit.resolveMedia(this.#client, p.thumbnail_url ?? p.thumbnail ?? '', 'image'),
            post_caption: p.post_caption ?? p.caption ?? '',
            likes_count: p.likes_count ?? p.like ?? 0,
            comments_count: p.comments_count ?? p.comment ?? 0,
            shares_count: p.shares_count ?? p.share ?? 0,
            post_url: p.post_url ?? p.url ?? '',
            post_deeplink: p.post_deeplink ?? p.deeplink ?? '',
            source_app: p.source_app || p.source || 'INSTAGRAM',
            footer_label: p.footer_label ?? p.footer ?? '',
            footer_icon: Toolkit.resolveMedia(this.#client, p.footer_icon ?? p.icon ?? '', 'image'),
            is_carousel: posts.length > 1,
            orientation: p.orientation ?? 'LANDSCAPE',
            post_type: p.post_type ?? 'VIDEO',
            __typename: 'GenAIPostPrimitive'
        }))

        const section = AIRich.newLayout('HScroll', primitives)

        const submessage = this.createAlert('GenAIPostPrimitive')

        return this._addContent(section, submessage, {
            id,
            replace,
            insertAt
        })
    }

    /** Texto pequeño de metadatos */
    addMetadata(text, { id, replace, insertAt } = {}) {
        if (typeof text !== 'string') {
            throw new TypeError('Text must be a string')
        }

        const section = AIRich.newLayout('Single', {
            text,
            __typename: 'GenAIMetadataTextPrimitive'
        })

        const submessage = {
            messageType: 2,
            messageText: text
        }

        return this._addContent(section, submessage, {
            id,
            replace,
            insertAt
        })
    }

    /** Texto de metadatos con prefijo ⓘ */
    addTip(text, { id, replace, insertAt } = {}) {
        if (typeof text !== 'string') {
            throw new TypeError('Text must be a string')
        }

        const section = AIRich.newLayout('Single', {
            text: 'ⓘ ' + text,
            __typename: 'GenAIMetadataTextPrimitive'
        })

        const submessage = {
            messageType: 2,
            messageText: text
        }

        return this._addContent(section, submessage, {
            id,
            replace,
            insertAt
        })
    }

    /** Widget de extensión (3P) con secciones y CTAs */
    addWidget(data, { layout, id, replace, insertAt, ...options } = {}) {
        if (!((data && typeof data === 'object' && !Array.isArray(data)) || (Array.isArray(data) && data.every(item => item && typeof item === 'object' && !Array.isArray(item))))) {
            throw new TypeError('Widget must be an object or an array of objects')
        }

        const isArray = Array.isArray(data)

        const items = isArray ? data : [data]

        const widgets = items.map(item => ({
            __typename: 'GenAI3PExtWidgetPrimitive',

            header: {
                __typename: 'GenAI3PExtWidgetStandardHeader',
                title: item.title ?? '',
                ...(item.header ?? {})
            },

            body: {
                __typename: 'GenAI3PExtCalendarEventList',
                sections: item.sections ?? [],

                ctas: (item.actions ?? []).map(action => ({
                    __typename: 'GenAI3PExtWidgetCTA',
                    label: action.label ?? '',
                    state: action.state ?? 'PENDING',
                    kind: action.kind ?? 'OTHER',
                    tool_call_id: action.tool_call_id ?? action.id ?? '',

                    ...(action.toast && {
                        toast: {
                            __typename: 'GenAI3PExtWidgetToast',
                            label: action.toast.label ?? action.label ?? ''
                        }
                    })
                })),

                ...(item.body ?? {})
            }
        }))

        const section = AIRich.newLayout(layout ?? (isArray ? 'HScroll' : 'Single'), isArray ? widgets : widgets[0], options)

        const submessage = this.createAlert('GenAI3PExtWidgetStandardHeader')

        return this._addContent(section, submessage, {
            id,
            replace,
            insertAt
        })
    }

    /** Acción de pie de mensaje (abrir url, etc.) */
    addFooterAction(data, { layout, id, replace, insertAt, ...options } = {}) {
        if (!((data && typeof data === 'object' && !Array.isArray(data)) || (Array.isArray(data) && data.every(item => item && typeof item === 'object' && !Array.isArray(item))))) {
            throw new TypeError('Footer action must be an object or an array of objects')
        }

        const isArray = Array.isArray(data)

        const items = isArray ? data : [data]

        const actions = items.map(item => ({
            __typename: 'GenAIFooterActionPrimitive',

            cta_text: item.text ?? item.cta_text ?? '',

            cta_type: item.type ?? item.cta_type ?? 'OPEN_URL',

            cta_url: item.url ?? item.cta_url ?? ''
        }))

        const section = AIRich.newLayout(layout ?? (isArray ? 'HScroll' : 'Single'), isArray ? actions : actions[0], options)

        const submessage = this.createAlert('GenAIFooterActionPrimitive')

        return this._addContent(section, submessage, {
            id,
            replace,
            insertAt
        })
    }

    /** Pills de sugerencias (el usuario toca y se envía el texto) */
    addSuggest(suggestion, { scroll = true, layout, id, replace, insertAt } = {}) {
        if (!(typeof suggestion === 'string' || (Array.isArray(suggestion) && suggestion.every(v => typeof v === 'string')))) {
            throw new TypeError('Suggestion must be a string or array of strings')
        }

        const suggest = Array.isArray(suggestion)
            ? suggestion.map(text => ({
                prompt_text: text,
                prompt_type: 'SUGGESTED_PROMPT',
                __typename: 'GenAIFollowUpSuggestionPillPrimitive'
            }))
            : [
                {
                    prompt_text: suggestion,
                    prompt_type: 'SUGGESTED_PROMPT',
                    __typename: 'GenAIFollowUpSuggestionPillPrimitive'
                }
            ]

        const type = layout ?? (suggest.length === 1 ? 'Single' : scroll ? 'HScroll' : 'ActionRow')

        const section = AIRich.newLayout(type, type === 'Single' ? suggest[0] : suggest, {
            __typename: 'GenAIUnifiedResponseSection'
        })

        const submessage = this.createAlert('GenAIFollowUpSuggestionPillPrimitive')

        return this._addContent(section, submessage, {
            id,
            replace,
            insertAt
        })
    }

    /* --------------------------- build / send --------------------------- */

    async build(
        jid,
        { forwarded = true, notification = false, includesUnifiedResponse = true, includesSubmessages = true, quoted, quotedParticipant, messageId, ...options } = {}
    ) {
        const forward = forwarded
            ? {
                forwardingScore: 1,
                isForwarded: true,
                forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
                forwardOrigin: 4
            }
            : {}

        // `notification` acepta true (usa el título) o un string con el texto a mostrar
        const notif = notification
            ? {
                sessionTransparencyMetadata: {
                    disclaimerText: typeof notification === 'string' ? notification : this._title || 'AI',
                    hcaId: `hca_${Date.now()}`,
                    sessionTransparencyType: 1
                }
            }
            : {}

        const qObj = quoted
            ? {
                stanzaId: quoted?.key?.id || quoted?.id,
                participant: quotedParticipant || quoted?.key?.participant || quoted?.participant || quoted?.key?.remoteJid,
                quotedType: 0,
                quotedMessage: typeof quoted === 'object' && quoted !== null ? (quoted.message ?? quoted) : undefined
            }
            : {}

        const sections = this._footer
            ? [
                ...(await waitAllPromises(this._sections)),
                AIRich.newLayout('Single', {
                    text: this._footer,
                    __typename: 'GenAIMetadataTextPrimitive'
                })
            ]
            : [...(await waitAllPromises(this._sections))]

        if (this._dynamic) {
            this.refreshResponseId()
            this.refreshBotResponseId()
        }

        const submessages = await waitAllPromises(this._submessages)

        const unified = {
            response_id: this._responseId,
            sections
        }

        return generateWAMessageFromContent(
            jid,
            {
                ...this._extraPayload,
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2,
                    botMetadata: {
                        verificationMetadata: {
                            proofs: [
                                {
                                    certificateChain: [botMetadataCertificate(), botMetadataCertificate(892)],
                                    version: 1,
                                    useCase: 1,
                                    signature: botMetadataSignature()
                                }
                            ]
                        },
                        botResponseId: this._botResponseId,
                        ...(this._title ? { messageDisclaimerText: this._title } : {}),
                        ...notif
                    }
                },
                botForwardedMessage: {
                    message: {
                        richResponseMessage: {
                            messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
                            ...(includesSubmessages ? { submessages } : {}),
                            ...(includesUnifiedResponse
                                ? {
                                    unifiedResponse: {
                                        data: Buffer.from(Toolkit.stringifyEscaped(unified))
                                    }
                                }
                                : {}),
                            contextInfo: {
                                ...forward,
                                ...qObj,
                                ...this._contextInfo
                            }
                        }
                    }
                }
            },
            { messageId: messageId || generateMessageIDV2(), ...options }
        )
    }

    /**
     * IMPORTANTE: no se envía el nodo <bot biz_bot="1"> por defecto — desde una
     * cuenta normal (no Business) en chat privado provoca un stream error 401 y
     * cierra la sesión. Si tienes cuenta Business verificada puedes activarlo
     * con send(jid, { ai: true }) (lo gestiona el relay de Ryzewa).
     */
    async send(jid, { messageId, additionalNodes, ...options } = {}) {
        const msg = await this.build(jid, { messageId, ...options })

        await this.#client.relayMessage(msg.key.remoteJid, msg.message, {
            messageId: msg.key.id,
            ...(additionalNodes?.length ? { additionalNodes } : {}),
            ...options
        })

        this._lastMessageKey = msg.key

        return msg
    }

    /**
     * Reenvía el contenido actual como edición del último mensaje enviado con
     * send(). Útil para actualizar el mensaje en vivo (progreso, resultados...).
     *
     *   const rich = new AIRich(conn).addText('Generando…', { id: 'status' })
     *   await rich.send(jid)
     *   rich.addText('✅ Listo', { replace: 'status' })
     *   await rich.sendEdit()
     */
    async sendEdit({ key, jid, ...options } = {}) {
        key = key ?? this._lastMessageKey
        jid = jid ?? key?.remoteJid

        if (!key?.id || !jid) {
            throw new InvalidTargetError('No message key available to edit — send() first or pass { key, jid }')
        }

        // la edición debe conservar los response ids del mensaje original
        // (así hace Meta AI el streaming); se suspende el modo dynamic
        const wasDynamic = this._dynamic
        this._dynamic = false
        let msg
        try {
            msg = await this.build(jid, options)
        } finally {
            this._dynamic = wasDynamic
        }

        // sin el atributo edit en el stanza, el cliente ignora la edición
        await this.#client.relayMessage(
            jid,
            {
                protocolMessage: {
                    key,
                    type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
                    editedMessage: msg.message,
                    timestampMs: Date.now()
                }
            },
            {
                messageId: generateMessageIDV2(),
                additionalAttributes: {
                    edit: isJidNewsletter(jid) ? '3' : '1'
                }
            }
        )

        // el mensaje editado conserva la key original
        msg.key = key
        this._lastMessageKey = key

        return msg
    }

    /** Alias de sendEdit() con jid/key explícitos */
    async edit(jid, key = this._lastMessageKey, options = {}) {
        return this.sendEdit({ jid, key, ...options })
    }
}

module.exports = { AIRich }
