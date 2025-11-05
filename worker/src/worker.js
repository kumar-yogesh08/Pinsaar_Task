// worker.js
require("dotenv").config();
const { Queue, Worker, QueueEvents } = require("bullmq");
const IORedis = require("ioredis");
const mongoose = require("mongoose");
const crypto = require("crypto");
const pino = require("pino");

const logger = pino({ level: "info" });


const AttemptSchema = new mongoose.Schema(
  {
    at: Date,
    statusCode: Number, 
    ok: Boolean,
    error: String,
  },
  { _id: false }
);

const NoteSchema = new mongoose.Schema({
  title: String,
  body: String,
  releaseAt: { type: Date, index: true },
  webhookUrl: String,
  status: {
    type: String,
    enum: ["pending", "delivered", "failed", "dead"],
    default: "pending",
  },
  attempts: { type: [AttemptSchema], default: [] },
  deliveredAt: Date,
});

const Note = mongoose.model("Note_Model", NoteSchema);


const queueName = "deliveries";
const BACKOFF_NAME = "1-5-25";


function indempotencyKey(noteId, releaseAtISO) {
  return crypto
    .createHash("sha256")
    .update(`${noteId}:${releaseAtISO}`)
    .digest("hex");
}

async function pollAndEnqueue(deliveries) {
  logger.info(" Polling for due notes...");
  const now = new Date();
  const due = await Note.find({ status: "pending", releaseAt: { $lte: now } })
    .limit(100)
    .lean();

  if (!due || due.length === 0) {
    logger.info("📭 No due notes found");
    return;
  }

  for (const n of due) {
    try {
      const jobId = `${n._id}_${n.releaseAt.toISOString()}`;
      logger.info(`${n._id} → preparing to enqueue`);

      const result = await deliveries.add(
        "deliver",
        { noteId: String(n._id) },
        {
          jobId,
          attempts: 3,
          backoff: { type: BACKOFF_NAME },
          removeOnComplete: true,
          removeOnFail: false,
        }
      );

   
      logger.info(
        {
          jobId: result.id,
          name: result.name,
          noteId: n._id,
          timestamp: result.timestamp,
        },
        " Job successfully enqueued"
      );
    } catch (e) {
      logger.warn(
        { err: String(e), noteId: n._id },
        " Failed to enqueue (possibly duplicate)"
      );
    }
  }
}


async function deliveryProcessor(job) {
  const note = await Note.findById(job.data.noteId);
  if (!note) {
    logger.warn({ noteId: job.data.noteId }, "! Note missing, skipping job");
    return;
  }

  const key = indempotencyKey(note._id, note.releaseAt.toISOString());
  const started = Date.now();

  try {
    const res = await fetch(note.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", 
        "X-Note-Id": String(note._id),
        "X-Idempotency-Key": key,
      },
      body: JSON.stringify({
        title: note.title,
        body: note.body,
        releaseAt: note.releaseAt,
      }),
    });

    const attempt = {
      at: new Date(),
      statusCode: res.status,
      ok: res.ok,
      error: undefined,
    };
    note.attempts.push(attempt);

    if (res.ok) {
      note.status = "delivered";
      note.deliveredAt = new Date();
      await note.save();
      logger.info({ noteId: note._id }, "_/ Delivered successfully");
      return;
    } else {
      note.status = "failed";
      await note.save();
      throw new Error(`Webhook responded ${res.status}`);
    }
  } catch (err) {
    note.attempts.push({
      at: new Date(),
      statusCode: undefined,
      ok: false,
      error: String(err.message || err),
    });
    note.status = "failed";
    await note.save();
    logger.error({ noteId: note._id, err }, "X Delivery failed");
    throw err; 
  } finally {
    logger.info(
      {
        noteId: note._id,
        ms: Date.now() - started,
        attempt: job.attemptsMade + 1,
      },
      "📤 Attempt finished"
    );
  }
}


async function onFailed({ jobId, failedReason, attemptsMade, data, opts }) {
  if (attemptsMade >= (opts?.attempts || 1)) {
    await Note.findByIdAndUpdate(data.noteId, { $set: { status: "dead" } });
    logger.error({ jobId, noteId: data.noteId }, "💀 Marked as dead");
  } else {
    logger.warn(
      { jobId, noteId: data.noteId, attemptsMade },
      "🔁 Will retry later"
    );
  }
}


async function main() {
  const customBackoff = {
    "1-5-25": (attemptsMade) => [1000, 5000, 25000][attemptsMade - 1] || 25000,
  };
  await mongoose.connect(process.env.MONGO_URI);
  logger.info("_/ Connected to MongoDB");

  const connection = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  connection.on("connect", async () => {
    logger.info("_/ Redis connected");
  });

  connection.on("error", (err) => {
    logger.error({ err }, "X Redis connection error");
  });

  const deliveries = new Queue(queueName, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "1-5-25" }, 
      removeOnComplete: true,
      removeOnFail: false,
    },
  });

  const events = new QueueEvents(queueName, { connection });

  const worker = new Worker(queueName, deliveryProcessor, {
    connection,
    concurrency: 5,
    backoffStrategies: customBackoff,
  });

  events.on("failed", onFailed);

  // ✅ Important: pass `deliveries` into poller
  setInterval(() => {
    pollAndEnqueue(deliveries).catch((err) => logger.error(err));
  }, 5000);

  logger.info("🚀 Worker started and polling every 5s");
}

// -------------------------
main().catch((err) => {
  logger.error(err);
  process.exit(1);
});

module.exports = { indempotencyKey };
