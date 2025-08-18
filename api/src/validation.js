import {z} from 'zod'

const createNoteSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  releaseAt: z.string().datetime(), // ISO 
  webhookUrl: z.string().url()   //check webhook
});

export default createNoteSchema ;