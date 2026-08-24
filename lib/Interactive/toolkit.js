"use strict"

Object.defineProperty(exports, "__esModule", { value: true })

/**
 * Utilidades compartidas por los builders interactivos:
 * extracción de entidades inline (links, citas, LaTeX), resolución de media,
 * miniaturas de video y helpers de promesas.
 *
 * `sharp` y `fluent-ffmpeg` son dependencias OPCIONALES: si no están instaladas,
 * el redimensionado devuelve el buffer original y las miniaturas de video
 * devuelven un buffer vacío (modo silencioso).
 */

const { PassThrough, Readable } = require("stream")
const { prepareWAMessageMedia } = require("../Utils/messages")

const optionalRequire = name => {
    try {
        return require(name)
    } catch {
        return null
    }
}

const sharp = optionalRequire('sharp')
const ffmpeg = optionalRequire('fluent-ffmpeg')

/**
 * Extrae entidades inline de un texto con sintaxis tipo markdown:
 *  - `[texto](url)`   → hyperlink (prefija la url con `!` para marcarla como no confiable)
 *  - `[](url)`        → cita numerada
 *  - `[expr|w|h](url)`→ LaTeX renderizado como imagen
 */
function extractIE(text, { extract = true, hyperlink = true, citation = true, latex = true } = {}) {
    if (!extract) {
        return {
            text,
            ie: [],
            inline_entities: []
        }
    }

    const createIE = (type, ie) => {
        if (type == 'hyperlink') {
            return {
                key: ie.key,
                metadata: {
                    display_name: ie.text,
                    is_trusted: ie.is_trusted,
                    url: ie.url,
                    __typename: 'GenAIInlineLinkItem'
                }
            }
        }

        if (type == 'citation') {
            return {
                key: ie.key,
                metadata: {
                    reference_id: ie.reference_id,
                    reference_url: ie.url,
                    reference_title: ie.url,
                    reference_display_name: ie.url,
                    sources: [],
                    __typename: 'GenAISearchCitationItem'
                }
            }
        }

        if (type == 'latex') {
            return {
                key: ie.key,
                metadata: {
                    latex_expression: ie.text,
                    latex_image: {
                        url: ie.url,
                        width: Number(ie.width) || 100,
                        height: Number(ie.height) || 100
                    },
                    font_height: Number(ie.font_height) || 83.333333333333,
                    padding: Number(ie.padding) || 15,
                    __typename: 'GenAILatexItem'
                }
            }
        }
    }

    let ie = []
    let inline_entities = []
    let result = ''
    let last = 0
    let citation_index = 1
    let hyperlink_index = 0
    let latex_index = 0
    let stack = []

    for (let i = 0; i < text.length; i++) {
        if (text[i] == '[' && text[i - 1] != '\\') {
            stack.push(i)
        } else if (text[i] == ']' && (text[i + 1] == '(' || text[i + 1] == '<')) {
            let start = stack.pop()

            if (start == null) continue

            let open = text[i + 1]
            let close = open == '(' ? ')' : '>'
            let type = open == '(' ? 'link' : 'latex'
            let end = i + 2
            let depth = 1

            while (end < text.length && depth) {
                if (text[end] == open && text[end - 1] != '\\') depth++
                else if (text[end] == close && text[end - 1] != '\\') depth--
                end++
            }

            if (depth) continue

            let raw = text.slice(start + 1, i).trim()
            let url = text.slice(i + 2, end - 1).trim()

            let key
            let tag
            let data

            if (type == 'latex') {
                if (!latex) continue

                let [txt = '', width = null, height = null, font_height = null, padding = null] = raw.split('|')

                key = `NIXEL_LATEX_${latex_index++}`
                tag = `{{${key}}}${txt || 'image'}{{/${key}}}`

                data = {
                    type: 'latex',
                    ie: {
                        key,
                        text: txt,
                        url,
                        width,
                        height,
                        font_height,
                        padding
                    }
                }
            } else if (raw) {
                if (!hyperlink) continue

                const trusted = !url.startsWith('!')

                if (!trusted) {
                    url = url.slice(1)
                }

                key = `NIXEL_HYPERLINK_${hyperlink_index++}`
                tag = `{{${key}}}${url}{{/${key}}}`

                data = {
                    type: 'hyperlink',
                    ie: {
                        key,
                        text: raw,
                        url,
                        is_trusted: trusted
                    }
                }
            } else {
                if (!citation) continue

                key = `NIXEL_CITATION_${citation_index - 1}`
                tag = `{{${key}}}${url}{{/${key}}}`

                data = {
                    type: 'citation',
                    ie: {
                        reference_id: citation_index++,
                        key,
                        text: '',
                        url
                    }
                }
            }

            result += text.slice(last, start) + tag
            last = end

            ie.push(data)

            const entity = createIE(data.type, data.ie)

            if (entity) {
                inline_entities.push(entity)
            }

            i = end - 1
        }
    }

    result += text.slice(last)

    return {
        text: result,
        ie,
        inline_entities
    }
}

/** Resuelve recursivamente todas las promesas anidadas en objetos/arrays */
async function waitAllPromises(input) {
    const isPromise = v => v && typeof v.then === 'function'
    const isObject = v => v && typeof v === 'object'

    const deep = async v => {
        if (isPromise(v)) return deep(await v)
        if (Array.isArray(v)) return Promise.all(v.map(deep))
        if (isObject(v)) {
            const entries = await Promise.all(Object.entries(v).map(async ([k, val]) => [k, await deep(val)]))
            return Object.fromEntries(entries)
        }
        return v
    }

    return deep(await input)
}

class Toolkit {
    static extractIE(text, { extract = true, hyperlink = true, citation = true, latex = true } = {}) {
        return extractIE(text, { extract, hyperlink, citation, latex })
    }

    static async resize(buffer, x, y, fit = 'cover') {
        if (!sharp) {
            // sin sharp instalado no se puede redimensionar; se devuelve tal cual
            return buffer
        }

        return await sharp(buffer)
            .resize(x, y, {
                fit,
                position: 'center',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .png()
            .toBuffer()
    }

    static async waitAllPromises(input) {
        return await waitAllPromises(input)
    }

    static async fetchBuffer(url, options = {}, { silent = true } = {}) {
        try {
            let response = await fetch(url, options)
            if (!response.ok) throw Error(`HTTP ${response.status}`)
            return Buffer.from(await response.arrayBuffer())
        } catch (error) {
            if (silent) return Buffer.alloc(0)
            throw error
        }
    }

    /** Sube un buffer/url a los servidores de WhatsApp y devuelve la URL resultante */
    static async toUrl(_client, path, mediaType = 'document') {
        if (!path) throw new Error('Url or buffer needed')

        const media = await prepareWAMessageMedia(
            {
                [mediaType]: Buffer.isBuffer(path) ? path : { url: path }
            },
            {
                upload: _client.waUploadToServer,
                jid: '@newsletter'
            }
        )

        return Object.values(media)[0]?.url
    }

    /**
     * Normaliza cualquier entrada de media (url http, url de whatsapp.net, base64 o buffer)
     * al formato pedido en `result`: 'url' | 'buffer' | 'base64'.
     */
    static async resolveMedia(_client, media, mediaType = 'image', { resolveUrl = false, resolveWAUrl = false, result = 'url', resize = false, width = 300, height = 300 } = {}) {
        const isUrl = str => /^https?:\/\/.+/i.test(str)

        const isWAUrl = str => /^https?:\/\/[^/]*\.whatsapp\.net\//i.test(str)

        if (Array.isArray(media)) {
            return Promise.all(
                media.map(item =>
                    Toolkit.resolveMedia(_client, item, mediaType, {
                        resolveUrl,
                        resolveWAUrl,
                        result,
                        resize,
                        width,
                        height
                    })
                )
            )
        }

        const originalIsBuffer = Buffer.isBuffer(media)

        if (typeof media === 'string' && isUrl(media)) {
            if (isWAUrl(media)) {
                if (resolveWAUrl) {
                    media = await Toolkit.fetchBuffer(media, {}, { silent: true })
                } else if (!resolveUrl) {
                    if (result === 'url') return media

                    media = await Toolkit.fetchBuffer(media, {}, { silent: true })
                }
            } else {
                if (!resolveUrl) {
                    if (result === 'url') return media

                    media = await Toolkit.fetchBuffer(media, {}, { silent: true })
                } else {
                    media = await Toolkit.fetchBuffer(media, {}, { silent: true })
                }
            }
        }

        if (typeof media === 'string' && !isUrl(media)) {
            media = Buffer.from(media, 'base64')
        }

        if (!Buffer.isBuffer(media) || !media.length) {
            return
        }

        if (resize && Buffer.isBuffer(media)) {
            media = await Toolkit.resize(media, width, height)
        }

        if (result === 'buffer') {
            return media
        }

        if (result === 'base64') {
            return media.toString('base64')
        }

        if (originalIsBuffer) {
            return Toolkit.toUrl(_client, media, mediaType)
        }

        return Toolkit.toUrl(_client, media, mediaType)
    }

    /** Lee la duración (en segundos) de un MP4 parseando el atom mvhd, sin ffmpeg */
    static getMp4Duration(buffer, { silent = true } = {}) {
        try {
            if (!Buffer.isBuffer(buffer) || buffer.length < 8) {
                if (silent) return 0
                throw new Error('Invalid buffer')
            }

            let offset = 0

            while (offset < buffer.length - 8) {
                const size = buffer.readUInt32BE(offset)

                if (size < 8 || offset + size > buffer.length) {
                    if (silent) return 0
                    throw new Error('Invalid atom size')
                }

                const type = buffer.toString('ascii', offset + 4, offset + 8)

                if (type === 'moov') {
                    let moovOffset = offset + 8
                    const moovEnd = offset + size

                    while (moovOffset < moovEnd - 8) {
                        const childSize = buffer.readUInt32BE(moovOffset)

                        if (childSize < 8 || moovOffset + childSize > moovEnd) {
                            if (silent) return 0
                            throw new Error('Invalid child atom size')
                        }

                        const childType = buffer.toString('ascii', moovOffset + 4, moovOffset + 8)

                        if (childType === 'mvhd') {
                            const version = buffer.readUInt8(moovOffset + 8)

                            if (version === 0) {
                                const timescale = buffer.readUInt32BE(moovOffset + 20)
                                const duration = buffer.readUInt32BE(moovOffset + 24)

                                if (!timescale) {
                                    if (silent) return 0
                                    throw new Error('Invalid timescale')
                                }

                                return duration / timescale
                            }

                            if (version === 1) {
                                const timescale = buffer.readUInt32BE(moovOffset + 32)
                                const duration = Number(buffer.readBigUInt64BE(moovOffset + 36))

                                if (!timescale) {
                                    if (silent) return 0
                                    throw new Error('Invalid timescale')
                                }

                                return duration / timescale
                            }
                        }

                        moovOffset += childSize
                    }
                }

                offset += size
            }

            if (silent) return 0

            throw new Error('No mvhd found!')
        } catch (err) {
            if (silent) return 0
            throw err
        }
    }

    /** Extrae un fotograma del video como miniatura (requiere fluent-ffmpeg + ffmpeg en el sistema) */
    static getMp4Preview(videoBuffer, { time, result = 'buffer', resize = true, width = 300, height = 300, silent = true } = {}) {
        return new Promise((resolve, reject) => {
            const fail = err => {
                if (silent) {
                    return resolve(result === 'base64' ? '' : Buffer.alloc(0))
                }
                return reject(err)
            }

            try {
                if (!ffmpeg) {
                    return fail(new Error('fluent-ffmpeg no está instalado'))
                }

                if (!Buffer.isBuffer(videoBuffer) || !videoBuffer.length) {
                    return fail(new Error('videoBuffer inválido o vacío'))
                }

                const inputStream = new Readable({ read() {} })
                inputStream.push(videoBuffer)
                inputStream.push(null)

                const outputStream = new PassThrough()
                const chunks = []

                outputStream.on('data', chunk => chunks.push(chunk))

                outputStream.on('end', async () => {
                    try {
                        let output = Buffer.concat(chunks)

                        if (!output.length) {
                            return fail(new Error('Salida vacía — revisa el formato o el timestamp del video'))
                        }

                        if (resize) {
                            output = await Toolkit.resize(output, width, height)
                        }

                        return resolve(result === 'base64' ? output.toString('base64') : output)
                    } catch (err) {
                        return fail(err)
                    }
                })

                outputStream.on('error', fail)

                time = time ?? Math.min(Toolkit.getMp4Duration(videoBuffer) * 0.2, 10)

                ffmpeg(inputStream)
                    .outputOptions([`-ss ${time}`, '-vframes 1', '-vcodec png', '-f image2pipe'])
                    .on('error', err => fail(new Error(`ffmpeg error: ${err.message}`)))
                    .pipe(outputStream, { end: true })
            } catch (err) {
                return fail(err)
            }
        })
    }

    /** JSON.stringify con caracteres no-ASCII escapados como \uXXXX */
    static stringifyEscaped(obj) {
        return JSON.stringify(obj).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
    }
}

module.exports = {
    Toolkit,
    extractIE,
    waitAllPromises
}
