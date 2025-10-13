# 🚀 Deploy do Figma-AgentI no Coolify

## 📋 Pré-requisitos

- Coolify instalado e configurado
- Repositório Git do projeto
- Chaves de API configuradas

## 🔧 Configuração no Coolify

### 1. Criar Novo Projeto

1. Acesse o dashboard do Coolify
2. Clique em **"+ Add Resource"** no projeto existente ou crie um novo projeto
3. Selecione **"Docker Compose"** ou **"Dockerfile"**

### 2. Configurar Repositório

1. **Nome do projeto:** `figma-agenti-backend`
2. **Descrição:** `Backend para análise heurística de UX no Figma`
3. **Repositório Git:** URL do seu repositório
4. **Branch:** `main`

### 3. Configuração do Build

#### Opção A: Dockerfile (Recomendado)
- **Build Context:** `./back`
- **Dockerfile:** `Dockerfile`
- **Porta:** `3000`

#### Opção B: Docker Compose
- Use o arquivo `coolify.yml` criado

### 4. Variáveis de Ambiente

Configure as seguintes variáveis no Coolify:

#### 🔑 Chaves de API (OBRIGATÓRIAS)
```env
OPENAI_API_KEY=sk-proj-sua-chave-aqui
OPENROUTER_API_KEY=sk-or-v1-sua-chave-aqui
```

#### 🤖 Modelos de IA
```env
MODELO_VISION=gpt-4o-mini
MODELO_TEXTO=gpt-5-mini
MODELO_AGENTE_A=gpt-5-mini
MODELO_AGENTE_B=gpt-4o-mini
MODELO_AGENTE_C=o3-mini
```

#### ⚙️ Configurações Gerais
```env
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
CORS_ORIGIN=https://www.figma.com
CLEANUP_TEMP_FILES=true
DEBUG_FILES_RETENTION_DAYS=7
RETRY_ATTEMPTS=3
RETRY_DELAY=1000
REQUEST_TIMEOUT=30000
ANALYZE_IMAGES=true
REASONING_EFFORT=medium
MAXTOK_TEXTO=20000
```

#### 🎨 Configurações de Temperatura
```env
TEMP_VISION=0.1
TEMP_TEXTO=0.2
MAX_TOKENS_VISION=4096
MAX_TOKENS_TEXTO=50000
```

### 5. Configuração de Recursos

- **Memória:** 512M (limite) / 256M (reserva)
- **CPU:** 0.5 (limite) / 0.25 (reserva)
- **Health Check:** `/ping-openai` endpoint

### 6. Health Check

O Coolify verificará automaticamente se o serviço está funcionando através do endpoint:
- **URL:** `http://localhost:3000/ping-openai`
- **Intervalo:** 30 segundos
- **Timeout:** 10 segundos
- **Retries:** 3 tentativas

## 🚀 Deploy

1. Clique em **"Deploy"** no Coolify
2. Aguarde o build e deploy
3. Verifique os logs para confirmar que está funcionando
4. Teste o endpoint de health check

## 🔍 Verificação

### Endpoints de Teste
- **Health Check:** `http://seu-dominio:3000/ping-openai`
- **Status:** `http://seu-dominio:3000/status`

### Logs
Monitore os logs no Coolify para verificar:
- ✅ Servidor iniciado na porta 3000
- ✅ Conexão com APIs de IA estabelecida
- ✅ Health check funcionando

## 🛠️ Troubleshooting

### Problemas Comuns

1. **Erro de Build**
   - Verifique se o Dockerfile está correto
   - Confirme se as dependências estão instaladas

2. **Erro de Conexão**
   - Verifique as chaves de API
   - Confirme se o CORS está configurado

3. **Health Check Falhando**
   - Verifique se o endpoint `/ping-openai` está funcionando
   - Confirme se a porta 3000 está exposta

### Logs Importantes
```bash
# Verificar se o servidor iniciou
"Server running on port 3000"

# Verificar conexão com OpenAI
"OpenAI API connection successful"

# Verificar health check
"Health check endpoint responding"
```

## 📱 Configuração do Plugin Figma

Após o deploy, configure o plugin Figma para apontar para o novo servidor:

1. Abra o arquivo `front/code.ts`
2. Atualize a URL do servidor:
```typescript
const SERVER_URL = 'http://seu-dominio:3000';
```

## 🔒 Segurança

- ✅ Usuário não-root no container
- ✅ Variáveis de ambiente seguras
- ✅ CORS configurado para Figma
- ✅ Health checks implementados
- ✅ Logs estruturados

## 📊 Monitoramento

O Coolify fornece:
- 📈 Métricas de CPU e memória
- 📋 Logs em tempo real
- 🔄 Restart automático em caso de falha
- 🌐 Status de saúde do serviço

---

**🎉 Pronto! Seu Figma-AgentI está rodando no Coolify!**
