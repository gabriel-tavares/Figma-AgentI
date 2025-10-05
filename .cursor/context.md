# 🧠 Contexto do Sistema - Figma-AgentI (Heurística UX)

> **Arquivo de contexto para o Cursor AI** - Informações essenciais do sistema para conversas futuras

## 🎯 Visão Geral do Sistema

O **Figma-AgentI** é um sistema completo de análise heurística de UX para Figma que utiliza múltiplas IAs para avaliar interfaces digitais.

### Arquitetura Principal
- **Backend**: Node.js/Express em `/back/` - API REST para análise multi-IA
- **Frontend**: TypeScript em `/front/` - Plugin Figma com interface visual
- **Deploy**: Docker + EasyPanel - Deploy automático configurado

## 🏗️ Estrutura de Arquivos Críticos

```
Heuristica/
├── back/
│   ├── index.js              # Servidor principal Express
│   ├── package.json          # Dependências backend
│   ├── Dockerfile           # Container otimizado (Node 18-alpine)
│   ├── docker-compose.yml   # Produção
│   ├── docker-compose.dev.yml # Desenvolvimento
│   ├── prompts/
│   │   ├── heuristica.txt   # Prompt principal Nielsen
│   │   └── vision.txt       # Prompt Vision API
│   ├── debug_responses/     # Respostas das IAs salvas
│   ├── debug_layouts/       # JSONs FigmaSpec processados
│   ├── debug_vision/        # Resultados Vision API
│   └── heuristica.ndjson    # Log estruturado de análises
├── front/
│   ├── code.ts              # Lógica principal do plugin
│   ├── ui.html              # Interface do usuário
│   ├── manifest.json        # Configuração plugin Figma
│   └── package.json         # Dependências frontend
├── easypanel.yml            # Configuração deploy EasyPanel
└── docs/
    └── DOCUMENTACAO_TECNICA.md # Documentação completa
```

## 🚀 Deploy e Infraestrutura

### EasyPanel Configuration
- **Serviço**: `figma-agenti-backend`
- **Porta**: 3000
- **Health Check**: `/ping-openai` endpoint
- **Recursos**: 512M RAM, 0.5 CPU
- **Restart**: `unless-stopped`

### Docker Otimizado
- **Base**: Node.js 18-alpine
- **Usuário**: nodejs (não-root para segurança)
- **Multi-layer**: cache otimizado
- **Variáveis embarcadas**: APIs keys e configurações

### Variáveis de Ambiente Críticas
```env
# APIs
OPENAI_API_KEY=sk-proj-...
OPENROUTER_API_KEY=sk-or-v1-...
VECTOR_STORE_ID=vs_6893c02afcb081918c69241839c8ca54

# Sistema
USE_RESPONSES=true             # Ativa análise heurística
USE_RAG=true                   # Ativa busca em documentos
LOG_LEVEL=info                 # Nível de logs (error|warn|info|debug)
DEBUG_FILES_RETENTION_DAYS=7   # Dias para manter arquivos debug

# Modelos IA
MODELO_VISION=gpt-4o-mini      # TIER 2: 2.5M tokens/dia
MODELO_TEXTO=gpt-5-mini        # TIER 1: 250k tokens/dia
MAX_TOKENS_VISION=4096         # Tokens máx Vision
MAX_TOKENS_TEXTO=50000         # Tokens máx análise

# Configurações
CORS_ORIGIN=https://www.figma.com
NODE_ENV=production
PORT=3000
```

## 🧠 Sistema de Análise

### 3 Modos de Operação
1. **Heurística Completa** - 10 heurísticas de Nielsen
2. **Análise Rápida** - Problemas críticos apenas
3. **Benchmark Multi-IA** - Comparação de modelos

### Fluxo de Análise
```
Seleção Frames → Processamento Híbrido → Análise IA → Cards Visuais
     ↓                    ↓                ↓           ↓
1-10 frames      FigmaSpec + Vision    Multi-modelos  Severidade
```

### Processamento Híbrido
- **Frames Reais**: FigmaSpec (dados estruturados nativos do Figma)
- **Imagens/Screenshots**: Vision API (conversão visual para JSON)

### Sistema de Severidade
- 🔴 **Alto**: Problemas críticos (impedem uso)
- 🟡 **Médio**: Problemas de usabilidade (causam confusão)
- 🟢 **Baixo**: Melhorias de polimento
- 🔵 **Positivo**: Pontos fortes identificados

## 🤖 Modelos de IA Suportados

### OpenAI
- GPT-4o, GPT-4o-mini
- O3, O3-mini
- GPT-5, GPT-5-mini

### OpenRouter
- Claude 3.5 Sonnet
- Gemini 2.0 Flash
- Llama 3.3 70B
- Qwen 2.5 72B
- +20 outros modelos

## 📊 Limites e Regras

### Limites Técnicos
- **Máximo**: 10 frames por análise
- **Saída**: 8 achados por tela
- **Timeout**: 4 minutos por análise
- **Tipos válidos**: FRAME, COMPONENT, INSTANCE, SECTION

### Regras de Funcionamento
- Priorização: frames reais > imagens
- Fallback automático para Vision API
- Deduplicação de achados similares
- Cards posicionados à direita dos frames

## 🔍 Sistema de Debug

### Logs Automáticos
- `heuristica.ndjson` - Log estruturado (NDJSON format)
- `debug_responses/` - Respostas completas das IAs
- `debug_layouts/` - JSONs de layout processados
- `debug_vision/` - Resultados da Vision API

### Métricas Coletadas
- Tempo de processamento por etapa
- Tokens utilizados por modelo
- Score UX (0-100 pontos)
- Latência e custos

## 🎯 Contexto de Conversas Anteriores

### Deploy Automático e Infraestrutura
- **EasyPanel configurado** com deploy manual otimizado
- **Docker otimizado** com multi-stage build e cache de layers
- **Health checks** corrigidos (não gastam mais API da OpenAI)
- **Usuário não-root** mantido para segurança
- **Permissões resolvidas** com fallback inteligente `/tmp`

### Sistema de Logs e Monitoramento
- **Sistema de logging padronizado** com níveis (error, warn, info, debug)
- **LOG_LEVEL configurável** via variável de ambiente
- **Remoção de logs verbosos** que poluíam o console
- **Logs estruturados** para melhor debugging
- **Limpeza automática** de arquivos temporários (7 dias configurável)

### Otimizações de Performance
- **Limpeza automática** executada na inicialização e a cada 6 horas
- **Fallback inteligente** para salvamento de arquivos (tenta `/tmp` depois `/app/temp`)
- **Healthcheck otimizado** usando `wget` em vez de chamadas da API
- **Remoção de código legado** (Assistants API removida completamente)

### Correções de Configuração
- **Variáveis de ambiente corrigidas**: `MAX_TOKENS_*` em vez de `MAXTOK_*`
- **RAG ativado corretamente** com `USE_RAG=true` + `VECTOR_STORE_ID`
- **Remoção de ASSISTANT_ID** e todo código relacionado aos Assistants
- **Configurações embarcadas** no Dockerfile para produção

### Melhorias de Segurança
- **Execução como usuário não-root** mantida (nodejs:nodejs)
- **Permissões mínimas necessárias** em vez de 777 global
- **Fallback seguro** quando não consegue escrever arquivos
- **Variáveis sensíveis** protegidas no Docker

### Sistema de Arquivo e Persistência
- **Múltiplos diretórios temporários** com fallback automático
- **Teste de escrita** antes de usar diretório
- **Limpeza por idade** de arquivos de debug (configurável)
- **Logs informativos** sobre fallbacks e erros

### Status Atual do Sistema
- **✅ Sistema 100% funcional** com todas as correções aplicadas
- **✅ RAG ativado** e funcionando (`vs_6893c02afcb081918c69241839c8ca54`)
- **✅ Permissões resolvidas** - sem mais erros EACCES
- **✅ Variáveis de ambiente** lidas corretamente do EasyPanel
- **✅ Performance otimizada** - análises completas em ~90s
- **✅ Tokens configurados** - 50,000 tokens máx para análise
- **✅ Segurança mantida** - usuário não-root preservado

## 📝 Notas Importantes

- Sistema proprietário com licença restritiva
- Dependente de conexão internet (APIs externas)
- Interface estática apenas (não analisa interações)
- Necessita validação humana dos resultados
- Rate limiting das APIs deve ser considerado

---

**Última atualização**: Outubro 2025  
**Versão do sistema**: 1.0.0  
**Status**: ✅ Totalmente funcional e otimizado

