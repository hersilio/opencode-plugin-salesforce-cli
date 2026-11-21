import { spawn } from "node:child_process"
import { rm, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

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

export type RunApexAnonymousInput = {
  targetOrg: string
  apexCode?: string
  apexFilePath?: string
  apiVersion?: string
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

export async function runApexAnonymous(
  sfBinary: string,
  input: RunApexAnonymousInput,
  options: SfCliRunOptions = {},
): Promise<SfCliResult> {
  const args = ["apex", "run", "--target-org", input.targetOrg, "--json"]

  if (input.apiVersion?.trim()) {
    args.push("--api-version", input.apiVersion.trim())
  }

  if (input.apexFilePath?.trim()) {
    args.push("--file", input.apexFilePath.trim())
    return runSfCli(sfBinary, args, options)
  }

  if (input.apexCode?.trim()) {
    const tempDir = await mkdtemp(join(tmpdir(), "opencode-sf-apex-"))
    const tempFile = join(tempDir, "anonymous.apex")
    try {
      await writeFile(tempFile, input.apexCode, "utf8")
      args.push("--file", tempFile)
      return await runSfCli(sfBinary, args, options)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  }

  throw new Error("Informe 'apexCode' ou 'apexFilePath'.")
}
