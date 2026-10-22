FROM node:24-bookworm-slim
ENV NODE_ENV=production DANMIAO_HOST=0.0.0.0 PORT=8787 DANMIAO_DATA_DIR=/data DANMIAO_SEED=empty
WORKDIR /app
COPY package.json *.html *.js *.css ./
COPY server ./server
COPY assets ./assets
COPY vendor ./vendor
RUN mkdir /data /backups && chown node:node /data /backups
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/index.cjs"]
