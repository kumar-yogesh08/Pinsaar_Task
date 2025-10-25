import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import pino from "pino";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import auth from "./auth.js";
import rateLimit from "./rateLimit.js";
import notesRouter from "./routes/notes.js";
import { info } from "console";
const __fileName = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__fileName);
const app = express();
const logger = pino({ level: info });
app.use(pinoHttp({ logger }));
app.use(express.json());

app.use("/health", (req, res) => {
  return res.status(200).json({ ok: true });
});

app.use("/api", auth, rateLimit);

app.use("/api/notes", notesRouter);

// serve admin static
// Use __dirname to construct the path relative to the current file
app.use(express.static(path.join(__dirname, "..", "public")));

const start = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const port = Number(process.env.PORT || 3000);

    app.listen(port, () => logger.info({ port }, "api listening"));
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
};

start();
