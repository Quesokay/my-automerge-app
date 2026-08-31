# 1. Use an official, lightweight Node.js image
FROM node:20-alpine

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Copy only the necessary package files
COPY package.json package-lock.json* ./

# 4. Install production dependencies (ignores devDependencies like Vite)
RUN npm install --production

# 5. Copy your custom relay script
COPY relay.mjs ./

# 6. Expose the port Fly.io is looking for
EXPOSE 8080

# 7. Start the server
CMD ["node", "relay.mjs"]