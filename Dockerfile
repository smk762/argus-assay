FROM node:22-alpine AS build
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
# Baked in: the browser calls argus-mint at this URL. With ASSAY_MINT_PROXY set, use /mint and
# assay proxies argus-mint itself (one origin, one port).
ARG NEXT_PUBLIC_MINT_URL=http://localhost:8108
ARG ASSAY_MINT_PROXY=
ENV NEXT_PUBLIC_MINT_URL=$NEXT_PUBLIC_MINT_URL ASSAY_MINT_PROXY=$ASSAY_MINT_PROXY
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# The port next listens on; compose publishes the same number so the logs match the URL.
ENV PORT=3108
COPY --from=build /app ./
EXPOSE 3108
CMD ["npm", "start"]
