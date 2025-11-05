require("dotenv").config();

const express = require("express");
const pino = require("pino");
const IOredis = require("ioredis");

const app = new express();
const redis = new IOredis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});
const logger = pino({ level: "info" });

app.use(express.json());

app.post("/sink", async (req, res) => {
  const key = req.header("X-Idempotency-Key");
  const noteId = req.header("X-Note-Id");
  if (!key) return res.status(400).json({ error: "missing idempotency key" });

  // simulate failure if toggled
  if (process.env.SINK_ALWAYS_500 === "true") {
    logger.warn({ noteId }, "forced 500");
    return res.status(500).json({ error: "forced failure" });
  }

  try {
    const set = await redis.set(key, "1", "NX", "EX", 86400);
    if (set === null) {
      // duplicate
      logger.info(
        { noteId, dup: true, body: req.body },
        "duplicate delivery ignored"
      );
      return res.status(200).json({ ok: true, duplicate: true });
    }
    logger.info({ noteId, body: req.body }, "accepted delivery");
    return res.json({ ok: true });
  } catch (e) {
    logger.error(e);
    return res.status(500).json({ error: "sink error" });
  }
});

const port = Number(process.env.SINK_PORT || 4000);
app.listen(port, () => logger.info({ port }, "sink listening"));
