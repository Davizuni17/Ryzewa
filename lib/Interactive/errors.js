"use strict"

Object.defineProperty(exports, "__esModule", { value: true })

/**
 * Errores tipados usados por los builders interactivos (AIRich, Button, Carousel...).
 * Todos exponen `code` para poder filtrarlos programáticamente.
 */

class AIRichError extends Error {
    constructor(message, code, meta = {}) {
        super(message)
        this.name = 'AIRichError'
        this.code = code
        Object.assign(this, meta)
    }
}

class ItemNotFoundError extends AIRichError {
    constructor(id, availableIds = []) {
        super(
            `Item id "${id}" not found${availableIds.length ? ` (available: ${availableIds.join(', ')})` : ' (no items have an id yet)'}`,
            'ITEM_NOT_FOUND',
            { id, availableIds }
        )
        this.name = 'ItemNotFoundError'
    }
}

class DuplicateIdError extends AIRichError {
    constructor(id) {
        super(`Item id "${id}" already exists`, 'DUPLICATE_ID', { id })
        this.name = 'DuplicateIdError'
    }
}

class InvalidTargetError extends AIRichError {
    constructor(message, meta = {}) {
        super(message, 'INVALID_TARGET', meta)
        this.name = 'InvalidTargetError'
    }
}

class ContentValidationError extends AIRichError {
    constructor(message, meta = {}) {
        super(message, 'CONTENT_VALIDATION', meta)
        this.name = 'ContentValidationError'
    }
}

module.exports = {
    AIRichError,
    ItemNotFoundError,
    DuplicateIdError,
    InvalidTargetError,
    ContentValidationError
}
