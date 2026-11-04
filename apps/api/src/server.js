import express from "express";
import crypto from "crypto";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import {config} from "./config.js";
import routes from "./routes.js";
import {User, Appointment, SystemError, CallSession} from "./models.js";
import {hashPassword} from "./security.js";

function sanitizeErrorMessage(value){
  return String(value||"Unknown error").slice(0,1000)
    .replace(/(password|token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,"$1=[REDACTED]")
    .replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi,"mongodb://[REDACTED]");
}
const app=express();
app.disable("x-powered-by");
app.set("trust proxy",1); // Render/other reverse proxies: use the real client IP for rate limits and audit logs
app.use(helmet());
app.use(cors({origin:config.clientOrigin}));
app.use(express.json({limit:"10mb"}));
app.use(rateLimit({windowMs:15*60*1000,limit:180,standardHeaders:true,legacyHeaders:false}));
app.get("/api/health",(_req,res)=>res.json({status:"ok",service:"MedAI Hospital API"}));
app.use("/api",routes);
app.use((err,req,res,_next)=>{
  const requestId=crypto.randomUUID();
  console.error("API error:",{requestId,name:err.name,message:err.message,method:req.method,path:req.path});
  SystemError.create({requestId,severity:(err.status>=500||!err.status)?"error":"warning",errorName:String(err.name||"Error").slice(0,120),message:sanitizeErrorMessage(err.message),statusCode:Number.isInteger(err.status)?err.status:500,method:req.method,route:req.route?.path||req.path,actorId:req.user?.id||null}).catch(logErr=>console.error("Could not persist system error:",logErr.message));
  if(err.name==="MulterError" || String(err.message||"").startsWith("Supported files:") || String(err.message||"").startsWith("Upload a PDF,")) return res.status(400).json({error:err.message});
  if(err.name==="CastError") return res.status(400).json({error:"Invalid identifier"});
  if(err.code==="STORED_FILE_MISSING" || err.status===410) return res.status(410).json({error:err.message});
  if(Number.isInteger(err.status)&&err.status>=400&&err.status<500) return res.status(err.status).json({error:err.message||"Request failed"});
  res.status(500).json({error:err.message==="Only PDF, JPG, PNG, and WEBP files are accepted"?err.message:"Internal server error"});
});
async function start(){
  await mongoose.connect(config.mongoUri);
  await Appointment.createIndexes();
  await CallSession.createIndexes();
  if(config.adminEmail && config.adminPassword){
    if(config.adminPassword.length<14) throw new Error("ADMIN_PASSWORD must be at least 14 characters");
    const existing=await User.findOne({email:config.adminEmail});
    if(!existing){
      await User.create({name:"MedAI Super Admin",email:config.adminEmail,passwordHash:await hashPassword(config.adminPassword),role:"admin",status:"active"});
      console.log("Initial Super Admin account provisioned from environment.");
    } else if(existing.role!=="admin") {
      throw new Error("ADMIN_EMAIL already belongs to a non-admin account. Use a dedicated admin email.");
    }
  } else console.warn("ADMIN_EMAIL/ADMIN_PASSWORD not set; no admin account was provisioned.");
  if(process.env.NODE_ENV==="production" && (config.uploadDir==="/tmp" || config.uploadDir.startsWith("/tmp/"))) console.warn("WARNING: UPLOAD_DIR points to temporary storage. Uploaded files may disappear after restart/deploy. Configure a persistent disk or object storage.");
  console.log(`Private upload storage configured at ${config.uploadDir}`);
  app.listen(config.port,()=>console.log(`MedAI Hospital API listening on ${config.port}`));
}
start().catch(e=>{console.error("Startup failed:",e);process.exit(1);});
