# docker run --restart unless-stopped --name pentf-lockserver -d -p 1524:1524 phihag/pentf-lockserver

FROM node:slim 
ENV PORT=1524

WORKDIR /pentf-lockserver
ADD package.json package-lock.json ./
RUN npm ci
ADD . .

CMD /pentf-lockserver/lockserver.js -p "$PORT"
EXPOSE $PORT
