"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeLibSignalRepository = makeLibSignalRepository;
const libsignal = __importStar(require("libsignal"));
const Utils_1 = require("../Utils");
const WABinary_1 = require("../WABinary");
const sender_key_name_1 = require("./Group/sender-key-name");
const sender_key_record_1 = require("./Group/sender-key-record");
const Group_1 = require("./Group");
const LIDMappingStore_1 = require("./lid-mapping")

const SESSION_CACHE_MAX_SIZE = 200
const SESSION_CACHE_TTL = 5 * 60 * 1000

const SENDER_KEY_CACHE_MAX_SIZE = 100
const SENDER_KEY_CACHE_TTL = 10 * 60 * 1000

function makeLibSignalRepository(auth, onWhatsAppFunc, logger) {
    const lidMapping = new LIDMappingStore_1.LIDMappingStore(auth.keys, onWhatsAppFunc, logger)
    const storage = signalStorage(auth);
    
    const sessionCache = new Map()
    const senderKeyCache = new Map()
    
    function getSessionFromCache(addr) {
        const key = addr.toString()
        const entry = sessionCache.get(key)
        if (entry && Date.now() - entry.time < SESSION_CACHE_TTL) {
            return entry.session
        }
        sessionCache.delete(key)
        return null
    }
    
    function setSessionInCache(addr, session) {
        const key = addr.toString()
        if (sessionCache.size >= SESSION_CACHE_MAX_SIZE) {
            const entries = [...sessionCache.entries()]
            entries.sort((a, b) => a[1].time - b[1].time)
            entries.slice(0, 50).forEach(([k]) => sessionCache.delete(k))
        }
        sessionCache.set(key, { session, time: Date.now() })
    }
    
    function getSenderKeyFromCache(senderName) {
        const key = senderName.toString()
        const entry = senderKeyCache.get(key)
        if (entry && Date.now() - entry.time < SENDER_KEY_CACHE_TTL) {
            return entry.record
        }
        senderKeyCache.delete(key)
        return null
    }
    
    function setSenderKeyInCache(senderName, record) {
        const key = senderName.toString()
        if (senderKeyCache.size >= SENDER_KEY_CACHE_MAX_SIZE) {
            const entries = [...senderKeyCache.entries()]
            entries.sort((a, b) => a[1].time - b[1].time)
            entries.slice(0, 25).forEach(([k]) => senderKeyCache.delete(k))
        }
        senderKeyCache.set(key, { record, time: Date.now() })
    }
    
    return {
        lidMapping,
        
        clearCaches() {
            sessionCache.clear()
            senderKeyCache.clear()
        },
        
        async validateSession(jid) {
            const addr = jidToSignalProtocolAddress(jid)
            const addrStr = addr.toString()
            
            if (sessionCache.has(addrStr)) {
                return { exists: true, cached: true }
            }
            
            const session = await storage.loadSession(addrStr)
            if (session) {
                setSessionInCache(addr, session)
                return { exists: true, cached: false }
            }
            
            return { exists: false, cached: false }
        },
        
        decryptGroupMessage({ group, authorJid, msg }) {
            const senderName = jidToSignalSenderKeyName(group, authorJid);
            const cipher = new Group_1.GroupCipher(storage, senderName);
            return cipher.decrypt(msg);
        },
        async processSenderKeyDistributionMessage({ item, authorJid }) {
            const builder = new Group_1.GroupSessionBuilder(storage);
            if (!item.groupId) {
                throw new Error('Group ID is required for sender key distribution message');
            }
            const senderName = jidToSignalSenderKeyName(item.groupId, authorJid);
            const senderMsg = new Group_1.SenderKeyDistributionMessage(null, null, null, null, item.axolotlSenderKeyDistributionMessage);
            const senderNameStr = senderName.toString();
            
            let senderKey = getSenderKeyFromCache(senderName)
            if (!senderKey) {
                const { [senderNameStr]: storedKey } = await auth.keys.get('sender-key', [senderNameStr]);
                senderKey = storedKey
            }
            
            if (!senderKey) {
                const newRecord = new sender_key_record_1.SenderKeyRecord()
                await storage.storeSenderKey(senderName, newRecord);
                setSenderKeyInCache(senderName, newRecord)
            }
            await builder.process(senderName, senderMsg);
            senderKeyCache.delete(senderNameStr)
        },
        async decryptMessage({ jid, type, ciphertext }) {
            const addr = jidToSignalProtocolAddress(jid);
            const session = new libsignal.SessionCipher(storage, addr);
            let result;
            switch (type) {
                case 'pkmsg':
                    result = await session.decryptPreKeyWhisperMessage(ciphertext);
                    sessionCache.delete(addr.toString())
                    break;
                case 'msg':
                    result = await session.decryptWhisperMessage(ciphertext);
                    break;
                default:
                    throw new Error(`Unknown message type: ${type}`);
            }
            return result;
        },
        async encryptMessage({ jid, data }) {
            const addr = jidToSignalProtocolAddress(jid);
            const cipher = new libsignal.SessionCipher(storage, addr);
            const { type: sigType, body } = await cipher.encrypt(data);
            const type = sigType === 3 ? 'pkmsg' : 'msg';
            return { type, ciphertext: Buffer.from(body, 'binary') };
        },
        async encryptGroupMessage({ group, meId, data }) {
            const senderName = jidToSignalSenderKeyName(group, meId);
            const builder = new Group_1.GroupSessionBuilder(storage);
            const senderNameStr = senderName.toString();
            
            let senderKey = getSenderKeyFromCache(senderName)
            if (!senderKey) {
                const { [senderNameStr]: storedKey } = await auth.keys.get('sender-key', [senderNameStr]);
                senderKey = storedKey
            }
            
            if (!senderKey) {
                const newRecord = new sender_key_record_1.SenderKeyRecord()
                await storage.storeSenderKey(senderName, newRecord);
                setSenderKeyInCache(senderName, newRecord)
            }
            const senderKeyDistributionMessage = await builder.create(senderName);
            const session = new Group_1.GroupCipher(storage, senderName);
            const ciphertext = await session.encrypt(data);
            return {
                ciphertext,
                senderKeyDistributionMessage: senderKeyDistributionMessage.serialize()
            };
        },
        async injectE2ESession({ jid, session }) {
            const cipher = new libsignal.SessionBuilder(storage, jidToSignalProtocolAddress(jid));
            await cipher.initOutgoing(session);
            sessionCache.delete(jidToSignalProtocolAddress(jid).toString())
        },
        jidToSignalProtocolAddress(jid) {
            return jidToSignalProtocolAddress(jid).toString();
        }
    };
}
const jidToSignalProtocolAddress = (jid) => {
    const { user, device } = (0, WABinary_1.jidDecode)(jid);
    return new libsignal.ProtocolAddress(user, device || 0);
};
const jidToSignalSenderKeyName = (group, user) => {
    return new sender_key_name_1.SenderKeyName(group, jidToSignalProtocolAddress(user));
};

const SESSION_STORAGE_CACHE = new Map()
const PREKEY_STORAGE_CACHE = new Map()
const STORAGE_CACHE_TTL = 3 * 60 * 1000

function signalStorage({ creds, keys }) {
    
    function getCachedSession(id) {
        const entry = SESSION_STORAGE_CACHE.get(id)
        if (entry && Date.now() - entry.time < STORAGE_CACHE_TTL) {
            return entry.session
        }
        SESSION_STORAGE_CACHE.delete(id)
        return null
    }
    
    function setCachedSession(id, session) {
        if (SESSION_STORAGE_CACHE.size > 150) {
            const entries = [...SESSION_STORAGE_CACHE.entries()]
            entries.sort((a, b) => a[1].time - b[1].time)
            entries.slice(0, 50).forEach(([k]) => SESSION_STORAGE_CACHE.delete(k))
        }
        SESSION_STORAGE_CACHE.set(id, { session, time: Date.now() })
    }
    
    function getCachedPreKey(id) {
        const entry = PREKEY_STORAGE_CACHE.get(id)
        if (entry && Date.now() - entry.time < STORAGE_CACHE_TTL) {
            return entry.key
        }
        PREKEY_STORAGE_CACHE.delete(id)
        return null
    }
    
    function setCachedPreKey(id, key) {
        if (PREKEY_STORAGE_CACHE.size > 100) {
            const entries = [...PREKEY_STORAGE_CACHE.entries()]
            entries.sort((a, b) => a[1].time - b[1].time)
            entries.slice(0, 30).forEach(([k]) => PREKEY_STORAGE_CACHE.delete(k))
        }
        PREKEY_STORAGE_CACHE.set(id, { key, time: Date.now() })
    }
    
    return {
        loadSession: async (id) => {
            const cached = getCachedSession(id)
            if (cached) {
                return libsignal.SessionRecord.deserialize(cached);
            }
            
            const { [id]: sess } = await keys.get('session', [id]);
            if (sess) {
                setCachedSession(id, sess)
                return libsignal.SessionRecord.deserialize(sess);
            }
        },
        storeSession: async (id, session) => {
            const serialized = session.serialize()
            setCachedSession(id, serialized)
            await keys.set({ session: { [id]: serialized } });
        },
        isTrustedIdentity: () => {
            return true;
        },
        loadPreKey: async (id) => {
            const keyId = id.toString();
            
            const cached = getCachedPreKey(keyId)
            if (cached) {
                return {
                    privKey: Buffer.from(cached.private),
                    pubKey: Buffer.from(cached.public)
                };
            }
            
            const { [keyId]: key } = await keys.get('pre-key', [keyId]);
            if (key) {
                setCachedPreKey(keyId, key)
                return {
                    privKey: Buffer.from(key.private),
                    pubKey: Buffer.from(key.public)
                };
            }
        },
        removePreKey: (id) => {
            PREKEY_STORAGE_CACHE.delete(id.toString())
            return keys.set({ 'pre-key': { [id]: null } })
        },
        loadSignedPreKey: () => {
            const key = creds.signedPreKey;
            return {
                privKey: Buffer.from(key.keyPair.private),
                pubKey: Buffer.from(key.keyPair.public)
            };
        },
        loadSenderKey: async (senderKeyName) => {
            const keyId = senderKeyName.toString();
            const { [keyId]: key } = await keys.get('sender-key', [keyId]);
            if (key) {
                return sender_key_record_1.SenderKeyRecord.deserialize(key);
            }
            return new sender_key_record_1.SenderKeyRecord();
        },
        storeSenderKey: async (senderKeyName, key) => {
            const keyId = senderKeyName.toString();
            const serialized = JSON.stringify(key.serialize());
            await keys.set({ 'sender-key': { [keyId]: Buffer.from(serialized, 'utf-8') } });
        },
        getOurRegistrationId: () => creds.registrationId,
        getOurIdentity: () => {
            const { signedIdentityKey } = creds;
            return {
                privKey: Buffer.from(signedIdentityKey.private),
                pubKey: (0, Utils_1.generateSignalPubKey)(signedIdentityKey.public)
            };
        },
        clearStorageCache: () => {
            SESSION_STORAGE_CACHE.clear()
            PREKEY_STORAGE_CACHE.clear()
        }
    };
}
