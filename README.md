# 🎨 Figma-AgentI

> Plugin Figma para análise heurística de interfaces usando IA

[![License](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Figma](https://img.shields.io/badge/Figma-Plugin-purple.svg)](https://www.figma.com/)

## 📋 Sobre o Projeto

O **Figma-AgentI** é um sistema completo para análise heurística de interfaces de usuário diretamente no Figma. Utiliza múltiplos modelos de IA para fornecer análises detalhadas baseadas nas heurísticas de Nielsen e vieses cognitivos.

### ✨ Principais Funcionalidades

- 🔍 **Análise Heurística Automática** - Baseada nas 10 heurísticas de Nielsen
- 🧠 **Múltiplos Modelos de IA** - OpenAI GPT, O3, Claude, Gemini e mais
- 📊 **Benchmark Multi-IA** - Compare performance de diferentes modelos
- 🎯 **Análise de Imagens** - Vision API para análise visual detalhada
- 📱 **FigmaSpec Integration** - Extração automática de dados estruturados
- 🎨 **Cards Visuais** - Resultados apresentados como elementos no Figma
- 📈 **Métricas Detalhadas** - Severidade, impacto e recomendações

## 🏗️ Arquitetura

```
Figma-AgentI/
├── back/                    # Backend Node.js
│   ├── index.js            # Servidor principal
│   ├── prompts/            # Prompts para IA
│   ├── scripts/            # Scripts utilitários
│   └── temp/               # Arquivos temporários
├── front/                   # Frontend Plugin Figma
│   ├── code.ts             # Lógica principal
│   ├── ui.html             # Interface do usuário
│   └── manifest.json       # Configuração do plugin
└── docs/                    # Documentação
    └── DOCUMENTACAO_TECNICA.md
```

## 🚀 Instalação e Configuração

### Pré-requisitos

- Node.js 18+
- Conta OpenAI com API Key
- Conta Figma Developer
- VPS com EasyPanel (para produção)

### 1. Clone o Repositório

```bash
git clone https://github.com/seu-usuario/Figma-AgentI.git
cd Figma-AgentI
```

### 2. Configurar Backend

```bash
cd back
npm install
cp .env.example .env
```

Edite o arquivo `.env` com suas configurações:

```env
OPENAI_API_KEY=your_openai_api_key
OPENROUTER_API_KEY=your_openrouter_api_key
VECTOR_STORE_ID=your_vector_store_id
ASSISTANT_ID=your_assistant_id
PORT=3000
NODE_ENV=development
```

### 3. Configurar Frontend

```bash
cd front
npm install
npm run build
```

### 4. Instalar Plugin no Figma

1. Abra o Figma Desktop
2. Vá em `Plugins` > `Development` > `Import plugin from manifest...`
3. Selecione o arquivo `front/manifest.json`

## 🎯 Como Usar

### Análise Básica

1. **Selecione um frame** no Figma
2. **Abra o plugin** Figma-AgentI
3. **Escolha o método** de análise:
   - Heurística Completa
   - Análise Rápida
   - Benchmark Multi-IA
4. **Adicione contexto** (opcional)
5. **Clique em "Analisar"**

### Tipos de Análise

#### 🔍 Heurística Completa
- Análise baseada nas 10 heurísticas de Nielsen
- Detecção de vieses cognitivos
- Recomendações específicas
- Severidade e impacto

#### ⚡ Análise Rápida
- Análise simplificada
- Foco em problemas críticos
- Resposta mais rápida

#### 🏆 Benchmark Multi-IA
- Compara múltiplos modelos
- Métricas de performance
- Análise de qualidade
- Relatório comparativo

## 🔧 Configuração Avançada

### Modelos de IA Disponíveis

#### OpenAI
- GPT-4o
- GPT-4o-mini
- O3-mini
- O3

#### OpenRouter
- Claude 3.5 Sonnet
- Gemini Pro
- Llama 3.1
- E mais 20+ modelos

### Variáveis de Ambiente

```env
# APIs
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...

# Configurações
VECTOR_STORE_ID=vs_...
ASSISTANT_ID=asst_...
TEMP_VISION=0.1
TEMP_TEXTO=0.2
MAX_TOKENS_VISION=4096
MAX_TOKENS_TEXTO=8192

# Servidor
PORT=3000
NODE_ENV=production
CLEANUP_TEMP_FILES=true
```

## 🐳 Deploy com Docker

### Desenvolvimento Local

```bash
cd back
docker-compose -f docker-compose.dev.yml up
```

### Produção

```bash
cd back
docker-compose up -d
```

## 📊 Métricas e Logs

### Logs de Análise
- Arquivo: `heuristica.ndjson`
- Formato: JSON Lines
- Inclui: timestamps, modelos, tokens, tempo

### Debug
- `debug_responses/` - Respostas da IA
- `debug_layouts/` - Layouts processados
- `debug_vision/` - Análises de imagem

## 🧪 Testes

```bash
# Teste básico
node test-basic.js

# Teste de modelos
node test-models.js

# Teste de imagens
node test-images.js

# Teste do servidor
node test-server.js
```

## 📈 Performance

### Benchmarks Típicos
- **Análise Rápida**: 15-30 segundos
- **Heurística Completa**: 45-90 segundos
- **Benchmark Multi-IA**: 2-5 minutos

### Otimizações
- Cache de respostas
- Processamento paralelo
- Limpeza automática de arquivos
- Retry automático em falhas

## 🔒 Segurança

- Chaves de API em variáveis de ambiente
- CORS configurado para Figma
- Validação de entrada
- Sanitização de dados
- Logs sem informações sensíveis

## 🤝 Contribuição

Este é um projeto proprietário. Para contribuições:

1. Entre em contato com o mantenedor
2. Descreva a funcionalidade proposta
3. Aguarde aprovação antes de implementar

## 📞 Suporte

- **Issues**: Use o sistema de issues do GitHub
- **Documentação**: Consulte `docs/DOCUMENTACAO_TECNICA.md`
- **Logs**: Verifique `heuristica.ndjson` para debug

## 📄 Licença

Este projeto é proprietário. Todos os direitos reservados.

---

**Desenvolvido com ❤️ para a comunidade UX/UI**
