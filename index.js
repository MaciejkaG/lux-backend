import "dotenv/config";

if (!process.env.REDIS_PREFIX) process.env.REDIS_PREFIX = "lux";

import { pathToFileURL, fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import http from 'node:http';
import express from "express";

import initWS from "./utils/ws-server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);
initWS(server);

// Use routers from ./routes
fs.readdir(path.join(__dirname, "routers"), (err, files) => {
    files.forEach(async (file) => {
        if (file.endsWith(".js")) {
            const {
                default: { startingPath, router },
            } = await import(
                pathToFileURL(path.join(__dirname, "routers", file))
            );
            app.use(startingPath, router);
        }
    });
});

// Start the server
const port = parseInt(process.env.port ?? 3000);
server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
