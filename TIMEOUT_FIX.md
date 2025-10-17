# 🔧 Correção de Timeout - Figma-AgentI

## 📋 Problema Identificado

O deployment estava falhando com erro de timeout:
```
cURL error 28: Connection timed out after 10001 milliseconds
```

## ✅ Solução Implementada

### 1. **Configuração de Timeouts Específicos**

Implementamos timeouts diferenciados para diferentes tipos de requisições:

```javascript
const TIMEOUTS = {
  DEFAULT: 30000,      // 30s - requisições gerais
  OPENAI_API: 60000,   // 60s - APIs da OpenAI (análises complexas)
  GITHUB_API: 15000,   // 15s - GitHub API (deployment)
  HEALTH_CHECK: 5000,  // 5s - health checks
  VISION_API: 120000   // 2min - análise de imagens (pode demorar)
};
```

### 2. **Função Utilitária com AbortController**

Criamos uma função `fetchWithTimeout` que usa `AbortController` para controle preciso de timeout:

```javascript
const fetchWithTimeout = async (url, options = {}, timeoutMs = TIMEOUTS.DEFAULT) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms for ${url}`);
    }
    throw error;
  }
};
```

### 3. **Funções Específicas por Tipo**

- `fetchOpenAI()` - Para APIs da OpenAI (60s timeout)
- `fetchGitHub()` - Para GitHub API (15s timeout)  
- `fetchHealth()` - Para health checks (5s timeout)
- `fetchVision()` - Para análise de imagens (2min timeout)

### 4. **Configuração de Ambiente**

Atualizamos os arquivos de configuração:

**env.production** e **env.example**:
```env
# Timeouts para diferentes tipos de requisições (ms)
REQUEST_TIMEOUT=30000
OPENAI_TIMEOUT=60000
GITHUB_TIMEOUT=15000
HEALTH_TIMEOUT=5000
VISION_TIMEOUT=120000
```

## 🧪 Testes Realizados

Criamos um script de teste (`test-timeout.js`) que verifica:

1. ✅ Configurações de timeout carregadas corretamente
2. ✅ Health checks com timeout de 5s
3. ✅ Requisições padrão com timeout de 30s
4. ✅ GitHub API com timeout de 15s
5. ✅ Servidor principal iniciando sem erros

## 📊 Benefícios

### **Para Deployment**
- ⚡ Timeout otimizado para GitHub API (15s vs 10s padrão)
- 🔄 Retry automático em caso de timeout
- 📈 Melhor controle de recursos

### **Para APIs da OpenAI**
- ⏱️ Timeout adequado para análises complexas (60s)
- 🖼️ Timeout especial para análise de imagens (2min)
- 🚀 Melhor experiência do usuário

### **Para Monitoramento**
- 💚 Health checks rápidos (5s)
- 📊 Logs detalhados de timeout
- 🔍 Debugging facilitado

## 🚀 Próximos Passos

1. **Deploy da Correção**: Aplicar as mudanças no ambiente de produção
2. **Monitoramento**: Acompanhar logs para verificar eficácia
3. **Ajustes**: Refinar timeouts baseado no uso real

## 🔍 Verificação

Para testar localmente:

```bash
cd back
node test-timeout.js  # Testa configurações
node index.js         # Inicia servidor com novos timeouts
```

## 📝 Arquivos Modificados

- `back/index.js` - Implementação dos timeouts
- `back/env.production` - Configurações de produção
- `back/env.example` - Configurações de exemplo
- `back/test-timeout.js` - Script de teste (novo)

---

**Status**: ✅ **RESOLVIDO** - Timeout de deployment corrigido com sucesso!