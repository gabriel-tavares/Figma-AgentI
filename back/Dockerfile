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

# Criar arquivo .env com variáveis de ambiente
RUN echo "NODE_ENV=production" > .env && \
    echo "PORT=3000" >> .env && \
    echo "OPENAI_API_KEY=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" >> .env && \
    echo "OPENROUTER_API_KEY=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" >> .env && \
    echo "VECTOR_STORE_ID=vs_6893c02afcb081918c69241839c8ca54" >> .env && \
    echo "ASSISTANT_ID=asst_your_assistant_id_here" >> .env && \
    echo "TEMP_VISION=0.1" >> .env && \
    echo "TEMP_TEXTO=0.2" >> .env && \
    echo "MAX_TOKENS_VISION=4096" >> .env && \
    echo "MAX_TOKENS_TEXTO=8192" >> .env && \
    echo "CLEANUP_TEMP_FILES=true" >> .env && \
    echo "RETRY_ATTEMPTS=3" >> .env && \
    echo "RETRY_DELAY=1000" >> .env && \
    echo "CORS_ORIGIN=https://www.figma.com" >> .env && \
    echo "LOG_LEVEL=info" >> .env && \
    echo "LOG_TO_FILE=true" >> .env && \
    echo "REQUEST_TIMEOUT=30000" >> .env

# Criar diretórios necessários
RUN mkdir -p temp debug_responses debug_layouts debug_vision && \
    chown -R nodejs:nodejs /app && \
    chmod -R 755 /app/temp

# Mudar para usuário não-root
USER nodejs

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/ping-openai', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Comando para iniciar a aplicação
CMD ["node", "index.js"]
