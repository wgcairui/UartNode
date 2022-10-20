FROM node:18-alpine

WORKDIR /app

# COPY ["package.json", "/app/"]

# RUN mkdir /app/xprofiler_output
#RUN npm install --production --registry=https://registry.npm.taobao.org
#RUN npm install --production

ENV NPM_CONFIG_LOGLEVEL warn
ENV NODE_ENV=production
ENV NODE_Docker=docker

COPY dist/ncc /app
# COPY node_modules /app/node_modules

EXPOSE 9000

CMD ["node", "./index.js"]