FROM node:22-alpine

WORKDIR /app

COPY . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 3001

CMD ["npm", "start"]
