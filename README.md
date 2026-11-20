# opencode-plugin-salesforce-cli

Plugin para **OpenCode / Orca** que integra com o **Salesforce CLI (`sf`)**.

## Escopo inicial

Este repositório já vem com as duas funções que você pediu:

1. **Interface para conectar em org Salesforce** (sandbox ou produção)
2. **Interface para executar Apex Anonymous**

As interfaces são expostas como tools do plugin:

- `salesforce_connect_org`
- `salesforce_run_apex_anonymous`

---

## Pré-requisitos

- Node.js 20+
- Salesforce CLI instalado e disponível no PATH (`sf --version`)
- OpenCode/Orca carregando plugins

---

## Instalação (desenvolvimento local)

```bash
npm install
npm run build
```

No seu `opencode.jsonc`, adicione o plugin:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "./opencode-salesforce-cli-plugin",
      "options": {
        "sfBinary": "sf",
        "timeoutMs": 600000
      }
    }
  ]
}
```

> Você também pode publicar no npm e trocar `package` para o nome do pacote.

---

## Uso das tools

### 1) Conectar em sandbox

```json
{
  "environment": "sandbox",
  "alias": "meu-sbx",
  "setDefault": true
}
```

### 2) Conectar em produção

```json
{
  "environment": "production",
  "alias": "meu-prod",
  "setDefault": false
}
```

### 3) Executar Apex Anonymous inline

```json
{
  "targetOrg": "meu-sbx",
  "apexCode": "System.debug('Hello from plugin');"
}
```

### 4) Executar Apex Anonymous por arquivo

```json
{
  "targetOrg": "meu-sbx",
  "apexFilePath": "scripts/apex/debug.apex"
}
```

---

## Segurança

- O plugin sanitiza chaves sensíveis (tokens/segredos) antes de retornar respostas.
- Ainda assim, trate logs com cuidado, especialmente em ambientes corporativos.

---

## Publicar no GitHub (repositório público)

Se você ainda não autenticou o `gh`:

```bash
gh auth login
```

Depois, dentro da pasta do plugin:

```bash
git init
git add .
git commit -m "chore: initial scaffold for Salesforce CLI plugin"
gh repo create opencode-plugin-salesforce-cli --public --source=. --remote=origin --push
```

---

## Roadmap sugerido (próximos passos)

- Seleção de org por lista (`sf org list`) sem expor dados sensíveis
- Execução de testes Apex (`sf apex run test`)
- Deploy/validate de metadata
- Logs em formato estruturado (com correlação por request)
