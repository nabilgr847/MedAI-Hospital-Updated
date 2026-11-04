import express from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import fs from "fs/promises";
import mongoose from "mongoose";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
const execFileAsync=promisify(execFile);
import { escapeRegex, detectMime, detectMimeFromBytes } from "./util.js";
import { verifyFindings, urgency } from "./reportRules.js";
import { makeTextPdf } from "./pdf.js";
import { z } from "zod";
import { User, PrivateFile, Appointment, Message, AuditEvent, Medicine, Prescription, CallSignal, MedicalReport, Notification, SystemError, CallSession } from "./models.js";
import { auth, allow, hashPassword, verifyPassword, makeToken, audit } from "./security.js";
import { config } from "./config.js";
import { resolveStoredFilePath, readStoredFileBuffer, storeGridFSBuffer, deleteGridFSFile } from "./fileStorage.js";

const router = express.Router();
const sensitiveLimiter=rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:true,legacyHeaders:false,message:{error:"Too many attempts. Try again later."}});
const uploadDir = config.uploadDir;
await fs.mkdir(uploadDir, {recursive:true});

const storage = multer.memoryStorage();
const upload = multer({
  storage, limits:{fileSize:config.maxUploadMb*1024*1024, files:5},
  fileFilter:(_req,file,cb) => {
    const allowed = ["application/pdf","image/jpeg","image/png","image/webp","audio/mpeg","audio/mp4","audio/ogg","audio/webm","audio/wav","video/mp4","video/webm","video/quicktime"];
    cb(allowed.includes(file.mimetype) ? null : new Error("Supported files: PDF, JPG, PNG, WEBP, MP3, M4A, OGG, WAV, MP4, WEBM, MOV"), allowed.includes(file.mimetype));
  }
});
const wrap = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);

const recordingUpload = multer({
  storage, limits:{fileSize:50*1024*1024,files:1},
  fileFilter:(_req,file,cb)=>{const ok=["audio/webm","audio/webm;codecs=opus","audio/ogg","audio/mp4","audio/mpeg"].includes(file.mimetype);cb(ok?null:new Error("Use a supported browser audio recording format"),ok);}
});
const EXT_BY_MIME={"application/pdf":".pdf","image/jpeg":".jpg","image/png":".png","image/webp":".webp","audio/webm":".webm","audio/ogg":".ogg","audio/mp4":".m4a","audio/mpeg":".mp3","audio/wav":".wav","video/mp4":".mp4","video/webm":".webm","video/quicktime":".mov"};
// Statuses in which an assigned doctor may see the patient's record / reports.
const DOCTOR_ACCESS_STATUSES=["requested","awaiting_records","awaiting_tests","confirmed","waiting_room","in_progress","completed","follow_up_required"];
// Statuses in which a prescription may be written.
const PRESCRIBE_STATUSES=["awaiting_records","awaiting_tests","confirmed","waiting_room","in_progress","completed","follow_up_required"];
const CLOSED_STATUSES=["completed","cancelled","rejected"];
const mkLimiter=(minutes,limit,error)=>rateLimit({windowMs:minutes*60*1000,limit,standardHeaders:true,legacyHeaders:false,message:{error}});
const loginLimiter=mkLimiter(15,20,"Too many sign-in attempts. Try again later.");
const applyLimiter=mkLimiter(60,10,"Too many submissions. Try again later.");
const aiLimiter=mkLimiter(60,20,"AI question limit reached. Try again later.");
const DUMMY_HASH=await hashPassword("timing-equalisation-only");

async function removeFiles(_files){ /* memoryStorage: no temporary upload files to clean up */ }
// Reject uploads whose real content (magic bytes) does not match the declared type.
const validateUploads=async(req,res,next)=>{
  try{
    const files=[...(Array.isArray(req.files)?req.files:[]),...(req.file?[req.file]:[])];
    for(const f of files){
      const actual=detectMimeFromBytes(f.buffer||Buffer.alloc(0));
      const compatible=actual===f.mimetype || (actual==="video/webm"&&f.mimetype.startsWith("audio/webm")) || (actual==="video/mp4"&&["audio/mp4","video/quicktime"].includes(f.mimetype));
      if(!compatible){
        await removeFiles(files);
        return res.status(400).json({error:"File content does not match its type. Upload a real PDF, JPG, PNG or WEBP file."});
      }
    }
    next();
  }catch(e){next(e);}
};
const DOCTOR_DOC_CATEGORIES=["doctor_photo","bmdc_certificate","degree_certificate","identity_document","other_qualification","other"];
async function saveDoctorDocs(userId,files,body){
  for(let i=0;i<files.length;i++){
    const f=files[i], category=String(body[`category_${i}`]||"other");
    const gridId=await storeGridFSBuffer({buffer:f.buffer,filename:f.originalname,mimeType:f.mimetype,metadata:{ownerId:String(userId),category}});
    await PrivateFile.create({ownerId:userId,uploadedBy:userId,category:DOCTOR_DOC_CATEGORIES.includes(category)?category:"other",originalName:f.originalname,storedName:String(gridId),storageProvider:"gridfs",mimeType:f.mimetype,size:f.size});
  }
}
function prescriptionCanonical(rx){
  const payload={id:String(rx._id),appointmentId:String(rx.appointmentId),patientId:String(rx.patientId),doctorId:String(rx.doctorId?._id||rx.doctorId),signerName:rx.signerName,signerBmdc:rx.signerBmdc,signedAt:rx.signedAt.toISOString(),items:rx.items.map(x=>({brand:x.brand,generic:x.generic,strength:x.strength,form:x.form,dose:x.dose,frequency:x.frequency,duration:x.duration,instructions:x.instructions})),notes:rx.notes||""};
  // Preserve compatibility with prescriptions signed before image snapshots existed.
  if(rx.signatureImageHash||rx.signatureImageFileId){payload.signatureImageFileId=String(rx.signatureImageFileId||"");payload.signatureImageHash=String(rx.signatureImageHash||"");}
  return JSON.stringify(payload);
}

function cleanRxItems(raw){
  if(!Array.isArray(raw)||raw.length<1||raw.length>30) return {error:"Add 1-30 prescription items"};
  const items=raw.map(x=>{x=x||{};return {brand:String(x.brand||"").slice(0,120),generic:String(x.generic||"").trim().slice(0,160),strength:String(x.strength||"").slice(0,60),form:String(x.form||"").slice(0,40),dose:String(x.dose||"").trim().slice(0,120),frequency:String(x.frequency||"").trim().slice(0,120),duration:String(x.duration||"").trim().slice(0,120),instructions:String(x.instructions||"").slice(0,500),medicineId:mongoose.isValidObjectId(x.medicineId)?x.medicineId:undefined};});
  if(items.some(x=>!x.generic||!x.dose||!x.frequency||!x.duration)) return {error:"Generic, dose, frequency and duration are required for every medicine"};
  return {items};
}

router.post("/auth/register", applyLimiter, wrap(async(req,res)=>{
  const s=z.object({name:z.string().min(2).max(120),email:z.string().email(),password:z.string().min(12).max(128),phone:z.string().max(30).optional()}).safeParse(req.body);
  if(!s.success) return res.status(400).json({error:"Invalid details",details:s.error.flatten()});
  const email=s.data.email.toLowerCase();
  if(await User.findOne({email})) return res.status(409).json({error:"Email already registered"});
  const user=await User.create({name:s.data.name,email,phone:s.data.phone,passwordHash:await hashPassword(s.data.password),role:"patient"});
  await audit(req,"patient.register","User",user.id);
  res.status(201).json({message:"Patient account created",user:{id:user.id,name:user.name,email:user.email,role:user.role}});
}));

router.post("/auth/login", loginLimiter, wrap(async(req,res)=>{
  const email=String(req.body.email||"").toLowerCase().trim();
  const user=await User.findOne({email}).select("+passwordHash");
  const ok=await verifyPassword(String(req.body.password||""),user?user.passwordHash:DUMMY_HASH);
  if(!user || !ok) return res.status(401).json({error:"Invalid email or password"});
  if(user.status!=="active"){
    const msg=user.status==="pending_verification"?"Your account is pending verification":user.status==="rejected"?"Your application was not approved":"Account is unavailable";
    return res.status(403).json({error:msg,status:user.status,role:user.role,note:user.role==="doctor"?(user.doctorProfile?.verificationNote||""):""});
  }
  const token=makeToken(user);
  user.lastLoginAt=new Date(); user.lastSeenAt=new Date(); await user.save();
  await audit(req,"auth.login","User",user.id);
  res.json({token,user:{id:user.id,name:user.name,email:user.email,role:user.role}});
}));

router.get("/auth/me",auth,wrap(async(req,res)=>{
  const user=await User.findById(req.user.id).select("-passwordHash");
  res.json({user});
}));

router.post("/auth/change-password",auth,wrap(async(req,res)=>{
  const s=z.object({currentPassword:z.string(),newPassword:z.string().min(14).max(128)}).safeParse(req.body);
  if(!s.success) return res.status(400).json({error:"New password must be at least 14 characters"});
  const user=await User.findById(req.user.id).select("+passwordHash");
  if(!await verifyPassword(s.data.currentPassword,user.passwordHash)) return res.status(400).json({error:"Current password is incorrect"});
  user.passwordHash=await hashPassword(s.data.newPassword); user.passwordChangedAt=new Date(); await user.save();
  await audit(req,"auth.password_changed","User",user.id);
  // Older sessions on other devices are now invalid; this device gets a fresh token.
  res.json({message:"Password changed. Other devices have been signed out.",token:makeToken(user)});
}));

router.post("/doctor/apply",applyLimiter,upload.array("documents",5),validateUploads,wrap(async(req,res)=>{
  const files=req.files||[];
  try{
    const s=z.object({name:z.string().min(2).max(120),email:z.string().email(),phone:z.string().min(5).max(30),password:z.string().min(14).max(128),bmdcNumber:z.string().min(3).max(40),specialty:z.string().min(2).max(100),qualifications:z.string().min(2).max(500),experienceYears:z.coerce.number().min(0).max(70)}).safeParse(req.body);
    if(!s.success){await removeFiles(files);return res.status(400).json({error:"Invalid doctor application. Check every field (password needs 14+ characters).",details:s.error.flatten()});}
    if(!files.some((f,i)=>String(req.body[`category_${i}`]||"")==="bmdc_certificate")){await removeFiles(files);return res.status(400).json({error:"Upload your BMDC registration certificate."});}
    if(await User.findOne({email:s.data.email.toLowerCase()})){await removeFiles(files);return res.status(409).json({error:"Email already registered"});}
    const user=await User.create({name:s.data.name,email:s.data.email.toLowerCase(),phone:s.data.phone,passwordHash:await hashPassword(s.data.password),role:"doctor",status:"pending_verification",doctorProfile:{bmdcNumber:s.data.bmdcNumber,specialty:s.data.specialty,qualifications:s.data.qualifications.split(",").map(x=>x.trim()).filter(Boolean),experienceYears:s.data.experienceYears}});
    await saveDoctorDocs(user.id,files,req.body);
    await audit(req,"doctor.application_submitted","User",user.id,{documentCount:files.length});
    res.status(201).json({message:"Application submitted. Your account stays locked until an admin verifies your documents.",doctorId:user.id,status:user.status});
  }catch(e){ await removeFiles(files); throw e; }
}));

// A doctor whose application needs more information cannot sign in yet, so they authenticate with email+password here.
router.post("/doctor/additional-documents",applyLimiter,upload.array("documents",5),validateUploads,wrap(async(req,res)=>{
  const files=req.files||[];
  try{
    const email=String(req.body.email||"").toLowerCase().trim();
    const user=await User.findOne({email,role:"doctor"}).select("+passwordHash");
    const ok=await verifyPassword(String(req.body.password||""),user?user.passwordHash:DUMMY_HASH);
    if(!user||!ok||user.status!=="pending_verification"){await removeFiles(files);return res.status(401).json({error:"Invalid credentials, or this application is not awaiting documents"});}
    if(!files.length) return res.status(400).json({error:"Attach at least one document"});
    await saveDoctorDocs(user.id,files,req.body);
    await audit(req,"doctor.additional_documents",  "User",user.id,{documentCount:files.length});
    res.status(201).json({message:"Documents received. The admin team will review them."});
  }catch(e){ await removeFiles(files); throw e; }
}));

router.get("/doctor/me",auth,allow("doctor"),wrap(async(req,res)=>{
  const files=await PrivateFile.find({ownerId:req.user.id}).select("-storedName");
  res.json({user:await User.findById(req.user.id).select("-passwordHash"),documents:files});
}));

router.patch("/doctor/profile",auth,allow("doctor"),wrap(async(req,res)=>{
  const s=z.object({phone:z.string().max(30).optional(),clinicName:z.string().max(150).optional()}).safeParse(req.body);
  if(!s.success) return res.status(400).json({error:"Invalid profile details"});
  const user=await User.findById(req.user.id);
  if(s.data.phone!==undefined) user.phone=s.data.phone;
  if(s.data.clinicName!==undefined) user.doctorProfile.clinicName=s.data.clinicName;
  await user.save(); await audit(req,"doctor.profile_updated","User",user.id);
  res.json({user});
}));

// Presence heartbeat: only timestamps and role/account metadata are exposed to Admin.
router.post("/presence/heartbeat",auth,wrap(async(req,res)=>{
  await User.updateOne({_id:req.user.id,status:"active"},{$set:{lastSeenAt:new Date()}});
  res.json({ok:true,serverTime:new Date().toISOString()});
}));

router.get("/admin/monitoring",auth,allow("admin"),wrap(async(req,res)=>{
  const now=new Date(), onlineSince=new Date(now.getTime()-75_000), staleCallSince=new Date(now.getTime()-90_000);
  const [onlineUsers,activeCalls,recentActivity,onlineCounts]=await Promise.all([
    User.find({role:{$in:["patient","doctor"]},status:"active",lastSeenAt:{$gte:onlineSince}}).select("name email role lastLoginAt lastSeenAt").sort({lastSeenAt:-1}).limit(200),
    CallSession.find({status:"active",lastHeartbeatAt:{$gte:staleCallSince}}).populate("patientId","name email").populate("doctorId","name email").populate("appointmentId","status scheduledAt").sort({lastHeartbeatAt:-1}).limit(100),
    AuditEvent.find().sort({createdAt:-1}).limit(40).populate("actorId","name email role"),
    User.aggregate([{$match:{role:{$in:["patient","doctor"]},status:"active",lastSeenAt:{$gte:onlineSince}}},{$group:{_id:"$role",count:{$sum:1}}}])
  ]);
  res.json({asOf:now,onlineUsers,activeCalls,recentActivity,onlineCounts,thresholdSeconds:75,callStaleSeconds:90});
}));

router.get("/admin/overview",auth,allow("admin"),wrap(async(req,res)=>{
  const [patients,doctors,pendingDoctors,appointments,reports]=await Promise.all([
    User.countDocuments({role:"patient"}),User.countDocuments({role:"doctor"}),User.countDocuments({role:"doctor",status:"pending_verification"}),
    Appointment.countDocuments(),PrivateFile.countDocuments({category:"patient_report"})
  ]);
  res.json({patients,doctors,pendingDoctors,appointments,uploadedReports:reports});
}));

router.get("/admin/system/errors",auth,allow("admin"),wrap(async(req,res)=>{
  const limit=Math.min(200,Math.max(1,Number(req.query.limit)||50));
  const filter=req.query.resolved==="true"?{resolvedAt:{$ne:null}}:req.query.resolved==="false"?{resolvedAt:null}:{};
  const errors=await SystemError.find(filter).populate("actorId","name email role").sort({createdAt:-1}).limit(limit);
  res.json({errors});
}));
router.post("/admin/system/errors/:id/resolve",auth,allow("admin"),wrap(async(req,res)=>{
  const error=await SystemError.findByIdAndUpdate(req.params.id,{$set:{resolvedAt:new Date(),resolvedBy:req.user.id}},{new:true});
  if(!error)return res.status(404).json({error:"System error not found"});
  await audit(req,"system_error.resolved","SystemError",error.id);res.json({error});
}));

router.get("/admin/doctors/pending",auth,allow("admin"),wrap(async(req,res)=>{
  const doctors=await User.find({role:"doctor",status:"pending_verification"}).select("name email phone doctorProfile createdAt");
  const result=await Promise.all(doctors.map(async d=>({doctor:d,documents:await PrivateFile.find({ownerId:d.id}).select("category originalName mimeType size createdAt")})));
  res.json({applications:result});
}));

router.post("/admin/doctors/:id/decision",auth,allow("admin"),wrap(async(req,res)=>{
  const s=z.object({decision:z.enum(["approve","reject","request_info"]),note:z.string().max(1000).optional()}).safeParse(req.body);
  if(!s.success) return res.status(400).json({error:"Invalid decision"});
  const doctor=await User.findOne({_id:req.params.id,role:"doctor"});
  if(!doctor) return res.status(404).json({error:"Doctor not found"});
  if(s.data.decision==="approve"){doctor.status="active";doctor.doctorProfile.verifiedAt=new Date();}
  if(s.data.decision==="reject"){doctor.status="rejected";doctor.doctorProfile.verificationNote=s.data.note||"Application rejected";}
  if(s.data.decision==="request_info"){doctor.status="pending_verification";doctor.doctorProfile.verificationNote=s.data.note||"Additional information requested";}
  await doctor.save(); await audit(req,`doctor.${s.data.decision}`,"User",doctor.id,{note:s.data.note||""});
  res.json({message:"Decision saved",status:doctor.status});
}));

router.get("/profile",auth,wrap(async(req,res)=>{
  const user=await User.findById(req.user.id).select("-passwordHash"); res.json({user});
}));
router.patch("/profile",auth,allow("patient"),wrap(async(req,res)=>{
  const em=z.object({name:z.string().max(120).optional(),phone:z.string().max(30).optional(),relationship:z.string().max(60).optional()});
  const s=z.object({name:z.string().min(2).max(120).optional(),phone:z.string().max(30).optional(),dateOfBirth:z.string().max(40).optional(),address:z.string().max(300).optional(),gender:z.string().max(30).optional(),bloodGroup:z.string().max(10).optional(),allergies:z.array(z.string().max(100)).max(50).optional(),currentMedicines:z.array(z.string().max(120)).max(50).optional(),medicalHistory:z.string().max(5000).optional(),emergencyContact:em.optional()}).safeParse(req.body);
  if(!s.success) return res.status(400).json({error:"Invalid profile details",details:s.error.flatten()});
  const update={...s.data};
  if("dateOfBirth" in update){
    if(update.dateOfBirth){const d=new Date(update.dateOfBirth); if(Number.isNaN(d.getTime())||d>new Date()) return res.status(400).json({error:"Invalid date of birth"}); update.dateOfBirth=d;} else update.dateOfBirth=null;
  }
  const user=await User.findByIdAndUpdate(req.user.id,{$set:update},{new:true,runValidators:true}).select("-passwordHash");
  await audit(req,"patient.profile_updated","User",user.id); res.json({user});
}));
router.post("/files/upload",auth,upload.single("file"),validateUploads,wrap(async(req,res)=>{
  if(!req.file) return res.status(400).json({error:"File is required"});
  const category=String(req.body.category||"patient_report");
  const allowed=req.user.role==="patient"?["patient_report","other"]:["other","other_qualification"];
  if(!allowed.includes(category)){return res.status(400).json({error:"Invalid file category"});}
  const record=await storeBuffer({ownerId:req.user.id,uploadedBy:req.user.id,category,originalName:req.file.originalname,mimeType:req.file.mimetype,buffer:req.file.buffer});
  await audit(req,"file.uploaded","PrivateFile",record.id,{category});
  res.status(201).json({file:{id:record.id,category:record.category,originalName:record.originalName,size:record.size,createdAt:record.createdAt}});
}));
router.get("/files/mine",auth,wrap(async(req,res)=>{
  const files=await PrivateFile.find({ownerId:req.user.id}).select("-storedName"); res.json({files});
}));
router.get("/files/:id/download",auth,wrap(async(req,res)=>{
  const file=await PrivateFile.findById(req.params.id);
  if(!file) return res.status(404).json({error:"File not found"});
  let permitted=String(file.ownerId)===String(req.user.id);
  let accessAction="";
  // Admins review doctor documents only; patient reports stay between the patient and their assigned doctor.
  if(!permitted && req.user.role==="admin" && ["doctor_photo","bmdc_certificate","degree_certificate","identity_document","other_qualification","other"].includes(file.category)){permitted=true;accessAction="admin.private_file_access";}
  if(!permitted && file.category==="consultation_recording" && ["doctor","patient"].includes(req.user.role)){
    permitted=!!(await Appointment.exists({_id:file.originalName.match(/consultation-([a-f0-9]{24})-/i)?.[1],$or:[{patientId:req.user.id},{doctorId:req.user.id}]}));
    if(permitted) accessAction="call.recording_access";
  }
  if(!permitted && req.user.role==="doctor" && file.category==="patient_report"){
    permitted=!!(await Appointment.exists({doctorId:req.user.id,patientId:file.ownerId,status:{$in:DOCTOR_ACCESS_STATUSES}}));
    if(permitted) accessAction="doctor.patient_file_access";
  }
  if(!permitted && ["report_ai_pdf","report_final_pdf"].includes(file.category)){
    const report=await MedicalReport.findOne({$or:[{aiPdfFileId:file._id},{finalPdfFileId:file._id}]});
    permitted=!!report && (String(report.patientId)===String(req.user.id) || (req.user.role==="doctor" && String(report.doctorId)===String(req.user.id)));
    if(permitted) accessAction="medical_report.pdf_access";
  }
  if(!permitted) return res.status(403).json({error:"Access denied"});
  if(accessAction) await audit(req,accessAction,"PrivateFile",file.id);
  const downloadPath=await resolveStoredFilePath(uploadDir,file);
  res.download(downloadPath,file.originalName,()=>{if(file.storageProvider==="gridfs") fs.unlink(downloadPath).catch(()=>{});});
}));
router.delete("/files/:id",auth,wrap(async(req,res)=>{
  const file=await PrivateFile.findOne({_id:req.params.id,ownerId:req.user.id,category:{$in:["patient_report","other"]}});
  if(!file) return res.status(404).json({error:"File not found"});
  if(file.storageProvider==="gridfs") await deleteGridFSFile(file.storedName); else {try{await fs.unlink(path.join(uploadDir,file.storedName));}catch{}}
  await file.deleteOne(); await audit(req,"file.deleted","PrivateFile",file.id);
  res.json({message:"File deleted"});
}));

router.post("/appointments",auth,allow("patient"),wrap(async(req,res)=>{
  const s=z.object({problem:z.string().min(5).max(4000),doctorId:z.string().optional(),consultationType:z.enum(["online","in_person"]).default("online")}).safeParse(req.body);
  if(!s.success) return res.status(400).json({error:"Please describe the reason for appointment"});
  if(s.data.doctorId && !await User.findOne({_id:s.data.doctorId,role:"doctor",status:"active"})) return res.status(400).json({error:"Selected doctor is unavailable"});
  const appt=await Appointment.create({patientId:req.user.id,doctorId:s.data.doctorId||null,problem:s.data.problem,consultationType:s.data.consultationType});
  await audit(req,"appointment.requested","Appointment",appt.id); res.status(201).json({appointment:appt});
}));
router.get("/appointments",auth,wrap(async(req,res)=>{
  const filter=req.user.role==="patient"?{patientId:req.user.id}:req.user.role==="doctor"?{doctorId:req.user.id}:{};
  const appointments=await Appointment.find(filter).populate("patientId","name email phone").populate("doctorId","name doctorProfile.specialty").sort({createdAt:-1});
  res.json({appointments});
}));
router.patch("/appointments/:id",auth,allow("doctor","admin"),wrap(async(req,res)=>{
  const s=z.object({status:z.enum(["awaiting_records","awaiting_tests","confirmed","waiting_room","in_progress","completed","cancelled","rejected","follow_up_required"]),scheduledAt:z.string().datetime().optional(),clinicianNote:z.string().max(3000).optional()}).safeParse(req.body);
  if(!s.success) return res.status(400).json({error:"Invalid appointment update"});
  const appt=await Appointment.findById(req.params.id); if(!appt) return res.status(404).json({error:"Appointment not found"});
  if(req.user.role==="doctor" && String(appt.doctorId)!==String(req.user.id)) return res.status(403).json({error:"Not assigned to this appointment"});
  if(CLOSED_STATUSES.includes(appt.status) && req.user.role!=="admin") return res.status(409).json({error:"This appointment is already closed"});
  if(s.data.status==="confirmed" && !s.data.scheduledAt) return res.status(400).json({error:"A confirmed appointment needs a scheduled date/time"});
  if(s.data.status==="confirmed" && !appt.doctorId) return res.status(400).json({error:"Assign a doctor before confirming"});
  if(s.data.scheduledAt && new Date(s.data.scheduledAt)<=new Date()) return res.status(400).json({error:"Scheduled time must be in the future"});
  if(s.data.status==="confirmed"&&s.data.scheduledAt&&req.user.role==="doctor"){
    const doctor=await User.findById(req.user.id);const when=new Date(s.data.scheduledAt);const localTime=when.toISOString().slice(11,16);
    const slots=doctor.doctorProfile?.availabilitySlots||[];
    if(slots.length&&!slots.some(x=>x.day===when.getUTCDay()&&x.start<=localTime&&x.end>localTime))return res.status(409).json({error:"The selected time is outside your published availability"});
    const blocked=(doctor.doctorProfile?.unavailablePeriods||[]).some(x=>when>=x.start&&when<=x.end);
    if(blocked)return res.status(409).json({error:"You marked this period as unavailable"});
  }
  Object.assign(appt,s.data); if(s.data.scheduledAt) appt.scheduledAt=new Date(s.data.scheduledAt);
  try { await appt.save(); } catch(err) { if(err?.code===11000) return res.status(409).json({error:"This doctor already has an appointment at that time. Choose another slot."}); throw err; }
  await audit(req,"appointment.updated","Appointment",appt.id,{status:appt.status});
  res.json({appointment:appt});
}));
router.post("/appointments/:id/cancel",auth,allow("patient"),wrap(async(req,res)=>{
  const appt=await Appointment.findOneAndUpdate({_id:req.params.id,patientId:req.user.id,status:{$in:["requested","awaiting_records","awaiting_tests","confirmed","follow_up_required"]}},{$set:{status:"cancelled"}},{new:true});
  if(!appt) return res.status(409).json({error:"This appointment can no longer be cancelled"});
  await audit(req,"appointment.cancelled_by_patient","Appointment",appt.id); res.json({appointment:appt});
}));
router.get("/appointments/:id/patient-record",auth,allow("doctor"),wrap(async(req,res)=>{
  const appt=await Appointment.findOne({_id:req.params.id,doctorId:req.user.id,status:{$in:DOCTOR_ACCESS_STATUSES}});
  if(!appt) return res.status(403).json({error:"Record is available only for your active appointments"});
  const patient=await User.findById(appt.patientId).select("name phone dateOfBirth gender bloodGroup allergies currentMedicines medicalHistory emergencyContact");
  const files=await PrivateFile.find({ownerId:appt.patientId,category:"patient_report"}).select("originalName mimeType size createdAt").sort({createdAt:-1});
  await audit(req,"doctor.patient_record_viewed","Appointment",appt.id);
  res.json({patient,files});
}));

router.get("/appointments/:id/messages",auth,wrap(async(req,res)=>{
  const appt=await Appointment.findById(req.params.id); if(!appt) return res.status(404).json({error:"Appointment not found"});
  const allowed=String(appt.patientId)===String(req.user.id)||String(appt.doctorId)===String(req.user.id);
  if(!allowed) return res.status(403).json({error:"Only participants can access this conversation"});
  res.json({messages:await Message.find({appointmentId:appt.id}).populate("senderId","name role").sort({createdAt:1})});
}));
router.post("/appointments/:id/messages",auth,wrap(async(req,res)=>{
  const appt=await Appointment.findById(req.params.id); if(!appt) return res.status(404).json({error:"Appointment not found"});
  const allowed=String(appt.patientId)===String(req.user.id)||String(appt.doctorId)===String(req.user.id);
  if(!allowed || !appt.doctorId) return res.status(403).json({error:"Conversation is not available"});
  const body=String(req.body.body||"").trim(); if(!body||body.length>5000) return res.status(400).json({error:"Message must be 1-5000 characters"});
  const message=await Message.create({appointmentId:appt.id,senderId:req.user.id,body});
  res.status(201).json({message});
}));

const reportFileUpload = multer({storage:multer.memoryStorage(),limits:{fileSize:12*1024*1024,files:1},fileFilter:(_req,file,cb)=>{
  const ok=["application/pdf","image/jpeg","image/png","image/webp"].includes(file.mimetype);
  cb(ok?null:new Error("Upload a PDF, JPG, PNG or WEBP report"),ok);
}});
router.post("/ai/report-file-analysis",auth,allow("patient"),reportFileUpload.single("file"),aiLimiter,wrap(async(req,res)=>{
  if(!req.file) return res.status(400).json({error:"Choose a PDF or image report first"});
  if(!config.openRouterKey) return res.status(503).json({error:"AI provider is not configured"});
  let extracted="";
  try {
    if(req.file.mimetype==="application/pdf") {
      const pdfModule=await import("pdf-parse");
      const parsePdf=pdfModule.default;
      const parsed=await parsePdf(req.file.buffer);
      extracted=String(parsed.text||"").trim();
    } else {
      // OCR is retained as a cross-check; the image is also sent to a vision-capable model.
      const {createWorker}=await import("tesseract.js");
      const worker=await createWorker("eng+ben");
      try { const result=await worker.recognize(req.file.buffer); extracted=String(result.data?.text||"").trim(); }
      finally { await worker.terminate(); }
    }
  } catch(e) {
    if(req.file.mimetype==="application/pdf") return res.status(422).json({error:"Could not extract text from this PDF. Try a text-based PDF or paste the report text manually."});
    // Vision analysis can still proceed if OCR fails for a supported image.
  }
  if(req.file.mimetype==="application/pdf" && extracted.length<20) return res.status(422).json({error:"No readable text was found in this PDF. Scanned PDF page OCR is not yet supported; upload a clear JPG/PNG or paste the report text."});
  if(extracted.length>12000) extracted=extracted.slice(0,12000);
  const system="You are a cautious medical-report explanation assistant. Extract only clearly visible test names, values, units and reference ranges. Preserve exact numbers and flag unreadable or uncertain text; never guess or silently correct OCR. Explain the report in plain language, separate observed results from general context, do not diagnose or prescribe, and do not infer missing values. If a result may be urgent, advise prompt contact with a qualified clinician without asserting a diagnosis. Do not repeat patient names, addresses, IDs or other identifiers. End by recommending clinician review.";
  const userContent=req.file.mimetype==="application/pdf"
    ? `Analyze this extracted PDF report text. Treat OCR/text uncertainty explicitly.\n\n${extracted}`
    : [{type:"text",text:`Analyze this medical report image directly. OCR cross-check (may be inaccurate):\n${extracted||"No usable OCR text was extracted."}\nRead visible content carefully; do not guess unclear numbers.`},{type:"image_url",image_url:{url:`data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`}}];
  const response=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"Authorization":`Bearer ${config.openRouterKey}`,"Content-Type":"application/json","HTTP-Referer":config.clientOrigin,"X-Title":"MedAI Hospital"},body:JSON.stringify({model:config.openRouterModel,messages:[{role:"system",content:system},{role:"user",content:userContent}],temperature:0.1})});
  if(!response.ok) return res.status(502).json({error:"AI provider request failed. Confirm that the configured OpenRouter model supports image input for image reports."});
  const data=await response.json(); const answer=data.choices?.[0]?.message?.content;
  if(!answer) return res.status(502).json({error:"AI response was empty"});
  await audit(req,"ai.report_file_analyzed","User",req.user.id,{mimeType:req.file.mimetype,extractedCharacters:extracted.length,vision:req.file.mimetype!=="application/pdf"});
  res.json({answer,extractedText:extracted,analysisMode:req.file.mimetype==="application/pdf"?"pdf_text":"image_vision_plus_ocr",disclaimer:"AI explanation only—not a diagnosis or prescription. OCR/vision may misread values. Check every value against the original and ask a qualified clinician to review it. The uploaded report content was sent to the configured AI provider."});
}));

router.post("/ai/report-analysis",auth,allow("patient"),aiLimiter,wrap(async(req,res)=>{
  if(!config.openRouterKey) return res.status(503).json({error:"AI provider is not configured"});
  const reportText=String(req.body.reportText||"").trim();
  if(reportText.length<20||reportText.length>12000) return res.status(400).json({error:"Paste report text between 20 and 12000 characters"});
  const system="You are a cautious medical-report explanation assistant. Explain only what the pasted report text says in plain language. Separate stated results from general context; do not diagnose, prescribe, change medication, or infer values missing from the text. Flag that units, reference ranges, age/sex context and lab methods matter. If a value appears potentially urgent, advise prompt contact with a qualified clinician without asserting a diagnosis. End by recommending review with the ordering clinician. Treat the text as potentially sensitive and do not repeat names or identifiers.";
  const response=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"Authorization":`Bearer ${config.openRouterKey}`,"Content-Type":"application/json","HTTP-Referer":config.clientOrigin,"X-Title":"MedAI Hospital"},body:JSON.stringify({model:config.openRouterModel,messages:[{role:"system",content:system},{role:"user",content:reportText}],temperature:0.1})});
  if(!response.ok) return res.status(502).json({error:"AI provider request failed"}); const data=await response.json(); const answer=data.choices?.[0]?.message?.content; if(!answer) return res.status(502).json({error:"AI response was empty"});
  await audit(req,"ai.report_text_analyzed","User",req.user.id,{characters:reportText.length}); res.json({answer,disclaimer:"AI explanation only—not a diagnosis. This feature does not read the uploaded PDF/image automatically; paste text carefully and have the ordering clinician review it."});
}));

// WebRTC signaling and consent-controlled consultation recording. Signals expire after 24 hours.
async function getCallParticipant(id,user){
  const appt=await Appointment.findById(id); if(!appt) return {error:"Appointment not found"};
  if(String(appt.patientId)!==String(user.id)&&String(appt.doctorId)!==String(user.id)) return {error:"Only the appointment participants can access calls"};
  if(!appt.doctorId) return {error:"A doctor must be assigned before starting a call"};
  if(appt.consultationType!=="online") return {error:"Audio/video calls are only available for online appointments"};
  if(CLOSED_STATUSES.includes(appt.status)) return {error:"This appointment is closed"};
  return {appt};
}
router.get("/appointments/:id/call-state",auth,wrap(async(req,res)=>{
  const r=await getCallParticipant(req.params.id,req.user); if(r.error) return res.status(403).json({error:r.error});
  res.json({consent:{patient:!!r.appt.recordingConsent?.patientAt,doctor:!!r.appt.recordingConsent?.doctorAt},role:req.user.role});
}));
router.post("/appointments/:id/call-heartbeat",auth,wrap(async(req,res)=>{
  const r=await getCallParticipant(req.params.id,req.user); if(r.error) return res.status(403).json({error:r.error});
  const active=req.body.active===true;
  if(active){
    const filter={appointmentId:r.appt.id,status:"active"};
    await CallSession.findOneAndUpdate(filter,{$set:{patientId:r.appt.patientId,doctorId:r.appt.doctorId,lastHeartbeatAt:new Date(),lastConnectionState:["starting","connected","disconnected","failed"].includes(req.body.connectionState)?req.body.connectionState:"starting"},$setOnInsert:{startedAt:new Date()}},{upsert:true,new:true});
  } else { await CallSession.updateMany({appointmentId:r.appt.id,status:"active"},{$set:{status:"ended",endedAt:new Date(),lastHeartbeatAt:new Date(),lastConnectionState:"ended"}}); }
  await User.updateOne({_id:req.user.id},{$set:{lastSeenAt:new Date()}});
  res.json({ok:true});
}));
router.post("/appointments/:id/recording-consent",auth,wrap(async(req,res)=>{
  const r=await getCallParticipant(req.params.id,req.user); if(r.error) return res.status(403).json({error:r.error});
  const accepted=req.body.accepted===true; const field=req.user.role==="patient"?"recordingConsent.patientAt":"recordingConsent.doctorAt";
  await Appointment.updateOne({_id:r.appt.id},{$set:{[field]:accepted?new Date():null}});
  await audit(req,accepted?"call.recording_consent_granted":"call.recording_consent_withdrawn","Appointment",r.appt.id,{role:req.user.role});
  const fresh=await Appointment.findById(r.appt.id); res.json({consent:{patient:!!fresh.recordingConsent?.patientAt,doctor:!!fresh.recordingConsent?.doctorAt}});
}));
router.get("/appointments/:id/call-signals",auth,wrap(async(req,res)=>{
  const r=await getCallParticipant(req.params.id,req.user); if(r.error) return res.status(403).json({error:r.error});
  const after=req.query.after?new Date(String(req.query.after)):new Date(Date.now()-60000);
  const signals=await CallSignal.find({appointmentId:r.appt.id,createdAt:{$gt:Number.isNaN(after.getTime())?new Date(Date.now()-60000):after},senderId:{$ne:req.user.id}}).sort({createdAt:1}).limit(100).select("type payload senderId createdAt");
  res.json({signals});
}));
router.post("/appointments/:id/call-signals",auth,wrap(async(req,res)=>{
  const r=await getCallParticipant(req.params.id,req.user); if(r.error) return res.status(403).json({error:r.error});
  const type=String(req.body.type||""); if(!["offer","answer","ice","hangup"].includes(type)) return res.status(400).json({error:"Invalid call signal"});
  const payload=req.body.payload; if(type!=="hangup"&&(payload==null||JSON.stringify(payload).length>100000)) return res.status(400).json({error:"Call signal payload is missing or too large"});
  const signal=await CallSignal.create({appointmentId:r.appt.id,senderId:req.user.id,type,payload:type==="hangup"?{}:payload});
  if(type==="offer") await CallSession.findOneAndUpdate({appointmentId:r.appt.id,status:"active"},{$set:{patientId:r.appt.patientId,doctorId:r.appt.doctorId,lastHeartbeatAt:new Date(),lastConnectionState:"starting"},$setOnInsert:{startedAt:new Date()}},{upsert:true,new:true});
  if(type==="hangup") await CallSession.updateMany({appointmentId:r.appt.id,status:"active"},{$set:{status:"ended",endedAt:new Date(),lastHeartbeatAt:new Date(),lastConnectionState:"ended"}});
  await User.updateOne({_id:req.user.id},{$set:{lastSeenAt:new Date()}});
  res.status(201).json({id:signal.id,createdAt:signal.createdAt});
}));
router.get("/appointments/:id/recordings",auth,wrap(async(req,res)=>{
  const r=await getCallParticipant(req.params.id,req.user); if(r.error) return res.status(403).json({error:r.error});
  const files=await PrivateFile.find({ownerId:r.appt.patientId,category:"consultation_recording",originalName:new RegExp("^consultation-"+String(r.appt.id)+"-")}).select("originalName mimeType size createdAt").sort({createdAt:-1});
  res.json({recordings:files});
}));
router.post("/appointments/:id/recording",auth,recordingUpload.single("file"),wrap(async(req,res)=>{
  const r=await getCallParticipant(req.params.id,req.user); if(r.error){return res.status(403).json({error:r.error});}
  if(!r.appt.recordingConsent?.patientAt||!r.appt.recordingConsent?.doctorAt){return res.status(403).json({error:"Both patient and doctor must consent before recording can be saved"});}
  if(!req.file) return res.status(400).json({error:"Recording file is required"});
  const file=await storeBuffer({ownerId:r.appt.patientId,uploadedBy:req.user.id,category:"consultation_recording",originalName:`consultation-${r.appt.id}-${Date.now()}${EXT_BY_MIME[req.file.mimetype]||".webm"}`,mimeType:req.file.mimetype,buffer:req.file.buffer});
  await audit(req,"call.recording_saved","Appointment",r.appt.id,{fileId:file.id,size:file.size});
  res.status(201).json({message:"Audio recording saved privately",file:{id:file.id,originalName:file.originalName,size:file.size}});
}));
router.post("/appointments/:id/recording-analysis",auth,aiLimiter,wrap(async(req,res)=>{
  const r=await getCallParticipant(req.params.id,req.user); if(r.error) return res.status(403).json({error:r.error});
  if(!r.appt.recordingConsent?.patientAt||!r.appt.recordingConsent?.doctorAt) return res.status(403).json({error:"Both participants must consent before analysis"});
  if(!config.openRouterKey) return res.status(503).json({error:"AI provider is not configured"});
  const transcript=String(req.body.transcript||"").trim(); if(transcript.length<20||transcript.length>12000) return res.status(400).json({error:"Provide a transcript between 20 and 12000 characters. Browser speech recognition or manual transcript can be used."});
  const system="You are a clinical documentation assistant, not a diagnosing or prescribing system. Summarize the supplied clinician-patient conversation into: 1) patient-reported symptoms and timeline, 2) relevant history/allergies/medicines explicitly mentioned, 3) clinician advice or plan explicitly stated, 4) follow-up questions or missing information, 5) urgent red flags mentioned. Distinguish patient statements from clinician statements. Never invent findings, diagnosis, or treatment. Mark uncertainty and say a licensed clinician must review. Do not make medication recommendations.";
  const response=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"Authorization":`Bearer ${config.openRouterKey}`,"Content-Type":"application/json","HTTP-Referer":config.clientOrigin,"X-Title":"MedAI Hospital"},body:JSON.stringify({model:config.openRouterModel,messages:[{role:"system",content:system},{role:"user",content:transcript}],temperature:0.1})});
  if(!response.ok) return res.status(502).json({error:"AI provider request failed"}); const data=await response.json(); const summary=data.choices?.[0]?.message?.content; if(!summary) return res.status(502).json({error:"AI response was empty"});
  await audit(req,"call.transcript_analyzed","Appointment",r.appt.id,{transcriptLength:transcript.length}); res.json({summary,disclaimer:"AI-generated draft for clinician review only. It is not a diagnosis, prescription, or verified medical record. Avoid sharing identifying details."});
}));

router.get("/doctors",wrap(async(_req,res)=>{
  const doctors=await User.find({role:"doctor",status:"active"}).select("name doctorProfile.specialty doctorProfile.qualifications doctorProfile.experienceYears");
  res.json({doctors});
}));

router.get("/medicines",auth,allow("patient","doctor","admin"),wrap(async(req,res)=>{
  const q=String(req.query.q||"").trim();
  if(q.length<2) return res.json({medicines:[],message:"Enter at least two letters"});
  if(q.length>60) return res.status(400).json({error:"Search text is too long"});
  const rx=new RegExp(escapeRegex(q),"i");
  const medicines=await Medicine.find({active:true,reviewStatus:"verified",$or:[{brand:rx},{generic:rx}]}).limit(20).select("brand generic strength form manufacturer country verifiedAt");
  res.json({medicines,notice:"Catalogue may be incomplete. Verify medicine information with a qualified pharmacist or clinician."});
}));

router.post("/ai/health-information",auth,aiLimiter,wrap(async(req,res)=>{
  if(!config.openRouterKey) return res.status(503).json({error:"AI provider is not configured"});
  const question=String(req.body.question||"").trim();
  if(question.length<5||question.length>6000) return res.status(400).json({error:"Question must be 5-6000 characters"});
  const system="You are MedAI Hospital's health information assistant. Provide general educational information only. Do not diagnose, prescribe, change medicine doses, or claim certainty. Encourage a qualified clinician for personal decisions. For possible emergencies such as severe breathing difficulty, chest pain, stroke symptoms, unconsciousness, or severe bleeding, tell the user to seek emergency care immediately; in Bangladesh they may call 999. Do not ask for identifying details. Explain uncertainty.";
  const response=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"Authorization":`Bearer ${config.openRouterKey}`,"Content-Type":"application/json","HTTP-Referer":config.clientOrigin,"X-Title":"MedAI Hospital"},body:JSON.stringify({model:config.openRouterModel,messages:[{role:"system",content:system},{role:"user",content:question}],temperature:0.2})});
  if(!response.ok) return res.status(502).json({error:"AI provider request failed"});
  const data=await response.json(); const answer=data.choices?.[0]?.message?.content;
  if(!answer) return res.status(502).json({error:"AI response was empty"});
  res.json({answer,disclaimer:"Informational only—not a diagnosis or prescription. Do not share personally identifying health information."});
}));

router.get("/admin/audit",auth,allow("admin"),wrap(async(req,res)=>{
  const events=await AuditEvent.find().sort({createdAt:-1}).limit(100).populate("actorId","name email role");
  res.json({events});
}));


// Admin access uses the normal email/ID + password login. MFA/OTP is intentionally disabled.

// --- Email password reset ---
function mailer(){
  if(!config.smtpHost||!config.smtpUser||!config.smtpPass) return null;
  return nodemailer.createTransport({host:config.smtpHost,port:config.smtpPort,secure:config.smtpSecure,auth:{user:config.smtpUser,pass:config.smtpPass}});
}
router.post("/auth/password-reset/request",sensitiveLimiter,wrap(async(req,res)=>{
  const email=String(req.body.email||"").toLowerCase().trim();
  const generic={message:"If the account exists and email is configured, a password reset link will be sent."};
  const user=await User.findOne({email}); if(!user) return res.json(generic);
  const transport=mailer(); if(!transport) return res.json(generic);
  const raw=crypto.randomBytes(32).toString("hex");
  user.passwordResetHash=crypto.createHash("sha256").update(raw).digest("hex");
  user.passwordResetExpires=new Date(Date.now()+30*60*1000); await user.save();
  const link=`${config.appPublicUrl.replace(/\/$/,"")}/reset-password?token=${raw}`;
  await transport.sendMail({from:config.smtpFrom,to:user.email,subject:"Reset your MedAI Hospital password",text:`Use this one-time link within 30 minutes: ${link}\nIf you did not request this, ignore this email.`});
  await audit(req,"auth.password_reset_requested","User",user.id);
  res.json(generic);
}));
router.post("/auth/password-reset/complete",sensitiveLimiter,wrap(async(req,res)=>{
  const token=String(req.body.token||""); const password=String(req.body.newPassword||"");
  if(!token||password.length<14||password.length>128) return res.status(400).json({error:"A valid token and new password of at least 14 characters are required"});
  const hash=crypto.createHash("sha256").update(token).digest("hex");
  const user=await User.findOne({passwordResetHash:hash,passwordResetExpires:{$gt:new Date()}}).select("+passwordResetHash +passwordResetExpires");
  if(!user) return res.status(400).json({error:"Reset link is invalid or expired"});
  user.passwordHash=await hashPassword(password); user.passwordChangedAt=new Date(); user.passwordResetHash=undefined; user.passwordResetExpires=undefined; await user.save();
  await audit(req,"auth.password_reset_completed","User",user.id);
  res.json({message:"Password reset completed. Sign in with your new password."});
}));

// --- Appointment availability and double-booking-safe scheduling ---
router.get("/doctors/:id/availability",wrap(async(req,res)=>{
  const from=new Date(String(req.query.from||Date.now())); const to=new Date(String(req.query.to||Date.now()+14*86400000));
  if(Number.isNaN(from.getTime())||Number.isNaN(to.getTime())||to<=from||to-from>31*86400000) return res.status(400).json({error:"Provide a valid date range up to 31 days"});
  const doctor=await User.findOne({_id:req.params.id,role:"doctor",status:"active"}).select("name");
  if(!doctor) return res.status(404).json({error:"Doctor not found"});
  const booked=await Appointment.find({doctorId:doctor.id,scheduledAt:{$gte:from,$lt:to},status:{$in:["confirmed","waiting_room","in_progress"]}}).select("scheduledAt status");
  res.json({doctor,bookedSlots:booked.map(x=>({scheduledAt:x.scheduledAt,status:x.status}))});
}));

// --- Clinician-authored prescriptions and tamper-evident signing ---
router.post("/appointments/:id/prescriptions",auth,allow("doctor"),wrap(async(req,res)=>{
  const appt=await Appointment.findById(req.params.id);
  if(!appt||String(appt.doctorId)!==String(req.user.id)) return res.status(403).json({error:"Only the assigned doctor can create a prescription"});
  if(!PRESCRIBE_STATUSES.includes(appt.status)) return res.status(409).json({error:"Confirm the appointment before prescribing"});
  const c=cleanRxItems(req.body.items); if(c.error) return res.status(400).json({error:c.error});
  const rx=await Prescription.create({appointmentId:appt.id,patientId:appt.patientId,doctorId:req.user.id,items:c.items,notes:String(req.body.notes||"").slice(0,4000)});
  await audit(req,"prescription.draft_created","Prescription",rx.id); res.status(201).json({prescription:rx});
}));
router.patch("/prescriptions/:id",auth,allow("doctor"),wrap(async(req,res)=>{
  const rx=await Prescription.findById(req.params.id);
  if(!rx||String(rx.doctorId)!==String(req.user.id)) return res.status(403).json({error:"Only the prescribing doctor can edit this prescription"});
  if(rx.status!=="draft") return res.status(409).json({error:"Signed prescriptions cannot be edited. Void it and write a new one."});
  const c=cleanRxItems(req.body.items); if(c.error) return res.status(400).json({error:c.error});
  rx.items=c.items; rx.notes=String(req.body.notes||"").slice(0,4000); await rx.save();
  await audit(req,"prescription.draft_updated","Prescription",rx.id); res.json({prescription:rx});
}));
router.delete("/prescriptions/:id",auth,allow("doctor"),wrap(async(req,res)=>{
  const rx=await Prescription.findById(req.params.id);
  if(!rx||String(rx.doctorId)!==String(req.user.id)) return res.status(403).json({error:"Only the prescribing doctor can delete this draft"});
  if(rx.status!=="draft") return res.status(409).json({error:"Only drafts can be deleted"});
  await rx.deleteOne(); await audit(req,"prescription.draft_deleted","Prescription",rx.id); res.json({message:"Draft deleted"});
}));
router.post("/prescriptions/:id/sign",auth,allow("doctor"),wrap(async(req,res)=>{
  const rx=await Prescription.findById(req.params.id).populate("doctorId","name doctorProfile.bmdcNumber doctorProfile.signatureFileId");
  if(!rx||String(rx.doctorId._id)!==String(req.user.id)) return res.status(403).json({error:"Only the prescribing doctor can sign this prescription"});
  if(rx.status!=="draft") return res.status(409).json({error:"Only draft prescriptions can be signed"});
  if(!config.signingPrivateKey||!config.signingPublicKey) return res.status(503).json({error:"Prescription signing keypair is not configured. Generate and set the PRESCRIPTION_SIGNING_PRIVATE_KEY_BASE64 and PRESCRIPTION_SIGNING_PUBLIC_KEY_BASE64 environment variables."});
  const signatureFileId=rx.doctorId.doctorProfile?.signatureFileId;
  const signatureFile=signatureFileId?await PrivateFile.findOne({_id:signatureFileId,ownerId:req.user.id,category:"doctor_signature"}):null;
  if(!signatureFile) return res.status(409).json({error:"Upload your permanent signature in your doctor profile before approving prescriptions"});
  rx.signatureImageFileId=signatureFile._id;
  rx.signatureImageHash=crypto.createHash("sha256").update(await readStoredFileBuffer(uploadDir,signatureFile)).digest("hex");
  rx.signerName=rx.doctorId.name; rx.signerBmdc=rx.doctorId.doctorProfile?.bmdcNumber||""; rx.signedAt=new Date();
  const canonical=prescriptionCanonical(rx);
  const bytes=Buffer.from(canonical,"utf8");
  const signature=crypto.sign(null,bytes,config.signingPrivateKey);
  rx.signatureHash=crypto.createHash("sha256").update(bytes).digest("hex");
  rx.signatureAlgorithm="Ed25519"; rx.signatureValue=signature.toString("base64");
  rx.publicKeyFingerprint=crypto.createHash("sha256").update(config.signingPublicKey).digest("hex");
  rx.status="signed";
  const signatureBytes=await readStoredFileBuffer(uploadDir,signatureFile);
  const patient=await User.findById(rx.patientId).select("name");
  const pdfBuffer=await makeTextPdf("MedAI Hospital - Signed Prescription",["FINALIZED / DOCTOR-SIGNED",`Patient: ${patient?.name||"Patient"}`,`Doctor: ${rx.signerName}`,`BMDC: ${rx.signerBmdc||"Not provided"}`,`Date: ${rx.signedAt.toISOString()}`,"",...rx.items.map((x,i)=>`${i+1}. ${x.generic} ${x.strength||""} ${x.form||""} | Dose: ${x.dose} | Frequency: ${x.frequency} | Duration: ${x.duration} | ${x.instructions||""}`),"",`Notes: ${rx.notes||"None"}`,"","Permanent doctor signature image is retained securely with this finalized prescription."],signatureBytes,signatureFile.mimeType);
  const pdfFile=await storeBuffer({ownerId:rx.patientId,uploadedBy:req.user.id,category:"report_final_pdf",originalName:"signed-prescription.pdf",mimeType:"application/pdf",buffer:pdfBuffer});rx.pdfFileId=pdfFile._id;
  await rx.save(); await notify(rx.patientId,"prescription_issued","New prescription issued","Your doctor has issued a signed prescription. It is available in your prescription history.","Prescription",rx.id);
  await audit(req,"prescription.signed","Prescription",rx.id,{signatureHash:rx.signatureHash,algorithm:"Ed25519",signatureImageHash:rx.signatureImageHash});
  res.json({prescription:rx,signature:{algorithm:"Ed25519",hash:rx.signatureHash,value:rx.signatureValue,publicKeyFingerprint:rx.publicKeyFingerprint,signedAt:rx.signedAt,signer:rx.signerName,signatureImageFileId:rx.signatureImageFileId,pdfFileId:rx.pdfFileId},notice:"Cryptographic in-app signature and permanent signature-image snapshot. This is not a government-issued qualified digital certificate."});
}));
router.get("/prescriptions/:id/verify",auth,wrap(async(req,res)=>{
  const rx=await Prescription.findById(req.params.id);
  if(!rx) return res.status(404).json({error:"Prescription not found"});
  const allowed=String(rx.patientId)===String(req.user.id)||String(rx.doctorId)===String(req.user.id)||req.user.role==="admin";
  if(!allowed) return res.status(403).json({error:"Access denied"});
  if(rx.status!=="signed"||!rx.signatureValue||!config.signingPublicKey) return res.json({valid:false,reason:"Not signed or verification key unavailable"});
  const canonical=prescriptionCanonical(rx);
  const bytes=Buffer.from(canonical,"utf8");
  const valid=crypto.verify(null,bytes,config.signingPublicKey,Buffer.from(rx.signatureValue,"base64"));
  const hash=crypto.createHash("sha256").update(bytes).digest("hex");
  res.json({valid:valid&&hash===rx.signatureHash,algorithm:rx.signatureAlgorithm,signer:rx.signerName,signedAt:rx.signedAt,hashMatches:hash===rx.signatureHash});
}));
router.get("/prescriptions/mine",auth,wrap(async(req,res)=>{
  // Patients only see signed/voided prescriptions, never drafts.
  const filter=req.user.role==="patient"?{patientId:req.user.id,status:{$in:["signed","voided"]}}:req.user.role==="doctor"?{doctorId:req.user.id}:{};
  const prescriptions=await Prescription.find(filter).populate("doctorId","name doctorProfile.specialty doctorProfile.bmdcNumber").populate("patientId","name").sort({createdAt:-1}).limit(200);
  res.json({prescriptions});
}));
router.post("/prescriptions/:id/void",auth,allow("doctor"),wrap(async(req,res)=>{
  const rx=await Prescription.findById(req.params.id); if(!rx||String(rx.doctorId)!==String(req.user.id)) return res.status(403).json({error:"Only prescribing doctor can void"});
  if(rx.status!=="signed") return res.status(409).json({error:"Only signed prescriptions can be voided"});
  rx.status="voided"; rx.voidReason=String(req.body.reason||"Correction required").slice(0,500); await rx.save();
  await audit(req,"prescription.voided","Prescription",rx.id); res.json({message:"Prescription voided. Create a corrected new prescription."});
}));

// --- Medicine catalogue bulk import (CSV/JSON) ---
router.post("/admin/medicines/import",auth,allow("admin"),wrap(async(req,res)=>{
  const rows=Array.isArray(req.body.records)?req.body.records:[];
  if(!rows.length||rows.length>5000) return res.status(400).json({error:"Provide 1-5000 medicine records per batch"});
  const sourceName=String(req.body.sourceName||"").slice(0,120), sourceUrl=String(req.body.sourceUrl||"").slice(0,500), sourceLicense=String(req.body.sourceLicense||"").slice(0,200);
  if(!sourceName||!sourceUrl||!sourceLicense) return res.status(400).json({error:"Source name, source URL and data-use/license basis are required"});
  let skipped=0; const ops=[]; const now=new Date();
  for(const r of rows){
    const brand=String(r.brand||r.display||"").trim().slice(0,200), generic=String(r.generic||r.ingredient||"").trim().slice(0,200);
    if(!brand||!generic){skipped++;continue;}
    const reg=String(r.registrationNumber||"").trim();
    const filter=reg?{registrationNumber:reg}:{brand,generic,strength:String(r.strength||""),form:String(r.form||"")};
    // reviewStatus is set only when a record is first inserted, so re-importing never un-verifies reviewed entries.
    ops.push({updateOne:{filter,update:{$set:{brand,generic,strength:String(r.strength||"").slice(0,60),form:String(r.form||"").slice(0,60),manufacturer:String(r.manufacturer||"").slice(0,150),country:"Bangladesh",registrationNumber:reg,sourceName,sourceUrl,sourceLicense,sourceCheckedAt:now,active:true},$setOnInsert:{reviewStatus:"needs_review"}},upsert:true}});
  }
  if(ops.length) await Medicine.bulkWrite(ops,{ordered:false});
  await audit(req,"medicine.catalogue_imported","Medicine","",{imported:ops.length,skipped,sourceName});
  res.json({imported:ops.length,skipped,reviewStatus:"needs_review",message:"New entries are not clinically verified until reviewed by an authorized catalogue reviewer."});
}));

router.get("/admin/medicines/review",auth,allow("admin"),wrap(async(req,res)=>{
  const page=Math.max(1,Number(req.query.page)||1), limit=50;
  const q=String(req.query.q||"").trim().slice(0,60);
  const filter={reviewStatus:"needs_review"};
  if(q){const rx=new RegExp(escapeRegex(q),"i"); filter.$or=[{brand:rx},{generic:rx}];}
  const [records,total]=await Promise.all([Medicine.find(filter).sort({brand:1}).skip((page-1)*limit).limit(limit),Medicine.countDocuments(filter)]);
  res.json({records,total,page,pages:Math.max(1,Math.ceil(total/limit))});
}));
router.patch("/admin/medicines/:id/review",auth,allow("admin"),wrap(async(req,res)=>{
  const status=String(req.body.status||""); if(!["verified","needs_review","rejected"].includes(status)) return res.status(400).json({error:"Invalid review status"});
  const record=await Medicine.findByIdAndUpdate(req.params.id,{reviewStatus:status,verifiedAt:status==="verified"?new Date():null},{new:true});
  if(!record) return res.status(404).json({error:"Medicine record not found"});
  await audit(req,"medicine.catalogue_reviewed","Medicine",record.id,{status}); res.json({record});
}));
router.post("/admin/medicines/review-bulk",auth,allow("admin"),wrap(async(req,res)=>{
  const status=String(req.body.status||""); const ids=Array.isArray(req.body.ids)?req.body.ids.map(String):[];
  if(!["verified","rejected"].includes(status)) return res.status(400).json({error:"Invalid review status"});
  if(!ids.length||ids.length>200) return res.status(400).json({error:"Select 1-200 records"});
  const result=await Medicine.updateMany({_id:{$in:ids},reviewStatus:"needs_review"},{$set:{reviewStatus:status,verifiedAt:status==="verified"?new Date():null}});
  await audit(req,"medicine.catalogue_bulk_reviewed","Medicine","",{status,count:result.modifiedCount});
  res.json({updated:result.modifiedCount});
}));
router.get("/doctor/unassigned-appointment-requests",auth,allow("doctor"),wrap(async(req,res)=>{
  const requests=await Appointment.find({doctorId:null,status:"requested"}).populate("patientId","name").sort({createdAt:1}); res.json({requests});
}));
router.post("/appointments/:id/claim",auth,allow("doctor"),wrap(async(req,res)=>{
  const doctor=await User.findOne({_id:req.user.id,role:"doctor",status:"active"}); if(!doctor) return res.status(403).json({error:"Verified doctor account required"});
  const appt=await Appointment.findOneAndUpdate({_id:req.params.id,doctorId:null,status:"requested"},{$set:{doctorId:req.user.id}},{new:true});
  if(!appt) return res.status(409).json({error:"This request was already assigned or is no longer available"});
  const unassignedReports=await MedicalReport.find({patientId:appt.patientId,doctorId:null,status:{$in:["pending_doctor_review","under_review","changes_requested"]}}).select("_id");
  if(unassignedReports.length){await MedicalReport.updateMany({_id:{$in:unassignedReports.map(x=>x._id)}},{$set:{doctorId:req.user.id}});for(const report of unassignedReports)await notify(req.user.id,"report_review_requested","Report awaiting review","A patient you have just accepted has a report awaiting review.","MedicalReport",report.id);}
  await audit(req,"appointment.claimed","Appointment",appt.id,{reportsAssigned:unassignedReports.length}); res.json({appointment:appt});
}));

router.get("/admin/users",auth,allow("admin"),wrap(async(req,res)=>{
  const role=["patient","doctor"].includes(String(req.query.role))?String(req.query.role):"doctor";
  const users=await User.find({role,status:{$in:["active","suspended"]}}).select("name email phone status role doctorProfile.specialty doctorProfile.bmdcNumber createdAt").sort({createdAt:-1}).limit(200);
  res.json({users});
}));
router.post("/admin/users/:id/status",auth,allow("admin"),wrap(async(req,res)=>{
  const status=String(req.body.status||""); if(!["active","suspended"].includes(status)) return res.status(400).json({error:"Invalid status"});
  const user=await User.findOne({_id:req.params.id,role:{$in:["patient","doctor"]},status:{$in:["active","suspended"]}});
  if(!user) return res.status(404).json({error:"User not found"});
  user.status=status; await user.save(); await audit(req,`user.${status}`,"User",user.id);
  res.json({user:{_id:user.id,status:user.status}});
}));


// --- Permanent doctor signature management (private image, retained for historical signed records) ---
const signatureUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:2*1024*1024,files:1},fileFilter:(_req,file,cb)=>{const ok=["image/png","image/jpeg"].includes(file.mimetype);cb(ok?null:new Error("Upload a PNG or JPG signature image"),ok);}});
async function storeBuffer({ownerId,uploadedBy,category,originalName,mimeType,buffer}){
  const actual=detectMimeFromBytes(buffer);
  const compatible=actual===mimeType || (actual==="video/webm"&&mimeType.startsWith("audio/webm")) || (actual==="video/mp4"&&["audio/mp4","video/quicktime"].includes(mimeType));
  if(!compatible) throw Object.assign(new Error("File content does not match its declared type"),{status:400});
  const safeName=String(originalName||"document").replace(/[\\/\x00-\x1f]/g,"_").slice(0,180);
  const gridId=await storeGridFSBuffer({buffer,filename:safeName,mimeType,metadata:{ownerId:String(ownerId),category}});
  try{return await PrivateFile.create({ownerId,uploadedBy,category,originalName:safeName,storedName:String(gridId),storageProvider:"gridfs",mimeType,size:buffer.length});}
  catch(e){await deleteGridFSFile(gridId).catch(()=>{});throw e;}
}
async function notify(userId,type,title,message,resourceType,resourceId){return Notification.create({userId,type,title,message,resourceType,resourceId:String(resourceId||"")});}
router.post("/doctor/signature",auth,allow("doctor"),signatureUpload.single("file"),wrap(async(req,res)=>{
  if(!req.file) return res.status(400).json({error:"Choose a signature image"});
  const file=await storeBuffer({ownerId:req.user.id,uploadedBy:req.user.id,category:"doctor_signature",originalName:req.file.originalname,mimeType:req.file.mimetype,buffer:req.file.buffer});
  const doctor=await User.findById(req.user.id); doctor.doctorProfile.signatureFileId=file._id; doctor.doctorProfile.signatureUpdatedAt=new Date(); await doctor.save();
  await audit(req,"doctor.signature_updated","User",doctor.id,{signatureFileId:file.id});
  res.status(201).json({signature:{fileId:file.id,originalName:file.originalName,updatedAt:doctor.doctorProfile.signatureUpdatedAt}});
}));
router.get("/doctor/signature",auth,allow("doctor"),wrap(async(req,res)=>{
  const doctor=await User.findById(req.user.id); const file=doctor.doctorProfile?.signatureFileId?await PrivateFile.findOne({_id:doctor.doctorProfile.signatureFileId,ownerId:req.user.id,category:"doctor_signature"}):null;
  res.json({signature:file?{fileId:file.id,originalName:file.originalName,updatedAt:doctor.doctorProfile.signatureUpdatedAt}:null});
}));
router.get("/prescriptions/:id/signature-image",auth,wrap(async(req,res)=>{
  const rx=await Prescription.findById(req.params.id); if(!rx||rx.status!=="signed"||!rx.signatureImageFileId) return res.status(404).json({error:"Signed signature image not found"});
  if(String(rx.patientId)!==String(req.user.id)&&String(rx.doctorId)!==String(req.user.id)) return res.status(403).json({error:"Access denied"});
  const file=await PrivateFile.findById(rx.signatureImageFileId); if(!file) return res.status(404).json({error:"Signature image unavailable"});
  res.setHeader("Cache-Control","private, no-store"); res.type(file.mimeType); const imagePath=await resolveStoredFilePath(uploadDir,file); res.sendFile(imagePath,()=>{if(file.storageProvider==="gridfs") fs.unlink(imagePath).catch(()=>{});});
}));

// --- ReportSimple-inspired report pipeline: OCR -> deterministic verification -> AI explanation -> doctor review ---
async function extractReportText(file){
  if(file.mimeType==="application/pdf"){
    const pdfModule=await import("pdf-parse"); const parsePdf=pdfModule.default;
    const parsed=await parsePdf(await readStoredFileBuffer(uploadDir,file));
    let text=String(parsed.text||"").trim();
    if(text.length<30){
      // ReportSimple's scanned-PDF path uses Poppler to rasterize each page before Tesseract OCR.
      const tempDir=await fs.mkdtemp(path.join(os.tmpdir(),"medai-pdf-"));
      try{
        const input=await resolveStoredFilePath(uploadDir,file),prefix=path.join(tempDir,"page");
        await execFileAsync("pdftoppm",["-png","-r","180",input,prefix],{timeout:120000,maxBuffer:2*1024*1024});
        const pages=(await fs.readdir(tempDir)).filter(n=>n.endsWith(".png")).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
        if(!pages.length) throw new Error("No PDF pages were rendered");
        const {createWorker}=await import("tesseract.js"); const worker=await createWorker("eng+ben");
        try{for(const page of pages){const out=await worker.recognize(await fs.readFile(path.join(tempDir,page)));text+="\n"+String(out.data?.text||"");}}finally{await worker.terminate();}
      }finally{await fs.rm(tempDir,{recursive:true,force:true});}
    }
    return text;
  }
  const {createWorker}=await import("tesseract.js"); const worker=await createWorker("eng+ben");
  try{const out=await worker.recognize(await readStoredFileBuffer(uploadDir,file));return String(out.data?.text||"").trim();}finally{await worker.terminate();}
}
async function requestReportAI(extracted,verified){
  if(!config.openRouterKey) throw Object.assign(new Error("AI provider is not configured"),{status:503});
  const system="You are a cautious medical report explainer. Never diagnose or prescribe. Treat numeric status supplied in VERIFIED FINDINGS as authoritative and never change it. Explain uncertainty, units, and reference ranges. If data is unclear, explicitly say so. Respond in clear English and do not repeat personal identifiers.";
  const payload={extractedText:extracted.slice(0,12000),verifiedFindings:verified};
  const response=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${config.openRouterKey}`,"Content-Type":"application/json","HTTP-Referer":config.clientOrigin,"X-Title":"MedAI Hospital"},body:JSON.stringify({model:config.openRouterModel,messages:[{role:"system",content:system},{role:"user",content:JSON.stringify(payload)}],temperature:0.1})});
  if(!response.ok) throw Object.assign(new Error("AI provider request failed"),{status:502}); const data=await response.json(); const answer=data.choices?.[0]?.message?.content;
  if(!answer) throw Object.assign(new Error("AI response was empty"),{status:502}); return String(answer).slice(0,12000);
}
router.post("/reports/:fileId/analyze",auth,allow("patient"),aiLimiter,wrap(async(req,res)=>{
  const file=await PrivateFile.findOne({_id:req.params.fileId,ownerId:req.user.id,category:"patient_report"}); if(!file) return res.status(404).json({error:"Patient report file not found"});
  if(!config.openRouterKey) return res.status(503).json({error:"AI provider is not configured"});
  const appt=await Appointment.findOne({patientId:req.user.id,doctorId:{$ne:null},status:{$in:DOCTOR_ACCESS_STATUSES}}).sort({updatedAt:-1});
  const report=await MedicalReport.create({patientId:req.user.id,doctorId:appt?.doctorId||null,originalFileId:file._id,status:"ai_processing"});
  try{
    let extracted="";
    try { extracted=(await extractReportText(file)).slice(0,12000); }
    catch(e) { if(file.mimeType==="application/pdf") throw e; /* image vision can proceed if OCR fails */ }
    if(extracted.length<20 && file.mimeType==="application/pdf") throw Object.assign(new Error("No readable report text found in PDF. Check Poppler/Tesseract availability or upload a clearer report."),{status:422});
    // Images are sent to a vision-capable model as well as OCR; PDF files use extracted/OCR text.
    const extractionPrompt="Extract medical laboratory findings. Return only JSON {\"findings\":[{\"name\":\"\",\"value\":\"exactly as printed\",\"unit\":\"\",\"normal_range\":\"exactly as printed\"}]}. Never infer or correct numbers. Flag unreadable content. OCR cross-check: "+(extracted||"No usable OCR text was extracted; inspect the attached report image directly.");
    const extractionContent=file.mimeType==="application/pdf"?extractionPrompt:[{type:"text",text:extractionPrompt},{type:"image_url",image_url:{url:`data:${file.mimeType};base64,${(await readStoredFileBuffer(uploadDir,file)).toString("base64")}`}}];
    let candidates=[];
    const extractResponse=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${config.openRouterKey}`,"Content-Type":"application/json","HTTP-Referer":config.clientOrigin,"X-Title":"MedAI Hospital"},body:JSON.stringify({model:config.openRouterModel,messages:[{role:"system",content:"You extract medical laboratory values from supplied text or report images. Copy every numeric value exactly. Do not interpret, diagnose, normalize, or silently fix OCR. Never guess unclear values. Return valid JSON only with findings array containing name, value, unit, normal_range."},{role:"user",content:extractionContent}],temperature:0.0})});
    if(!extractResponse.ok) throw Object.assign(new Error("AI extraction request failed"),{status:502});
    const extractData=await extractResponse.json(); const extraction=String(extractData.choices?.[0]?.message?.content||"");
    try{const match=extraction.match(/\{[\s\S]*\}/); candidates=JSON.parse(match?.[0]||"{}").findings||[];}catch{candidates=[];}
    const verified=verifyFindings(candidates);
    const explanation=await requestReportAI(extracted,verified.findings);
    const urgencyLevel=urgency(verified.findings);
    report.extractedText=extracted;report.analysisMode=file.mimeType==="application/pdf"?"pdf_text_ocr":"image_vision_ocr";report.findings=verified.findings;report.urgencyLevel=urgencyLevel;report.aiExplanation=explanation;report.status="pending_doctor_review";
    const aiPdf=await makeTextPdf("MedAI Hospital - AI Medical Report Analysis",[
      "AI-GENERATED - NOT DOCTOR-APPROVED",`Patient: ${req.user.name}`,`Created: ${new Date().toISOString()}`,`Automated review priority: ${urgencyLevel} (heuristic only)`,"",`Findings verified: ${verified.stats.verified}; unclear: ${verified.stats.unchecked}`,
      ...verified.findings.map(f=>`${f.name}: ${f.value} ${f.unit} | Range: ${f.normalRange||"not stated"} | ${f.status.toUpperCase()} | ${f.check}`),"","AI Explanation:",explanation,"","Educational information only. Not a diagnosis or treatment recommendation. Doctor review required."
    ]);
    const pdfFile=await storeBuffer({ownerId:req.user.id,uploadedBy:req.user.id,category:"report_ai_pdf",originalName:"AI-report-analysis.pdf",mimeType:"application/pdf",buffer:aiPdf});
    report.aiPdfFileId=pdfFile._id; await report.save();
    if(report.doctorId) await notify(report.doctorId,"report_review_requested","Report awaiting review","A patient report has completed AI analysis and needs your review.","MedicalReport",report.id);
    await audit(req,"medical_report.ai_completed","MedicalReport",report.id,{findings:verified.stats.total,verified:verified.stats.verified,unchecked:verified.stats.unchecked});
    res.status(201).json({report:{id:report.id,status:report.status,urgencyLevel:report.urgencyLevel,findings:report.findings,aiExplanation:report.aiExplanation,aiPdfFileId:report.aiPdfFileId,doctorAssigned:!!report.doctorId},disclaimer:"AI-generated and not doctor-approved. Numeric labels are rule-engine checks, not a diagnosis. OCR decimal errors and lab-specific reference ranges require verification against the original report."});
  }catch(e){report.status="uploaded";await report.save();throw e;}
}));
router.get("/reports/mine",auth,wrap(async(req,res)=>{
  const filter=req.user.role==="patient"?{patientId:req.user.id}:req.user.role==="doctor"?{doctorId:req.user.id}:{};
  const reports=await MedicalReport.find(filter).populate("patientId","name").populate("doctorId","name doctorProfile.specialty").sort({createdAt:-1}).limit(200);
  res.json({reports});
}));
router.get("/doctor/reports/pending",auth,allow("doctor"),wrap(async(req,res)=>{
  const reports=await MedicalReport.find({doctorId:req.user.id,status:{$in:["pending_doctor_review","under_review","changes_requested"]}}).populate("patientId","name email").populate("originalFileId","originalName mimeType size").sort({createdAt:1});
  res.json({reports});
}));
router.get("/reports/:id",auth,wrap(async(req,res)=>{
  const report=await MedicalReport.findById(req.params.id).populate("patientId","name").populate("doctorId","name doctorProfile.specialty"); if(!report) return res.status(404).json({error:"Report not found"});
  const permitted=String(report.patientId._id)===String(req.user.id)||(req.user.role==="doctor"&&String(report.doctorId?._id)===String(req.user.id))||req.user.role==="admin";
  if(!permitted) return res.status(403).json({error:"Access denied"});
  res.json({report});
}));
router.post("/reports/:id/review",auth,allow("doctor"),wrap(async(req,res)=>{
  const action=String(req.body.action||""); if(!["start","comment","request_changes","reject","approve"].includes(action)) return res.status(400).json({error:"Invalid review action"});
  const report=await MedicalReport.findOne({_id:req.params.id,doctorId:req.user.id}); if(!report) return res.status(404).json({error:"Assigned report not found"});
  if(["approved","signed","delivered","rejected"].includes(report.status)) return res.status(409).json({error:"This report review is already finalized"});
  const comment=String(req.body.comment||"").trim().slice(0,4000);
  if(action==="start") report.status="under_review";
  if(action==="comment"){if(!comment)return res.status(400).json({error:"Add a review comment"});report.status="under_review";report.reviewComment=comment;}
  if(action==="request_changes"){if(!comment)return res.status(400).json({error:"Explain what needs to be corrected"});report.status="changes_requested";report.reviewComment=comment;await notify(report.patientId,"report_changes_requested","Changes requested",comment,"MedicalReport",report.id);}
  if(action==="reject"){if(!comment)return res.status(400).json({error:"A rejection reason is required"});report.status="rejected";report.rejectionReason=comment;report.signatureImageFileId=null;report.signedAt=null;await notify(report.patientId,"report_rejected","Report rejected",comment,"MedicalReport",report.id);}
  if(action==="approve"){
    const doctor=await User.findById(req.user.id); const sigId=doctor.doctorProfile?.signatureFileId;
    const signature= sigId?await PrivateFile.findOne({_id:sigId,ownerId:req.user.id,category:"doctor_signature"}):null;
    if(!signature) return res.status(409).json({error:"Upload your permanent signature in your doctor profile before approving reports"});
    report.status="signed";report.reviewComment=comment||report.reviewComment;report.reviewedAt=new Date();report.signedAt=new Date();report.signatureImageFileId=signature._id;report.signatureImageHash=crypto.createHash("sha256").update(await readStoredFileBuffer(uploadDir,signature)).digest("hex");
    const signatureBytes=await readStoredFileBuffer(uploadDir,signature);
    const patient=await User.findById(report.patientId).select("name");
    const finalPdf=await makeTextPdf("MedAI Hospital - Doctor Reviewed Medical Report",[
      "DOCTOR-APPROVED REPORT",`Patient: ${patient?.name||"Patient"}`,`Reviewing doctor: ${doctor.name}`,`BMDC: ${doctor.doctorProfile?.bmdcNumber||"Not provided"}`,`Approved: ${report.signedAt.toISOString()}`,"",...report.findings.map(f=>`${f.name}: ${f.value} ${f.unit} | Range: ${f.normalRange||"not stated"} | ${f.status.toUpperCase()}`),"","Doctor review:",report.reviewComment||"Reviewed and approved.","","Original AI analysis follows (not a diagnosis):",report.aiExplanation||"","","Doctor signature is stored as a protected image snapshot on this finalized record."
    ],signatureBytes,signature.mimeType);
    const finalFile=await storeBuffer({ownerId:report.patientId,uploadedBy:req.user.id,category:"report_final_pdf",originalName:"doctor-approved-report.pdf",mimeType:"application/pdf",buffer:finalPdf});report.finalPdfFileId=finalFile._id;
    await notify(report.patientId,"report_approved","Doctor-approved report available","Your doctor has reviewed and approved a medical report.","MedicalReport",report.id);
  }
  await report.save(); await audit(req,`medical_report.${action}`,"MedicalReport",report.id,{status:report.status});
  res.json({report:{id:report.id,status:report.status,reviewComment:report.reviewComment,rejectionReason:report.rejectionReason,finalPdfFileId:report.finalPdfFileId}});
}));
router.get("/notifications/mine",auth,wrap(async(req,res)=>{const notifications=await Notification.find({userId:req.user.id}).sort({createdAt:-1}).limit(100);res.json({notifications});}));
router.post("/notifications/:id/read",auth,wrap(async(req,res)=>{const n=await Notification.findOneAndUpdate({_id:req.params.id,userId:req.user.id},{$set:{readAt:new Date()}},{new:true});if(!n)return res.status(404).json({error:"Notification not found"});res.json({notification:n});}));

// Doctor availability profile settings; booking still relies on the existing unique appointment-slot index.
router.patch("/doctor/availability",auth,allow("doctor"),wrap(async(req,res)=>{
  const slots=Array.isArray(req.body.slots)?req.body.slots:[]; if(slots.length>21)return res.status(400).json({error:"Maximum 21 availability slots"});
  for(const x of slots){if(!Number.isInteger(x.day)||x.day<0||x.day>6||!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.start||"")||!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.end||"")||x.start>=x.end)return res.status(400).json({error:"Invalid availability slot"});}
  const doctor=await User.findById(req.user.id);doctor.doctorProfile.availabilitySlots=slots;await doctor.save();await audit(req,"doctor.availability_updated","User",doctor.id,{slotCount:slots.length});res.json({slots:doctor.doctorProfile.availabilitySlots});
}));

router.post("/doctor/unavailable-periods",auth,allow("doctor"),wrap(async(req,res)=>{
  const start=new Date(req.body.start),end=new Date(req.body.end),reason=String(req.body.reason||"").slice(0,300);
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start||end-start>90*86400000)return res.status(400).json({error:"Provide a valid unavailable period up to 90 days"});
  const doctor=await User.findById(req.user.id);doctor.doctorProfile.unavailablePeriods=[...(doctor.doctorProfile.unavailablePeriods||[]),{start,end,reason}].slice(-100);await doctor.save();await audit(req,"doctor.unavailable_period_added","User",doctor.id,{start,end});res.status(201).json({periods:doctor.doctorProfile.unavailablePeriods});
}));

// Admin-initiated password reset: temporary password is returned once, plaintext is never stored.
router.post("/admin/users/:id/reset-password",auth,allow("admin"),sensitiveLimiter,wrap(async(req,res)=>{
  const user=await User.findOne({_id:req.params.id,role:{$in:["patient","doctor"]}});if(!user)return res.status(404).json({error:"User not found"});
  const temporaryPassword=crypto.randomBytes(18).toString("base64url");user.passwordHash=await hashPassword(temporaryPassword);user.passwordChangedAt=new Date();await user.save();
  await audit(req,"admin.password_reset","User",user.id,{targetRole:user.role});
  res.json({message:"Password reset. Share this temporary password securely; it is shown only once.",temporaryPassword});
}));

export default router;
