import debug from 'debug'

import { configurationError } from './messages.js'
import { validateBraces } from './validateBraces.js'

const debugLog = debug('lint-staged:validateConfig')

const isObject = (test) => test && typeof test === 'object' && !Array.isArray(test)

const TEST_DEPRECATED_KEYS = new Map([
  ['concurrent', (key) => typeof key === 'boolean'],
  ['chunkSize', (key) => typeof key === 'number'],
  ['globOptions', isObject],
  ['linters', isObject],
  ['ignore', (key) => Array.isArray(key)],
  ['subTaskConcurrency', (key) => typeof key === 'number'],
  ['renderer', (key) => typeof key === 'string'],
  ['relative', (key) => typeof key === 'boolean'],
])

/**
 * Runs config validation. Throws error if the config is not valid.
 * @param config {Object}
 * @returns config {Object}
 */
export const validateConfig = (config, logger) => {
  debugLog('Validating config')

  if (!config || (typeof config !== 'object' && typeof config !== 'function')) {
    throw new Error('Configuration should be an object or a function!')
  }

  /**
   * Function configurations receive all staged files as their argument.
   * They are not further validated here to make sure the function gets
   * evaluated only once.
   *
   * @see makeCmdTasks
   */
  if (typeof config === 'function') {
    return { '*': config }
  }

  if (Object.entries(config).length === 0) {
    throw new Error('Configuration should not be empty!')
  }

  const errors = []

  /**
   * Create a new validated config because the keys (patterns) might change.
   * Since the Object.reduce method already loops through each entry in the config,
   * it can be used for validating the values at the same time.
   */
  const validatedConfig = Object.entries(config).reduce((collection, [pattern, task]) => {
    /** Versions < 9 had more complex configuration options that are no longer supported. */
    if (TEST_DEPRECATED_KEYS.has(pattern)) {
      const testFn = TEST_DEPRECATED_KEYS.get(pattern)
      if (testFn(task)) {
        errors.push(
          configurationError(pattern, 'Advanced configuration has been deprecated.', task)
        )
      }

      /** Return early for deprecated keys to skip validating their (deprecated) values */
      return collection
    }

    if (
      (!Array.isArray(task) ||
        task.some((item) => typeof item !== 'string' && typeof item !== 'function')) &&
      typeof task !== 'string' &&
      typeof task !== 'function'
    ) {
      errors.push(
        configurationError(
          pattern,
          'Should be a string, a function, or an array of strings and functions.',
          task
        )
      )
    }

    /**
     * A typical configuration error is using invalid brace expansion, like `*.{js}`.
     * These are automatically fixed and warned about.
     */
    const fixedPattern = validateBraces(pattern, logger)

    return { ...collection, [fixedPattern]: task }
  }, {})

  if (errors.length) {
    const message = errors.join('\n\n')

    logger.error(`Could not parse lint-staged config.

${message}

See https://github.com/okonet/lint-staged#configuration.`)

    throw new Error(message)
  }

  return validatedConfig
}
