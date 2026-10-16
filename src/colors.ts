// ANSI colors for terminal output, used only when stderr is a terminal and
// NO_COLOR is unset (FORCE_COLOR forces them). `process` is read from
// globalThis so the library keeps working outside Node.
const runtime = (globalThis as { process?: NodeJS.Process }).process
const env = runtime?.env ?? {}

export const useColors =
  env.NO_COLOR === undefined &&
  (env.FORCE_COLOR === undefined
    ? runtime?.stderr?.isTTY === true
    : env.FORCE_COLOR !== '0')

const ansi =
  (open: number, close: number) =>
  (text: string): string =>
    useColors ? `\u001b[${open}m${text}\u001b[${close}m` : text

export const bold = ansi(1, 22)
export const dim = ansi(2, 22)
export const red = ansi(31, 39)
export const green = ansi(32, 39)
export const yellow = ansi(33, 39)
export const cyan = ansi(36, 39)
