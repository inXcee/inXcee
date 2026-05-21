import pino from 'pino'

const NODE_ENV = process.env.NODE_ENV || 'development'
const isTest = NODE_ENV === 'test'
const isProd = NODE_ENV === 'production'

const level = process.env.LOG_LEVEL || (isTest ? 'silent' : isProd ? 'info' : 'debug')

const base = pino({
  level,
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(!isProd && !isTest
    ? {
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
        },
      }
    : {}),
})

// Variadic API: pino native imzası `(obj, msg)` desteklenir; aksi halde
// argümanlar string'e ve meta objesine ayrıştırılır. Error instance'ları
// `err`/`err1`... anahtarlarında yapısal yazılır (message + stack + name).
function wrap(method) {
  return (...args) => {
    if (args.length === 0) return base[method]('')
    const [first, second] = args
    if (
      args.length >= 2 &&
      first !== null &&
      typeof first === 'object' &&
      !Array.isArray(first) &&
      !(first instanceof Error) &&
      typeof second === 'string'
    ) {
      base[method](first, second, ...args.slice(2))
      return
    }
    let msg = ''
    const meta = {}
    let errIdx = 0
    for (const a of args) {
      if (a instanceof Error) {
        const key = errIdx === 0 ? 'err' : `err${errIdx}`
        meta[key] = { message: a.message, stack: a.stack, name: a.name }
        errIdx++
      } else if (typeof a === 'string') {
        msg += (msg ? ' ' : '') + a
      } else if (a === undefined) {
        msg += (msg ? ' ' : '') + 'undefined'
      } else {
        try {
          msg += (msg ? ' ' : '') + JSON.stringify(a)
        } catch {
          msg += (msg ? ' ' : '') + String(a)
        }
      }
    }
    if (Object.keys(meta).length) base[method](meta, msg)
    else base[method](msg)
  }
}

export const logger = {
  trace: wrap('trace'),
  debug: wrap('debug'),
  info: wrap('info'),
  warn: wrap('warn'),
  error: wrap('error'),
  fatal: wrap('fatal'),
  child: (bindings) => base.child(bindings),
  level: () => base.level,
  setLevel: (lvl) => { base.level = lvl },
}

export default logger
