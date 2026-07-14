"use strict"

Object.defineProperty(exports, "__esModule", { value: true })

const LRUCache_1 = require("lru-cache")

const RECENT_MESSAGES_SIZE = 1024

const RECREATE_SESSION_TIMEOUT = 30 * 60 * 1000

const PHONE_REQUEST_DELAY = 1500

class MessageRetryManager {
    constructor(logger, maxMsgRetryCount) {
        this.logger = logger
        this.recentMessagesMap = new LRUCache_1.LRUCache({
            max: RECENT_MESSAGES_SIZE,
            ttl: 15 * 60 * 1000,
            ttlAutopurge: true
        })
        this.sessionRecreateHistory = new LRUCache_1.LRUCache({
            ttl: RECREATE_SESSION_TIMEOUT * 2,
            ttlAutopurge: true
        })
        this.retryCounters = new LRUCache_1.LRUCache({
            ttl: 10 * 60 * 1000,
            ttlAutopurge: true,
            updateAgeOnGet: true
        })
        this.pendingPhoneRequests = {}
        this.maxMsgRetryCount = 5
        this.statistics = {
            totalRetries: 0,
            successfulRetries: 0,
            failedRetries: 0,
            mediaRetries: 0,
            sessionRecreations: 0,
            phoneRequests: 0
        }
        this.maxMsgRetryCount = maxMsgRetryCount
        
        this.batchQueue = []
        this.batchTimer = null
    }
    addRecentMessage(to, id, message) {
        const key = { to, id }
        const keyStr = this.keyToString(key)
        // Add new message
        this.recentMessagesMap.set(keyStr, {
            message,
            timestamp: Date.now()
        })
        this.logger.debug(`Added message to retry cache: ${to}/${id}`)
    }
    getRecentMessage(to, id) {
        const key = { to, id }
        const keyStr = this.keyToString(key)
        return this.recentMessagesMap.get(keyStr)
    }
    shouldRecreateSession(jid, retryCount, hasSession) {
        // If we don't have a session, always recreate
        if (!hasSession) {
            this.sessionRecreateHistory.set(jid, Date.now())
            this.statistics.sessionRecreations++
            return {
                reason: "we don't have a Signal session with them",
                recreate: true
            }
        }
        // Only consider recreation if retry count > 1
        if (retryCount < 2) {
            return { reason: '', recreate: false }
        }
        const now = Date.now()
        const prevTime = this.sessionRecreateHistory.get(jid)
        // If no previous recreation or it's been more than the timeout
        if (!prevTime || now - prevTime > RECREATE_SESSION_TIMEOUT) {
            this.sessionRecreateHistory.set(jid, now)
            this.statistics.sessionRecreations++
            return {
                reason: 'retry count > 1 and over timeout since last recreation',
                recreate: true
            }
        }
        return { reason: '', recreate: false }
    }
    incrementRetryCount(messageId) {
        const current = (this.retryCounters.get(messageId) || 0) + 1
        this.retryCounters.set(messageId, current)
        this.statistics.totalRetries++
        return current
    }
    getRetryCount(messageId) {
        return this.retryCounters.get(messageId) || 0
    }
    hasExceededMaxRetries(messageId) {
        return this.getRetryCount(messageId) >= this.maxMsgRetryCount
    }
    markRetrySuccess(messageId) {
        this.statistics.successfulRetries++
        // Clean up retry counter for successful message
        this.retryCounters.delete(messageId)
        this.cancelPendingPhoneRequest(messageId)
    }
    markRetryFailed(messageId) {
        this.statistics.failedRetries++
        this.retryCounters.delete(messageId)
    }
    schedulePhoneRequest(messageId, callback, delay = PHONE_REQUEST_DELAY) {
        // Cancel any existing request for this message
        this.cancelPendingPhoneRequest(messageId)
        this.pendingPhoneRequests[messageId] = setTimeout(() => {
            delete this.pendingPhoneRequests[messageId]
            this.statistics.phoneRequests++
            callback()
        }, delay)
        this.logger.debug(`Scheduled phone request for message ${messageId} with ${delay}ms delay`)
    }
    cancelPendingPhoneRequest(messageId) {
        const timeout = this.pendingPhoneRequests[messageId]
        if (timeout) {
            clearTimeout(timeout)
            delete this.pendingPhoneRequests[messageId]
            this.logger.debug(`Cancelled pending phone request for message ${messageId}`)
        }
    }
    keyToString(key) {
        return `${key.to}:${key.id}`
    }
}

module.exports = {
  MessageRetryManager
}
