FROM node:16-alpine

WORKDIR /app

COPY ["package.json", "/app/"]

#RUN npm install --production --registry=https://registry.npm.taobao.org
RUN npm install --production

ENV NPM_CONFIG_LOGLEVEL warn
ENV NODE_ENV=production

COPY src /app/src

EXPOSE 9000

CMD ["npm", "run", "start"]