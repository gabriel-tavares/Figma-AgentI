# 🚀 Heuristica UX - Benchmark Multi-IA

Sistema avançado para testar e comparar múltiplas IAs usando OpenRouter, focado em análise de UX/UI.

## 🎯 Funcionalidades

- **Teste simultâneo** de múltiplas IAs
- **Modelos gratuitos** e de baixo custo
- **Métricas específicas** para análise UX
- **Ranking automático** por qualidade
- **Relatórios detalhados** de performance

## 📋 Modelos Disponíveis

### 🆓 Gratuitos
- **Gemini 2.0 Flash** (Google) - Mais rápido
- **Llama 3.3 70B** (Meta) - Open source avançado
- **Phi 3.5 Mini** (Microsoft) - Compacto e eficiente
- **Qwen 2.5 72B** (Alibaba) - Alta qualidade

### 💰 Baixo Custo (< $1/1M tokens)
- **Claude 3 Haiku** (Anthropic) - $0.25/1M tokens
- **GPT-4o Mini** (OpenAI) - $0.15/1M tokens
- **Gemini 1.5 Flash** (Google) - $0.075/1M tokens

### 💎 Premium
- **Claude 3.5 Sonnet** (Anthropic) - $3/1M tokens
- **GPT-4o** (OpenAI) - $5/1M tokens
- **Gemini 1.5 Pro** (Google) - $1.25/1M tokens

## 🧪 Tipos de Teste

1. **layout-analysis** - Análise de layout e hierarquia visual
2. **color-contrast** - Análise de contraste e acessibilidade
3. **navigation-flow** - Análise de fluxo de navegação

## 🚀 Como Usar

### 1. Configuração Inicial

```bash
# Configurar OpenRouter
node setup-openrouter.js init

# Editar arquivo .env com sua chave
OPENROUTER_API_KEY=sk-or-your-key-here
```

### 2. Executar Benchmarks

```bash
# Testar modelos gratuitos
node benchmark-multi-ai.js free

# Testar modelos de baixo custo
node benchmark-multi-ai.js low-cost

# Testar modelos premium
node benchmark-multi-ai.js premium

# Teste específico de contraste
node benchmark-multi-ai.js free color-contrast

# Teste específico de navegação
node benchmark-multi-ai.js low-cost navigation-flow
```

### 3. Script Simples (OpenRouter básico)

```bash
# Teste básico
node test-openrouter.js free

# Listar modelos
node test-openrouter.js list
```

## 📊 Métricas de Avaliação

### Score UX (0-100 pontos)
- **Estrutura** (20 pts) - Resposta organizada e numerada
- **Conteúdo UX** (40 pts) - Termos técnicos e soluções específicas
- **Qualidade** (25 pts) - Exemplos práticos e conselhos acionáveis
- **Tamanho** (15 pts) - Resposta adequada (100-500 palavras)

### Métricas Técnicas
- **Latência** - Tempo de resposta em ms
- **Tokens usados** - Consumo de tokens
- **Custo** - Preço por 1M tokens
- **Disponibilidade** - Taxa de sucesso

## 📈 Exemplo de Resultado

```
🏆 RANKING - Análise de Layout

🥇 Claude 3.5 Sonnet (Anthropic)
   💰 Custo: $3/1M tokens
   ⚡ Latência: 2,340ms
   📊 Score: 92/100 (A+)
   📝 Palavras: 245
   🔧 Termos UX: 8
   🛠️ Termos técnicos: 4
   📋 Estruturado: ✅
   💡 Soluções: ✅

🥈 Gemini 2.0 Flash (Google)
   💰 Custo: Free
   ⚡ Latência: 1,890ms
   📊 Score: 87/100 (A)
   📝 Palavras: 198
   🔧 Termos UX: 6
   🛠️ Termos técnicos: 3
   📋 Estruturado: ✅
   💡 Soluções: ✅
```

## 💾 Arquivos de Resultado

Os resultados são salvos em `debug_responses/` com formato:
- `benchmark-advanced-{categoria}-{teste}-{timestamp}.json`
- Inclui respostas completas, métricas e ranking

## 🔧 Configuração Avançada

### Variáveis de Ambiente (.env)
```env
# OpenRouter
OPENROUTER_API_KEY=sk-or-your-key-here

# OpenAI (para comparação)
OPENAI_API_KEY=sk-your-key-here

# Configurações padrão
MODELO_TEXTO=gpt-4o-mini
TEMP_TEXTO=0.1
MAXTOK_TEXTO=8000
```

### Personalizar Testes
Edite `UX_TEST_PROMPTS` em `benchmark-multi-ai.js` para adicionar novos tipos de teste.

## 🎯 Casos de Uso

1. **Comparar modelos** antes de escolher um para produção
2. **Testar qualidade** de diferentes IAs para análise UX
3. **Otimizar custos** encontrando o melhor custo-benefício
4. **Benchmark contínuo** para monitorar performance

## 📚 Recursos Adicionais

- [OpenRouter Documentation](https://openrouter.ai/docs)
- [Modelos Disponíveis](https://openrouter.ai/models)
- [Preços Atualizados](https://openrouter.ai/pricing)

## 🚨 Limitações

- Requer chave API do OpenRouter
- Rate limiting pode afetar testes simultâneos
- Custos podem variar conforme uso
- Modelos gratuitos podem ter limitações de uso

## 🤝 Contribuição

Para adicionar novos modelos ou tipos de teste, edite os objetos `BENCHMARK_MODELS` e `UX_TEST_PROMPTS` nos arquivos correspondentes.


