import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logger } from './logger.js'

describe('logger shim', () => {
  beforeEach(() => {
    logger.setLevel('debug')
  })

  it('exports standard log methods', () => {
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.debug).toBe('function')
    expect(typeof logger.fatal).toBe('function')
  })

  it('handles console-style variadic args without throwing', () => {
    expect(() => logger.info('plain string')).not.toThrow()
    expect(() => logger.info('with', 'multiple', 'parts')).not.toThrow()
    expect(() => logger.error('an error', new Error('boom'))).not.toThrow()
    expect(() => logger.warn({ context: 'meta' }, 'object then message')).not.toThrow()
    expect(() => logger.info({ extra: 1 })).not.toThrow()
    expect(() => logger.debug()).not.toThrow()
  })

  it('child returns a logger', () => {
    const child = logger.child({ scope: 'test' })
    expect(typeof child.info).toBe('function')
  })

  it('setLevel is reflected in level()', () => {
    logger.setLevel('warn')
    expect(logger.level()).toBe('warn')
    logger.setLevel('debug')
    expect(logger.level()).toBe('debug')
  })
})
