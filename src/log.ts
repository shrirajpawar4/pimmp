const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED = '\x1b[31m'
const CYAN = '\x1b[36m'
const MAGENTA = '\x1b[35m'

function colorize(color: string, value: string) {
  return `${color}${value}${RESET}`
}

export function logStage(stage: string, message: string) {
  console.log(`${colorize(CYAN, `[pimpp]`)} ${colorize(MAGENTA, stage)} ${message}`)
}

export function logSuccess(stage: string, message: string) {
  console.log(`${colorize(CYAN, `[pimpp]`)} ${colorize(GREEN, stage)} ${message}`)
}

export function logWarn(stage: string, message: string) {
  console.log(`${colorize(CYAN, `[pimpp]`)} ${colorize(YELLOW, stage)} ${message}`)
}

export function logError(stage: string, message: string) {
  console.log(`${colorize(CYAN, `[pimpp]`)} ${colorize(RED, stage)} ${message}`)
}

export function logDivider(label: string) {
  console.log(`${DIM}──────────────── ${label} ────────────────${RESET}`)
}
