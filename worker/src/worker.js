//note i am using common js syntax here
require('dotenv').config();
const {Queue, Worker , QueueEvents, JobsOptions, Backoffs }= require('bullmq')
const IORedis =require('ioredis')
const moongose= require('mongoose')
const crypto=require('crypto')
const dayjs = require('dayjs');
const pino = require('pino');
const { title } = require('process');

const logger = pino({ level: 'info' });


const AttemptSchema = new moongose.Schema({at:Date,stausCode:Number,ok:Boolean,error:String},{_id:false})

const NoteSchema = new moongose.Schema({
    title:String,
    body:String,
    releaseAt:{type:Date,index:true},
    webhookUrl:String,
    status:{
        type:String,
        enum:["pending","delivered","failed","dead"],
    },
    attempts:{type:[AttemptSchema],default:[]},
    deliveredAt:Date
})

const Note=moongose.model('Note_Schema',NoteSchema)

const connection = new IORedis(process.env.REDIS_URL)

const queueName = 'dileveries';
const dileveries =new Queue(queueName,{connection})

const events= new QueueEvents(queueName,{connection})

const BACKOFF_NAME = '1-5-25';

function indempotencyKey(noteId,releaseAtISO){
    return crypto.createHash('sha256').update(`${noteId}:${releaseAtISO}`).digest('hex')
}

// polling every 5 secs to find due pending notes and enques.

async function pollAndEnqueue(){
    const now= new Date();
    const due = await Note.find({status:'pending',releaseAt:{$lte:now}}).limit(100).lean();
    for (const n of due) {
        try {
      // Use a stable jobId to dedupe enqueue attempts
      const jobId = `${n._id}:${n.releaseAt.toISOString()}`;
      await dileveries.add(
        'dilever',
        { noteId: String(n._id) },
        {
          jobId,
          attempts: 3,
          backoff: { type: BACKOFF_NAME },
          removeOnComplete: true,
          removeOnFail: false // keep for debugging
        }
      );
      logger.info({ noteId: n._id }, 'enqueued');
    } catch (e) {
      // EEXISTS is fine; another poller or previous run already added
      logger.debug({ err: String(e), noteId: n._id }, 'enqueue error/dup');
    }
  }
}

async function dileveryProcessor(job){
    const note = await Note.findById(job.data.noteId);
    if(!note){
        logger.warn({ noteId: job.data.noteId }, 'note missing; ack job');
        return; 
    }
    const key = indempotencyKey(note._id,note.releaseAt.toISOString())
    const started = Date.now()
    try {
       const res = await fetch(note.webhookUrl,{
           method:'POST',
           headers:{
               'Content-Type':'Application/json',
               'X-Note-Id':String(note._id),
               'X-Indempotency-Key':key
           },
           body:JSON.stringify({
               title:note.title,body:note.body,releaseAt:note.releaseAt
           })
       }
       )
       const attempt = {
           at:new Date(),
           statusCode: res.status,
           ok:res.ok,
           error:undefined
       } 
       note.attempts.push(attempt)
   
       if (res.ok){
           note.status ='dilevered',
           note.deliveredAt= new Date()
           await note.save()
           return;
   
       }
       else{
           note.status='falied'
           await note.save()
           throw new Error(`sink responded ${res.status}`);
       }
 } catch (error) {
     note.attempts.push({
      at: new Date(),
      statusCode: undefined,
      ok: false,
      error: String(err.message || err)
    });
    note.status = 'failed';
    await note.save();
    throw err; // let BullMQ retry/backoff
  } finally {
    logger.info({ noteId: note._id, ms: Date.now()-started, try: job.attemptsMade+1 }, 'attempt finished');
  }

 }

async function onFailed({ jobId, failedReason, attemptsMade, data, opts }) {
  if (attemptsMade >= (opts?.attempts || 1)) {
    // Final failure → dead
    await Note.findByIdAndUpdate(data.noteId, { $set: { status: 'dead' } });
    logger.error({ jobId, noteId: data.noteId }, 'marked dead');
  } else {
    logger.warn({ jobId, noteId: data.noteId, attemptsMade }, 'will retry later');
  }
}
async function main(){
    await moongose.connect(process.env.MONGO_URI)

    const worker = new Worker(queueName,dileveryProcessor,{
    connection,
    concurrency: 5,
    // custom backoff: 1s, 5s, 25s
    backoffStrategies: {
      [BACKOFF_NAME]: (attemptsMade) => [1000, 5000, 25000][attemptsMade - 1] || 25000
    }
    })

  events.on('failed', onFailed);
 setInterval(() => {
    pollAndEnqueue().catch(err => logger.error(err));
  }, 5000);

  logger.info('worker started');
}

main().catch(err => {
  logger.error(err);
  process.exit(1);
});

module.exports = { indempotencyKey }; 
