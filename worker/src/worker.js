//note i am using common js syntax here
require('dotenv').config();
const {Queue, Worker , QueueEvents, JobsOptions }= require('bullmq')
const IORedis =require('ioredis')
const moongose= require('mongoose')
const crypto=require('crypto')
const dayjs = require('dayjs');
const pino = require('pino');

const logger = pino({ level: 'info' });


