import "dotenv/config";
import { pathToFileURL, fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import express from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

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
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
