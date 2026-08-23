"use strict"

Object.defineProperty(exports, "__esModule", { value: true })

const lodash_1 = require("lodash")
const Defaults_1 = require("../Defaults")
const WABinary_1 = require("../WABinary")
const crypto_1 = require("./crypto")
const generics_1 = require("./generics")

const preKeyGenerationCache = {
    pendingKeys: new Map(),
    lastGenerationTime: 0,
    isGenerating: false
}

const PREKEY_BATCH_SIZE = 10
const PREKEY_GENERATION_COOLDOWN = 100

const createSignalIdentity = (wid, accountSignatureKey) => {
    return {
        identifier: { name: wid, deviceId: 0 },
        identifierKey: crypto_1.generateSignalPubKey(accountSignatureKey)
    }
}

const getPreKeys = async ({ get }, min, limit) => {
    const idList = []
    for (let id = min; id < limit; id++) {
        idList.push(id.toString())
    }
    
    const BATCH_SIZE = 50
    if (idList.length <= BATCH_SIZE) {
        return get('pre-key', idList)
    }
    
    const batches = []
    for (let i = 0; i < idList.length; i += BATCH_SIZE) {
        batches.push(idList.slice(i, i + BATCH_SIZE))
    }
    
    const results = await Promise.all(batches.map(batch => get('pre-key', batch)))
    return Object.assign({}, ...results)
}

const generateSinglePreKey = () => {
    return crypto_1.Curve.generateKeyPair()
}

const generateOrGetPreKeys = (creds, range) => {
    const avaliable = creds.nextPreKeyId - creds.firstUnuploadedPreKeyId
    const remaining = range - avaliable
    const lastPreKeyId = creds.nextPreKeyId + remaining - 1
    const newPreKeys = {}

    // Siempre se generan claves frescas. La version anterior reutilizaba claves de
    // `preKeyGenerationCache`, que es un cache a nivel de modulo compartido por todos
    // los sockets del proceso: con dos sesiones activas se podian repartir las mismas
    // pre-keys entre cuentas distintas.
    if (remaining > 0) {
        for (let i = creds.nextPreKeyId; i <= lastPreKeyId; i++) {
            newPreKeys[i] = generateSinglePreKey()
        }
    }

    return {
        newPreKeys,
        lastPreKeyId,
        preKeysRange: [creds.firstUnuploadedPreKeyId, range],
    }
}

const preGenerateKeys = async () => {
    // no-op: se mantiene por compatibilidad de API. Precalentar pre-keys en un cache
    // global no es seguro con varias sesiones en el mismo proceso.
}

const xmppSignedPreKey = (key) => ({
    tag: 'skey',
    attrs: {},
    content: [
        { tag: 'id', attrs: {}, content: generics_1.encodeBigEndian(key.keyId, 3) },
        { tag: 'value', attrs: {}, content: key.keyPair.public },
        { tag: 'signature', attrs: {}, content: key.signature }
    ]
})

const xmppPreKey = (pair, id) => ({
    tag: 'key',
    attrs: {},
    content: [
        { tag: 'id', attrs: {}, content: generics_1.encodeBigEndian(id, 3) },
        { tag: 'value', attrs: {}, content: pair.public }
    ]
})

const parseAndInjectE2ESessions = async (node, repository) => {
    const extractKey = (key) => (key ? ({
        keyId: WABinary_1.getBinaryNodeChildUInt(key, 'id', 3),
        publicKey: crypto_1.generateSignalPubKey(WABinary_1.getBinaryNodeChildBuffer(key, 'value')),
        signature: WABinary_1.getBinaryNodeChildBuffer(key, 'signature')
    }) : undefined)
    const nodes = WABinary_1.getBinaryNodeChildren(WABinary_1.getBinaryNodeChild(node, 'list'), 'user')
    for (const node of nodes) {
        WABinary_1.assertNodeErrorFree(node)
    }
    // Most of the work in repository.injectE2ESession is CPU intensive, not IO
    // So Promise.all doesn't really help here,
    // but blocks even loop if we're using it inside keys.transaction, and it makes it "sync" actually
    // This way we chunk it in smaller parts and between those parts we can yield to the event loop
    // It's rare case when you need to E2E sessions for so many users, but it's possible
    const chunkSize = 100
    const chunks = lodash_1.chunk(nodes, chunkSize)
    for (const nodesChunk of chunks) {
        await Promise.all(nodesChunk.map(async (node) => {
            const signedKey = WABinary_1.getBinaryNodeChild(node, 'skey')
            const key = WABinary_1.getBinaryNodeChild(node, 'key')
            const identity = WABinary_1.getBinaryNodeChildBuffer(node, 'identity')
            const jid = node.attrs.jid
            const registrationId = WABinary_1.getBinaryNodeChildUInt(node, 'registration', 4)
            await repository.injectE2ESession({
                jid,
                session: {
                    registrationId: registrationId,
                    identityKey: crypto_1.generateSignalPubKey(identity),
                    signedPreKey: extractKey(signedKey),
                    preKey: extractKey(key)
                }
            })
        }))
    }
}

const isValidUInt = (n) => typeof n === 'number' && Number.isInteger(n)

/**
 * Extract E2E session from a retry receipt.
 * This allows the library to process keys (identity, signed pre-key, pre-key)
 * from message retry receipts, enabling E2E session establishment.
 */
const extractE2ESessionFromRetryReceipt = (receipt) => {
    const keysNode = WABinary_1.getBinaryNodeChild(receipt, 'keys')
    if (!keysNode) return null

    const typeBuf = WABinary_1.getBinaryNodeChildBuffer(keysNode, 'type')
    if (!typeBuf || typeBuf.length !== 1 || typeBuf[0] !== Defaults_1.KEY_BUNDLE_TYPE[0]) return null

    const identity = WABinary_1.getBinaryNodeChildBuffer(keysNode, 'identity')
    const skey = WABinary_1.getBinaryNodeChild(keysNode, 'skey')
    if (!identity || identity.length !== 32 || !skey) return null

    const registrationId = WABinary_1.getBinaryNodeChildUInt(receipt, 'registration', 4)
    if (!isValidUInt(registrationId)) return null

    const signedPubKey = WABinary_1.getBinaryNodeChildBuffer(skey, 'value')
    const signedSig = WABinary_1.getBinaryNodeChildBuffer(skey, 'signature')
    const signedKeyId = WABinary_1.getBinaryNodeChildUInt(skey, 'id', 3)
    if (!signedPubKey || signedPubKey.length !== 32 || !signedSig || !isValidUInt(signedKeyId)) {
        return null
    }

    const preKeyNode = WABinary_1.getBinaryNodeChild(keysNode, 'key')
    let preKey
    if (preKeyNode) {
        const preKeyPub = WABinary_1.getBinaryNodeChildBuffer(preKeyNode, 'value')
        const preKeyId = WABinary_1.getBinaryNodeChildUInt(preKeyNode, 'id', 3)
        if (!preKeyPub || preKeyPub.length !== 32 || !isValidUInt(preKeyId)) {
            return null
        }
        preKey = {
            keyId: preKeyId,
            publicKey: crypto_1.generateSignalPubKey(preKeyPub)
        }
    }

    return {
        registrationId,
        identityKey: crypto_1.generateSignalPubKey(identity),
        signedPreKey: {
            keyId: signedKeyId,
            publicKey: crypto_1.generateSignalPubKey(signedPubKey),
            signature: signedSig
        },
        preKey
    }
}

const extractDeviceJids = (result, myJid, myLid, excludeZeroDevices) => {
    const { user: myUser, device: myDevice } = WABinary_1.jidDecode(myJid)
    const extracted = []
    for (const userResult of result) {
        const { devices, id } = userResult
        const decoded = WABinary_1.jidDecode(id)
        const { user, server } = decoded
        let { domainType } = decoded
        const deviceList = devices?.deviceList
        if (!Array.isArray(deviceList)) continue
        for (const { id: device, keyIndex, isHosted } of deviceList) {
            if (
                (!excludeZeroDevices || device !== 0) &&
                ((myUser !== user && myLid !== user) || myDevice !== device) &&
                (device === 0 || !!keyIndex)
            ) {
                if (isHosted) {
                    domainType = domainType === WABinary_1.WAJIDDomains.LID
                        ? WABinary_1.WAJIDDomains.HOSTED_LID
                        : WABinary_1.WAJIDDomains.HOSTED
                }
                extracted.push({
                    user,
                    device,
                    domainType,
                    server: WABinary_1.getServerFromDomainType(server, domainType)
                })
            }
        }
    }
    return extracted
}

/**
 * get the next N keys for upload or processing
 * @param count number of pre-keys to get or generate
 */
const getNextPreKeys = async ({ creds, keys }, count) => {
    const { newPreKeys, lastPreKeyId, preKeysRange } = generateOrGetPreKeys(creds, count)
    const update = {
        nextPreKeyId: Math.max(lastPreKeyId + 1, creds.nextPreKeyId),
        firstUnuploadedPreKeyId: Math.max(creds.firstUnuploadedPreKeyId, lastPreKeyId + 1)
    }
    await keys.set({ 'pre-key': newPreKeys })
    const preKeys = await getPreKeys(keys, preKeysRange[0], preKeysRange[0] + preKeysRange[1])
    return { update, preKeys }
}

const getNextPreKeysNode = async (state, count) => {
    const { creds } = state
    const { update, preKeys } = await getNextPreKeys(state, count)
    const node = {
        tag: 'iq',
        attrs: {
            xmlns: 'encrypt',
            type: 'set',
            to: WABinary_1.S_WHATSAPP_NET,
        },
        content: [
            { tag: 'registration', attrs: {}, content: generics_1.encodeBigEndian(creds.registrationId) },
            { tag: 'type', attrs: {}, content: Defaults_1.KEY_BUNDLE_TYPE },
            { tag: 'identity', attrs: {}, content: creds.signedIdentityKey.public },
            { tag: 'list', attrs: {}, content: Object.keys(preKeys).map(k => xmppPreKey(preKeys[+k], +k)) },
            xmppSignedPreKey(creds.signedPreKey)
        ]
    }
    return { update, node }
}

module.exports = {
  createSignalIdentity, 
  getPreKeys, 
  generateOrGetPreKeys, 
  xmppSignedPreKey, 
  xmppPreKey, 
  parseAndInjectE2ESessions, 
  extractE2ESessionFromRetryReceipt,
  extractDeviceJids, 
  getNextPreKeys, 
  getNextPreKeysNode,
  preGenerateKeys,
  preKeyGenerationCache
}
