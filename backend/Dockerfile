FROM node:20-slim

WORKDIR /app

COPY package*.json ./

ARG DATABASE_URL=postgresql://lms:lms@postgres:5432/lms?schema=public
ENV DATABASE_URL=$DATABASE_URL

RUN apt-get update -y \
	&& apt-get install -y openssl \
	&& rm -rf /var/lib/apt/lists/*

RUN npm install

COPY . .

EXPOSE 5001

CMD ["npm", "run", "dev"]
