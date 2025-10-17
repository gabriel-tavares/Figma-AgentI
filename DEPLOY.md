# 🚀 Figma-AgentI - Deploy e Configuração

## 📋 Status do Deploy

✅ **Backend:** Integração completa com Langfuse  
✅ **Frontend:** Configurado para produção  
✅ **GitHub:** Código atualizado  

## 🔧 Configuração de Ambiente

### Backend (Produção)
- **URL:** `https://agenti.uxday.com.br`
- **Porta:** 3000
- **Langfuse:** Integrado com tracing automático
- **Projeto:** Agent.I

### Frontend (Plugin Figma)
- **API URL:** `https://agenti.uxday.com.br/analisar`
- **Ambiente:** Produção
- **Configuração:** Automática

## 📊 Integração Langfuse

### Configuração Atual
```env
LANGFUSE_PUBLIC_KEY=pk-1f-555b6ca9-dd64-4376-ad67-ad8f62404837
LANGFUSE_SECRET_KEY=sk-1f-16b4f1ad-6a27-4a20-831a-4a6b73af7782
LANGFUSE_BASE_URL=https://langfuse.uxday.com.br
LANGFUSE_PROJECT_NAME=Agent.I
LANGFUSE_ENABLED=true
```

### Funcionalidades
- ✅ Tracing automático de todas as operações
- ✅ Métricas de performance
- ✅ Dados dos agentes (A, B, C)
- ✅ Session ID e User ID para agrupamento
- ✅ Graceful shutdown

## 🎯 Próximos Passos

1. **Deploy do Backend:** Configurar servidor de produção
2. **Teste de Integração:** Verificar traces no Langfuse
3. **Monitoramento:** Acompanhar métricas de performance

## 🔍 Verificação

### Dashboard Langfuse
- **URL:** `https://langfuse.uxday.com.br`
- **Projeto:** Agent.I
- **Seção:** Tracing

### Logs do Backend
- **Arquivo:** `heuristica.ndjson`
- **Debug:** `debug_layouts/`, `debug_responses/`

## 📝 Comandos Úteis

```bash
# Iniciar backend local
cd back && npm start

# Verificar status do servidor
netstat -ano | findstr :3000

# Parar servidor
taskkill /PID <PID> /F

# Fazer commit e push
git add . && git commit -m "feat: nova funcionalidade" && git push
```

## 🚨 Troubleshooting

### Problemas Comuns
1. **Traces não aparecem:** Verificar chaves de API e nome do projeto
2. **Erro de conexão:** Verificar URL da API no frontend
3. **Timeout:** Aumentar timeout para operações longas

### Logs Importantes
- `✅ Langfuse client inicializado`
- `📊 Trace enviado para Langfuse: <trace-id>`
- `❌ Erro ao enviar trace para Langfuse: <erro>`
