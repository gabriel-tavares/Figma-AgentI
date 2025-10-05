# ===========================================
# FIGMA-AGENTI - DOCKERFILE
# ===========================================

# Usar Node.js 18 Alpine (menor e mais seguro)
FROM node:18-alpine

# Metadados da imagem
LABEL maintainer="Figma-AgentI Team"
LABEL description="Backend para análise heurística de UX no Figma"
LABEL version="1.0.0"

# Criar usuário não-root para segurança
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências primeiro (para cache de layers)
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production && \
    npm cache clean --force

# Copiar código fonte
COPY . .

# Criar diretórios necessários
RUN mkdir -p temp debug_responses debug_layouts debug_vision && \
    chown -R nodejs:nodejs /app

# Mudar para usuário não-root
USER nodejs

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/ping-openai', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Comando para iniciar a aplicação
CMD ["node", "index.js"]
