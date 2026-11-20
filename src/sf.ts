import { spawn } from "node:child_process"

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export type SfCliResult = {
  command: string
  exitCode: number
  stdout: string
  stderr: string
  json?: JsonValue
  timedOut: boolean
}

type SfCliRunOptions = {
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000

export async function runSfCli(
  binary: string,
  args: string[],
  options: SfCliRunOptions = {},
): Promise<SfCliResult> {
  try {
    return await runOnce(binary, args, options)
  } catch (error) {
    if (
      process.platform === "win32" &&
      isNotFoundError(error) &&
      !binary.toLowerCase().endsWith(".cmd")
    ) {
      return runOnce(`${binary}.cmd`, args, options)
    }
    throw error
  }
}

function runOnce(binary: string, args: string[], options: SfCliRunOptions): Promise<SfCliResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let timedOut = false
    let stdout = ""
    let stderr = ""

    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })

    child.on("error", (err) => {
      clearTimeout(timer)
      reject(err)
    })

    child.on("close", (exitCode) => {
      clearTimeout(timer)
      resolve({
        command: [binary, ...args].join(" "),
        exitCode: exitCode ?? -1,
        stdout,
        stderr,
        json: parseMaybeJson(stdout),
        timedOut,
      })
    })
  })
}

function parseMaybeJson(text: string): JsonValue | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined

  try {
    return JSON.parse(trimmed) as JsonValue
  } catch {
    return undefined
  }
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const code = (error as { code?: string }).code
  return code === "ENOENT"
}

export function sanitizeSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeSecrets)

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(obj)) {
      if (/(token|secret|password|authorization|apikey|api_key)/i.test(key)) {
        result[key] = "[REDACTED]"
      } else {
        result[key] = sanitizeSecrets(val)
      }
    }
    return result
  }

  return value
}

export function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export function shortText(text: string, max = 5_000): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n... [truncado ${text.length - max} caracteres]`
}
