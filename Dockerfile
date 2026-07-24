FROM node:22-bookworm-slim AS build
WORKDIR /app
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY}
COPY package.json package-lock.json ./
RUN npm install -g npm@11.10.0 && npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install -g npm@11.10.0 \
  && npm ci --omit=dev \
  && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
EXPOSE 3000
CMD ["node", "server/node.mjs"]
