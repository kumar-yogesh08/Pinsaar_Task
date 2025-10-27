import express from 'express';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);
import Note from '../models/Note_Model.js';
import VerifyNoteSchema from '../validation.js';
import Note_Model from '../models/Note_Model.js';

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
        res.status(200).json({items:map,page,total,totalPages:Math.ceil(total/limit)})
    }
    catch(e){
        req.log?.error(e)
        res.status(500).json({erroe:"Internal error"})
    }

})
// To be completed

router.post('/:id/replay',async (req,res)=>{
try {
    
        const note=await Note_Model.findById(req.params.id);
        if (!note){
            return res.status(404).json({error:"not found"})
    
        }
        if (note.status!="dead" ||note.status!="failed"){
            return res.status(409).json({error:"cannot replay undead notes"})
        } 
        note.status='pending'
        note.save()
        res.status(200).json({ok:true})
} catch (error) {
    req.log?.error(error)
    res.status(500).json({ error: "internal error" });
}

})

module.exports=router;