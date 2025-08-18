import {mongoose} from 'mongoose';

const AttemptSchema= new mongoose.Schema({
    at:{type:Date,required:true},
    statusCode:{type:Number, required:false},
    ok:{type:Boolean, required:true},
    error_value:{type:String,required:false}
},{_id:false});

const NoteSchema = new mongoose.Schema({
    title:String,
    body:String,
    releaseAt:{type:Date,index:true},
    webhookUrl:String,
    status:{
        type:String,
        enum:["pending","delivered","failed","dead"],
        index:true,
        default:"pending"
    },
    attempts:{type:[AttemptSchema],default:[]},
    deliveredAt:{type:Date,default:null}
})
export default mongoose.model('Note_Model',NoteSchema)