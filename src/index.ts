import { Plugin } from "@opencode/plugin"
import { prettyJson, runSfCli, sanitizeSecrets, shortText } from "./sf"

type ConnectOrgInput = {
  environment: "sandbox" | "production"
  alias?: string
  setDefault?: boolean
  browser?: "chrome" | "edge" | "firefox"
  instanceUrl?: string
  clientId?: string
}

type RunApexAnonymousInput = {
  targetOrg: string
  apexCode?: string
  apexFilePath?: string
  apiVersion?: string
}

const SANDBOX_URL = "https://test.salesforce.com"
const PRODUCTION_URL = "https://login.salesforce.com"

export default Plugin.define({
  id: "salesforce-cli",
  async setup(ctx) {
    const sfBinary = readStringOption(ctx.options, "sfBinary") ?? "sf"
    const timeoutMs = readNumberOption(ctx.options, "timeoutMs") ?? 10 * 60 * 1000

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "salesforce",
        description: "Ferramentas Salesforce via Salesforce CLI (sf)",
      })

      editor.add({
        name: "connect_org",
        description:
          "Conecta em uma org Salesforce (sandbox ou production) usando login web do Salesforce CLI.",
        options: { namespace: "salesforce", codemode: true },
        input: {
          type: "object",
          properties: {
            environment: {
              type: "string",
              enum: ["sandbox", "production"],
              description: "Tipo de org para definir URL de login padrão.",
            },
            alias: {
              type: "string",
              description: "Alias para a org após autenticação.",
            },
            setDefault: {
              type: "boolean",
              description: "Define a org como padrão após login.",
              default: true,
            },
            browser: {
              type: "string",
              enum: ["chrome", "edge", "firefox"],
              description: "Browser para abrir o fluxo de login.",
            },
            instanceUrl: {
              type: "string",
              description:
                "URL específica da instância (opcional). Se omitida, usa test/login.salesforce.com conforme environment.",
            },
            clientId: {
              type: "string",
              description: "Consumer Key de um Connected App customizado (opcional).",
            },
          },
          required: ["environment"],
          additionalProperties: false,
        },
        execute: async (rawInput) => {
          const input = rawInput as ConnectOrgInput
          const environment = input.environment

          if (environment !== "sandbox" && environment !== "production") {
            throw new Error("'environment' deve ser 'sandbox' ou 'production'.")
          }

          const instanceUrl =
            normalizeString(input.instanceUrl) ?? (environment === "sandbox" ? SANDBOX_URL : PRODUCTION_URL)

          const args = ["org", "login", "web", "--instance-url", instanceUrl, "--json"]

          const alias = normalizeString(input.alias)
          if (alias) args.push("--alias", alias)

          const shouldSetDefault = input.setDefault !== false
          if (shouldSetDefault) args.push("--set-default")

          const browser = normalizeString(input.browser)
          if (browser) args.push("--browser", browser)

          const clientId = normalizeString(input.clientId)
          if (clientId) args.push("--client-id", clientId)

          const result = await runSfCli(sfBinary, args, { timeoutMs })
          const safeJson = sanitizeSecrets(result.json)

          if (result.timedOut) {
            throw new Error(
              [
                "Timeout ao aguardar login no Salesforce.",
                `Comando: ${result.command}`,
                "Dica: aumente timeoutMs nas options do plugin.",
              ].join("\n"),
            )
          }

          if (result.exitCode !== 0) {
            throw new Error(
              [
                "Falha ao conectar na org Salesforce.",
                `Comando: ${result.command}`,
                result.stderr ? `stderr:\n${shortText(result.stderr)}` : "",
                safeJson ? `json:\n${shortText(prettyJson(safeJson))}` : "",
              ]
                .filter(Boolean)
                .join("\n\n"),
            )
          }

          return {
            content: [
              "✅ Login Salesforce concluído.",
              `- Ambiente: ${environment}`,
              `- Instance URL: ${instanceUrl}`,
              alias ? `- Alias: ${alias}` : "",
              safeJson ? `\nResposta (sanitizada):\n${shortText(prettyJson(safeJson))}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          }
        },
      })

      editor.add({
        name: "run_apex_anonymous",
        description: "Executa Apex Anonymous em uma org Salesforce via Salesforce CLI.",
        options: { namespace: "salesforce", codemode: true },
        input: {
          type: "object",
          properties: {
            targetOrg: {
              type: "string",
              description: "Username ou alias da org alvo.",
            },
            apexCode: {
              type: "string",
              description: "Código Apex anônimo inline (opcional se apexFilePath for informado).",
            },
            apexFilePath: {
              type: "string",
              description: "Caminho de arquivo .apex (opcional se apexCode for informado).",
            },
            apiVersion: {
              type: "string",
              description: "API version para execução (opcional).",
            },
          },
          required: ["targetOrg"],
          additionalProperties: false,
        },
        execute: async (rawInput) => {
          const input = rawInput as RunApexAnonymousInput
          const targetOrg = normalizeString(input.targetOrg)

          if (!targetOrg) {
            throw new Error("'targetOrg' é obrigatório.")
          }

          const apexCode = normalizeString(input.apexCode)
          const apexFilePath = normalizeString(input.apexFilePath)

          if (!apexCode && !apexFilePath) {
            throw new Error("Informe 'apexCode' ou 'apexFilePath'.")
          }

          if (apexCode && apexFilePath) {
            throw new Error("Informe apenas um entre 'apexCode' e 'apexFilePath'.")
          }

          const args = ["apex", "run", "--target-org", targetOrg, "--json"]

          if (apexFilePath) {
            args.push("--file", apexFilePath)
          } else if (apexCode) {
            // Avoid shell interpolation. Passes the code as a single argument.
            args.push("--file", "-")
          }

          const apiVersion = normalizeString(input.apiVersion)
          if (apiVersion) args.push("--api-version", apiVersion)

          const result = await runSfCliWithInlineCode(sfBinary, args, apexCode, timeoutMs)
          const safeJson = sanitizeSecrets(result.json)

          if (result.timedOut) {
            throw new Error(
              [
                "Timeout ao executar Apex Anonymous.",
                `Comando: ${result.command}`,
                "Dica: aumente timeoutMs nas options do plugin.",
              ].join("\n"),
            )
          }

          if (result.exitCode !== 0) {
            throw new Error(
              [
                "Falha ao executar Apex Anonymous.",
                `Comando: ${result.command}`,
                result.stderr ? `stderr:\n${shortText(result.stderr)}` : "",
                safeJson ? `json:\n${shortText(prettyJson(safeJson))}` : "",
              ]
                .filter(Boolean)
                .join("\n\n"),
            )
          }

          return {
            content: [
              "✅ Apex Anonymous executado com sucesso.",
              `- Org alvo: ${targetOrg}`,
              apexFilePath ? `- Arquivo: ${apexFilePath}` : "- Fonte: inline (apexCode)",
              safeJson ? `\nResposta (sanitizada):\n${shortText(prettyJson(safeJson))}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          }
        },
      })
    })
  },
})

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readStringOption(options: unknown, key: string): string | undefined {
  if (!options || typeof options !== "object") return undefined
  return normalizeString((options as Record<string, unknown>)[key])
}

function readNumberOption(options: unknown, key: string): number | undefined {
  if (!options || typeof options !== "object") return undefined
  const value = (options as Record<string, unknown>)[key]
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined
  return value
}

async function runSfCliWithInlineCode(
  sfBinary: string,
  args: string[],
  apexCode: string | undefined,
  timeoutMs: number,
) {
  // `sf apex run` doesn't support a dedicated inline flag; for inline execution
  // we write a temporary file in-memory-compatible style through stdin redirection
  // fallback by creating a temp file manually when code is provided.
  if (!apexCode) {
    return runSfCli(sfBinary, args, { timeoutMs })
  }

  const { mkdtemp, writeFile, rm } = await import("node:fs/promises")
  const { join } = await import("node:path")
  const { tmpdir } = await import("node:os")

  const tempDir = await mkdtemp(join(tmpdir(), "opencode-sf-apex-"))
  const tempFile = join(tempDir, "anonymous.apex")

  try {
    await writeFile(tempFile, apexCode, "utf8")
    const fileArgs = args.map((arg, index) => {
      if (arg === "-" && index > 0 && args[index - 1] === "--file") {
        return tempFile
      }
      return arg
    })
    return await runSfCli(sfBinary, fileArgs, { timeoutMs })
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
