"use strict"

Object.defineProperty(exports, "__esModule", { value: true })

/**
 * Módulo de builders interactivos de Ryzewa:
 *
 *  - Button   → interactiveMessage con native flow (quick replies, listas, urls, copiar...)
 *  - ButtonV2 → buttonsMessage clásico con thumbnail de ubicación
 *  - Carousel → carrusel de cards interactivas
 *  - AIRich   → richResponseMessage estilo Meta AI (markdown, código, tablas, media...)
 *  - Toolkit  → utilidades de media, entidades inline y promesas
 */

const INTERACTIVE_VERSION = '4.7.2'

const { Toolkit, extractIE, waitAllPromises } = require("./toolkit")
const { BaseBuilder } = require("./base-builder")
const { Button } = require("./button")
const { ButtonV2 } = require("./button-v2")
const { Carousel } = require("./carousel")
const { AIRich } = require("./ai-rich")
const { AIRichError, ItemNotFoundError, DuplicateIdError, InvalidTargetError, ContentValidationError } = require("./errors")

module.exports = {
    INTERACTIVE_VERSION,
    Toolkit,
    extractIE,
    waitAllPromises,
    BaseBuilder,
    Button,
    ButtonV2,
    Carousel,
    AIRich,
    AIRichError,
    ItemNotFoundError,
    DuplicateIdError,
    InvalidTargetError,
    ContentValidationError
}
