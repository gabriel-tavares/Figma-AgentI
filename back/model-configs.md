# Configurações de Modelos para Testes

## Como usar:
1. Copie as configurações desejadas para seu arquivo `.env`
2. Reinicie o servidor: `node index.js`
3. Monitore os logs para comparar performance

## Configurações por Modelo

### GPT-4.1-mini (Balanceado)
```env
MODELO_TEXTO=gpt-4.1-mini
TEMP_TEXTO=0.2
MAXTOK_TEXTO=4000
```
- **Características**: Bom custo-benefício, resposta consistente
- **Temperatura**: 0.2-0.5 (mais criativo) ou 0.1-0.2 (mais determinístico)
- **Tokens**: 2000-4000 (resposta média)

### O3-mini (Determinístico)
```env
MODELO_TEXTO=o3-mini
TEMP_TEXTO=0.1
MAXTOK_TEXTO=4000
REASONING_EFFORT=medium
```
- **Características**: Mais determinístico, menos variabilidade
- **Temperatura**: Ignorada (usa reasoning.effort)
- **Effort**: "low" | "medium" | "high" (controla profundidade de análise)
- **Tokens**: 2000-4000 (resposta mais detalhada com effort medium/high)

### GPT-5 (Alta Qualidade)
```env
MODELO_TEXTO=gpt-5
TEMP_TEXTO=0.3
MAXTOK_TEXTO=6000
```
- **Características**: Maior qualidade, mais tokens
- **Temperatura**: 0.1-0.4 (balanceado)
- **Tokens**: 4000-6000 (resposta mais detalhada)

## Configurações de Vision

### Padrão (gpt-4.1-mini)
```env
MODELO_VISION=gpt-4.1-mini
TEMP_VISION=0.1
MAXTOK_VISION=20000
```

### Alternativa (gpt-4o-mini)
```env
MODELO_VISION=gpt-4o-mini
TEMP_VISION=0.1
MAXTOK_VISION=20000
```

### Vision com maior precisão (gpt-4o)
```env
MODELO_VISION=gpt-4o
TEMP_VISION=0.05
MAXTOK_VISION=30000
```

## Exemplo de .env completo

```env
# Chave da API
OPENAI_API_KEY=sk-your-key-here

# Modelos
MODELO_VISION=gpt-4.1-mini
MODELO_TEXTO=gpt-4.1-mini

# Temperaturas
TEMP_VISION=0.1
TEMP_TEXTO=0.2

# Tokens
MAXTOK_VISION=20000
MAXTOK_TEXTO=4000

# RAG
USE_RAG=true
VECTOR_STORE_ID=vs_6893c02afcb081918c69241839c8ca54

# API
USE_RESPONSES=true
ASSISTANT_ID=

# Servidor
PORT=3000
```

## Métricas para Comparar

Ao testar, monitore:
- **Tempo total**: `Timer Tela`
- **Tempo de inferência**: `inferência`
- **Tempo de RAG**: `RAG`
- **Qualidade da resposta**: Conteúdo gerado
- **Consistência**: Múltiplas execuções com mesma entrada
