import express from 'express';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);
import Note from '../models/Note_Model.js';
import VerifyNoteSchema from '../validation.js';

const router = express.Router();

router.post('/',async(req,res)=>{
    try{
        const parsed=VerifyNoteSchema.safeParse(req.body);
        if(!parsed.success){
            return res.status(400).json({ error: "validation failed", details: parsed.error.issues });
        }
        const {title,body,releaseAt,webhookUrl}=parsed.data
        const doc=await Note.create(
                {
                    title,
                    body,
                    releaseAt:dayjs.utc(releaseAt).toDate(),
                    webhookUrl,
                    status:'pending',
                }
        )
        return res.status(201).json({id:doc._id})      
    }
    catch(e){
        req.log?.error(e)
        return res.status(500).json({error:"internal Error"})
    }

});
router.get('/',async(req,res)=>{
    try{
        const page = Math.max(1,parseInt(req.query.page || '1'))
        const limit = 20
        const filter={}
        if (req.query.status){
            filter.status=req.query.status
        } 
        const [items,total]= await Promise.all([Note.find(filter).sort({createdAt:-1}).skip((page-1)*limit).limit(limit).lean(),Note.countDocuments(filter)]) //20 per page
        
        const map= items.map(n=>({
            id:n._id,
            title:n.title,
            status:n.status,
            deliveredAt:n.deliveredAt,
            lastAttemptCode:n.attempts?.length ? n.attempts[n.attempts.length-1].statusCode ?? null:null,
            releaseAt:n.releaseAt,
            webhookUrl:n.webhookUrl
        }))
        res.status(200).json({items:mapped,page,total,totalPages:Math.ceil(total/limit)})
    }
    catch(e){
        req.log?.error(e)
        res.status(500).json({erroe:"Internal error"})
    }

})
// To be completed
