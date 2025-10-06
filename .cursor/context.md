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
│   ├── index.js              # Servidor principal Express + Orquestrador
│   ├── package.json          # Dependências backend
│   ├── Dockerfile           # Container otimizado (Node 18-alpine)
│   ├── docker-compose.yml   # Produção
│   ├── docker-compose.dev.yml # Desenvolvimento
│   ├── prompts/
│   │   ├── agente-a-json-analyst.txt    # Prompt JSON Analyst
│   │   ├── agente-b-vision-reviewer.txt # Prompt Vision Reviewer
│   │   ├── agente-c-reconciler.txt      # Prompt Reconciler
│   │   ├── heuristica.txt   # Prompt principal Nielsen (legado)
│   │   └── vision.txt       # Prompt Vision API (legado)
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

# Modelos IA (Orquestrador)
MODELO_AGENTE_A=gpt-5-mini     # JSON Analyst
MODELO_AGENTE_B=gpt-4o-mini    # Vision Reviewer  
MODELO_AGENTE_C=o3-mini        # Reconciler
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

### Arquitetura Orquestrada (3 Agentes Especializados)
1. **Agente A (JSON Analyst)** - Análise estrutural via FigmaSpec
2. **Agente B (Vision Reviewer)** - Análise visual via imagem
3. **Agente C (Reconciler)** - Fusão e validação final

### Fluxo de Orquestração
```
RAG Context → A+B Paralelo → Validação → C Reconciler → 8 Cards Finais
     ↓            ↓             ↓           ↓              ↓
  Documentos   JSON+Vision   Fallbacks   Deduplicação   Interface
```

### Modelos por Agente
- **Agente A**: `gpt-5-mini` (Responses API) ou `gpt-4o-mini` (Chat Completions)
- **Agente B**: `gpt-4o-mini` (Chat Completions + Vision)
- **Agente C**: `o3-mini` (Responses API) ou `gpt-4o-mini` (Chat Completions)

### Sistema RAG Compartilhado
- **Extração única**: RAG executado uma vez no início
- **Compartilhamento**: Contexto passado para todos os agentes
- **Eficiência**: Evita múltiplas chamadas desnecessárias
- **Vector Store**: `vs_6893c02afcb081918c69241839c8ca54`

### Sistema de Severidade
- 🔴 **Alto**: Problemas críticos (impedem uso)
- 🟡 **Médio**: Problemas de usabilidade (causam confusão)
- 🟢 **Baixo**: Melhorias de polimento
- 🔵 **Positivo**: Pontos fortes identificados

### Sistema de Constatação vs Hipótese
- **Constatação**: Evidência visual direta (sem tag no frontend)
- **Hipótese**: Requer verificação adicional (tag roxa no frontend)

### Detecção de Intenção Visual
- **Full-bleed intencional**: Não reporta como erro se centralizada e overflow ≤8%
- **Hero crop**: Preserva foco central
- **Edge-to-edge**: Impacto visual sem cobrir UI importante

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
- **Tempo detalhado**: RAG + Agente A + Agente B + Agente C individual
- **Tokens por agente**: entrada e saída separados
- **Total consolidado**: soma de todos os tokens consumidos
- **Performance**: latência e throughput por etapa
- **Qualidade**: achados gerados e severidade distribuída

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

### Melhorias Recentes (Outubro 2025)

#### Sistema Orquestrado Multi-Agente
- **Arquitetura**: 3 agentes especializados (JSON Analyst, Vision Reviewer, Reconciler)
- **Execução**: A+B paralelo, depois C para fusão final
- **RAG compartilhado**: Uma busca, contexto para todos os agentes
- **Modelos configuráveis**: Variáveis de ambiente por agente

#### Interface e UX
- **Tags inteligentes**: Hipótese = tag roxa, Constatação = sem tag
- **Detecção de intenção**: Full-bleed vs erro real (overflow ≤8%)
- **Classificação correta**: Visível = Constatação, Teste = Hipótese
- **Cards limpos**: Remoção de textos técnicos desnecessários

#### Performance e Monitoramento
- **Timing individual**: Cada agente com cronômetro próprio
- **Tracking de tokens**: Entrada e saída por agente + total
- **Logs detalhados**: Debug automático para troubleshooting
- **Execução paralela**: A+B simultâneo para otimização

#### Prompts Especializados
- **Exemplos práticos**: Casos específicos em cada prompt
- **Regras claras**: Quando usar Constatação vs Hipótese
- **Intenção visual**: Critérios para overflow intencional
- **Consultoria especializada**: Baseado em engenharia de contexto

### Status Atual do Sistema
- **✅ Sistema Orquestrado** com 3 agentes especializados funcionais
- **✅ RAG compartilhado** eficiente entre todos os agentes
- **✅ Detecção de intenção visual** - evita falsos positivos de overflow
- **✅ Sistema Constatação vs Hipótese** com tags visuais corretas
- **✅ Tracking completo** - tempo e tokens por agente individual
- **✅ Performance otimizada** - análises completas em ~140s
- **✅ Interface inteligente** - tags roxas apenas para hipóteses
- **✅ Prompts especializados** - cada agente com expertise específica
- **✅ Fallbacks robustos** - sistema continua funcionando mesmo com falhas
- **✅ Logs detalhados** - debug completo de timing e consumo

## 📝 Notas Importantes

- Sistema proprietário com licença restritiva
- Dependente de conexão internet (APIs externas)
- Interface estática apenas (não analisa interações)
- Necessita validação humana dos resultados
- Rate limiting das APIs deve ser considerado

---

**Última atualização**: Outubro 2025  
**Versão do sistema**: 2.0.0 - Orquestrador Multi-Agente  
**Status**: ✅ Sistema orquestrado totalmente funcional e otimizado

