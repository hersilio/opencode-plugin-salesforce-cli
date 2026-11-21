import { Plugin } from "@opencode/plugin/tui"
import { prettyJson, runApexAnonymous, runSfCli, sanitizeSecrets, shortText } from "./sf"

const SANDBOX_URL = "https://test.salesforce.com"
const PRODUCTION_URL = "https://login.salesforce.com"

export default Plugin.define({
  id: "salesforce-cli",
  setup(context) {
    const sfBinary = readStringOption(context.options, "sfBinary") ?? "sf"
    const timeoutMs = readNumberOption(context.options, "timeoutMs") ?? 10 * 60 * 1000

    const runConnectFlow = async () => {
      const environment = await context.ui.dialog.select({
        title: "Conectar org Salesforce",
        current: "sandbox",
        options: [
          {
            title: "Sandbox",
            value: "sandbox",
            description: "Usa https://test.salesforce.com",
          },
          {
            title: "Produção",
            value: "production",
            description: "Usa https://login.salesforce.com",
          },
        ],
      })

      if (!environment) return

      const alias = normalizeString(
        await context.ui.dialog.prompt({
          title: "Alias da org (opcional)",
          placeholder: "ex: meu-sbx",
        }),
      )

      const setDefaultChoice = await context.ui.dialog.select({
        title: "Definir como org padrão?",
        current: "yes",
        options: [
          { title: "Sim", value: "yes" },
          { title: "Não", value: "no" },
        ],
      })
      if (!setDefaultChoice) return
      const setDefault = setDefaultChoice === "yes"

      const browser = await context.ui.dialog.select({
        title: "Browser (opcional)",
        current: "default",
        options: [
          { title: "Padrão do sistema", value: "default" },
          { title: "Chrome", value: "chrome" },
          { title: "Edge", value: "edge" },
          { title: "Firefox", value: "firefox" },
        ],
      })

      if (!browser) return

      const customInstance = await context.ui.dialog.confirm({
        title: "Usar Instance URL customizada?",
        message: "Se não, usa a URL padrão do ambiente selecionado.",
        label: { confirm: "Sim", cancel: "Não" },
      })

      const instanceUrl = customInstance
        ? normalizeString(
            await context.ui.dialog.prompt({
              title: "Instance URL",
              placeholder:
                environment === "sandbox"
                  ? "https://seu-dominio--sbx.sandbox.my.salesforce.com"
                  : "https://seu-dominio.my.salesforce.com",
            }),
          )
        : undefined

      const loginUrl = instanceUrl ?? (environment === "sandbox" ? SANDBOX_URL : PRODUCTION_URL)
      const args = ["org", "login", "web", "--instance-url", loginUrl, "--json"]
      if (alias) args.push("--alias", alias)
      if (setDefault) args.push("--set-default")
      if (browser !== "default") args.push("--browser", browser)

      context.ui.toast.show({ message: "Abrindo login do Salesforce...", variant: "info" })
      const result = await runSfCli(sfBinary, args, { timeoutMs })
      const safeJson = sanitizeSecrets(result.json)

      if (result.timedOut) {
        await context.ui.dialog.alert({
          title: "Timeout",
          message: "Tempo excedido aguardando login. Ajuste timeoutMs nas options do plugin.",
        })
        return
      }

      if (result.exitCode !== 0) {
        await context.ui.dialog.alert({
          title: "Falha ao conectar",
          message: [
            `Comando: ${result.command}`,
            result.stderr ? `stderr:\n${shortText(result.stderr, 2000)}` : "",
            safeJson ? `json:\n${shortText(prettyJson(safeJson), 2000)}` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        })
        context.ui.toast.show({ message: "Erro na conexão Salesforce", variant: "error" })
        return
      }

      await context.ui.dialog.alert({
        title: "Conectado com sucesso",
        message: [
          `Ambiente: ${environment}`,
          `Instance URL: ${loginUrl}`,
          alias ? `Alias: ${alias}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      })
      context.ui.toast.show({ message: "Login Salesforce concluído", variant: "success" })
    }

    const runApexFlow = async () => {
      const targetOrg = normalizeString(
        await context.ui.dialog.prompt({
          title: "Org alvo",
          placeholder: "username ou alias (ex: meu-sbx)",
        }),
      )

      if (!targetOrg) return

      const sourceType = await context.ui.dialog.select({
        title: "Fonte do Apex",
        current: "inline",
        options: [
          {
            title: "Código inline",
            value: "inline",
            description: "Digite o Apex no próximo passo",
          },
          {
            title: "Arquivo .apex",
            value: "file",
            description: "Executa um arquivo local",
          },
        ],
      })

      if (!sourceType) return

      const apexCode =
        sourceType === "inline"
          ? normalizeString(
              await context.ui.dialog.prompt({
                title: "Código Apex",
                placeholder: "System.debug('plugin ok');",
              }),
            )
          : undefined

      const apexFilePath =
        sourceType === "file"
          ? normalizeString(
              await context.ui.dialog.prompt({
                title: "Caminho do arquivo .apex",
                placeholder: "scripts/apex/debug.apex",
              }),
            )
          : undefined

      if (!apexCode && !apexFilePath) return

      const apiVersion = normalizeString(
        await context.ui.dialog.prompt({
          title: "API Version (opcional)",
          placeholder: "ex: 68.0",
        }),
      )

      context.ui.toast.show({ message: "Executando Apex Anonymous...", variant: "info" })
      const result = await runApexAnonymous(
        sfBinary,
        {
          targetOrg,
          apexCode,
          apexFilePath,
          apiVersion,
        },
        { timeoutMs },
      )

      const safeJson = sanitizeSecrets(result.json)

      if (result.timedOut) {
        await context.ui.dialog.alert({
          title: "Timeout",
          message: "Tempo excedido executando Apex Anonymous. Ajuste timeoutMs nas options do plugin.",
        })
        return
      }

      if (result.exitCode !== 0) {
        await context.ui.dialog.alert({
          title: "Falha no Apex Anonymous",
          message: [
            `Comando: ${result.command}`,
            result.stderr ? `stderr:\n${shortText(result.stderr, 2000)}` : "",
            safeJson ? `json:\n${shortText(prettyJson(safeJson), 2000)}` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        })
        context.ui.toast.show({ message: "Erro ao executar Apex", variant: "error" })
        return
      }

      await context.ui.dialog.alert({
        title: "Apex executado",
        message: [
          `Org: ${targetOrg}`,
          apexFilePath ? `Arquivo: ${apexFilePath}` : "Fonte: código inline",
          safeJson ? `\nResultado:\n${shortText(prettyJson(safeJson), 2500)}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      })

      context.ui.toast.show({ message: "Apex Anonymous executado com sucesso", variant: "success" })
    }

    const openMainMenu = async () => {
      const action = await context.ui.dialog.select({
        title: "Salesforce CLI",
        current: "connect",
        options: [
          {
            title: "Conectar org",
            value: "connect",
            description: "Login em sandbox ou produção",
          },
          {
            title: "Executar Apex Anonymous",
            value: "apex",
            description: "Roda script Apex na org selecionada",
          },
        ],
      })

      if (!action) return
      if (action === "connect") return runConnectFlow()
      if (action === "apex") return runApexFlow()
    }

    context.keymap.layer(() => ({
      mode: "global",
      priority: 15,
      commands: [
        {
          id: "salesforce.ui.menu",
          title: "Salesforce: abrir interface",
          group: "Salesforce",
          palette: true,
          slash: {
            name: "sf",
            aliases: ["salesforce"],
          },
          run: openMainMenu,
        },
        {
          id: "salesforce.ui.connect",
          title: "Salesforce: conectar org",
          group: "Salesforce",
          palette: true,
          slash: {
            name: "sf-connect",
            aliases: ["sf-login"],
          },
          run: runConnectFlow,
        },
        {
          id: "salesforce.ui.apex",
          title: "Salesforce: executar Apex anonymous",
          group: "Salesforce",
          palette: true,
          slash: {
            name: "sf-apex",
            aliases: ["apex-anon"],
          },
          run: runApexFlow,
        },
      ],
    }))

    context.ui.toast.show({
      title: "Salesforce plugin",
      message: "Interface pronta. Use /sf, /sf-connect ou /sf-apex.",
      variant: "success",
      duration: 4000,
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
