import mongoose from "mongoose";
const { Schema, model } = mongoose;
const userSchema = new Schema({
  name: {type:String, required:true, trim:true, maxlength:120},
  email: {type:String, required:true, unique:true, lowercase:true, trim:true},
  phone: {type:String, default:"", maxlength:30},
  passwordHash: {type:String, required:true, select:false},
  role: {type:String, enum:["patient","doctor","admin"], required:true},
  status: {type:String, enum:["active","pending_verification","rejected","suspended"], default:"active"},
  dateOfBirth: Date, address: String, gender: String, bloodGroup: String,
  allergies: [String], currentMedicines: [String], medicalHistory: String,
  emergencyContact: {name:String, phone:String, relationship:String},
  passwordChangedAt: Date, lastLoginAt:Date, lastSeenAt:Date,
  passwordResetHash: {type:String, select:false},
  passwordResetExpires: {type:Date, select:false},
  doctorProfile: {
    bmdcNumber:String, specialty:String, qualifications:[String], experienceYears:Number,
    clinicName:String, verificationNote:String, verifiedAt:Date, signatureFileId:{type:Schema.Types.ObjectId,ref:"PrivateFile",default:null}, signatureUpdatedAt:Date, availabilitySlots:[{day:Number,start:String,end:String}], unavailablePeriods:[{start:Date,end:Date,reason:String}]
  }
}, {timestamps:true});

const fileSchema = new Schema({
  ownerId:{type:Schema.Types.ObjectId, ref:"User", required:true},
  category:{type:String, enum:["doctor_photo","bmdc_certificate","degree_certificate","identity_document","other_qualification","patient_report","consultation_recording","doctor_signature","report_ai_pdf","report_final_pdf","other"], required:true},
  originalName:{type:String, required:true}, storedName:{type:String, required:true}, storageProvider:{type:String,enum:["local","gridfs"],default:"local"},
  mimeType:{type:String, required:true}, size:Number, uploadedBy:{type:Schema.Types.ObjectId, ref:"User"}
}, {timestamps:true});

const appointmentSchema = new Schema({
  patientId:{type:Schema.Types.ObjectId, ref:"User", required:true},
  doctorId:{type:Schema.Types.ObjectId, ref:"User"},
  problem:{type:String, required:true, maxlength:4000},
  requestedAt:{type:Date, default:Date.now},
  scheduledAt:Date, consultationType:{type:String, enum:["online","in_person"], default:"online"},
  status:{type:String, enum:["requested","awaiting_records","awaiting_tests","confirmed","waiting_room","in_progress","completed","cancelled","rejected","follow_up_required"], default:"requested"},
  clinicianNote:String,
  recordingConsent:{patientAt:{type:Date,default:null},doctorAt:{type:Date,default:null}}
}, {timestamps:true});

// Database-enforced slot uniqueness prevents concurrent double booking.
appointmentSchema.index({doctorId:1, scheduledAt:1},{unique:true,partialFilterExpression:{doctorId:{$type:"objectId"},scheduledAt:{$type:"date"},status:{$in:["confirmed","waiting_room","in_progress"]}}});

const messageSchema = new Schema({
  appointmentId:{type:Schema.Types.ObjectId, ref:"Appointment", required:true},
  senderId:{type:Schema.Types.ObjectId, ref:"User", required:true},
  body:{type:String, required:true, maxlength:5000}
}, {timestamps:true});

const auditSchema = new Schema({
  actorId:{type:Schema.Types.ObjectId, ref:"User"},
  action:String, targetType:String, targetId:String, metadata:Schema.Types.Mixed,
  ip:String
}, {timestamps:true});

const medicineSchema = new Schema({
  brand:{type:String, required:true}, generic:{type:String, required:true},
  strength:String, form:String, manufacturer:String, country:{type:String, default:"Bangladesh"},
  verifiedAt:Date, active:{type:Boolean, default:true},
  registrationNumber:String, sourceName:String, sourceUrl:String, sourceCheckedAt:Date, sourceLicense:String, reviewStatus:{type:String,enum:["unreviewed","verified","needs_review","rejected"],default:"unreviewed"}
}, {timestamps:true});

medicineSchema.index({brand:1});
medicineSchema.index({generic:1});
medicineSchema.index({registrationNumber:1});
medicineSchema.index({reviewStatus:1, brand:1});

export const User = model("User", userSchema);
export const PrivateFile = model("PrivateFile", fileSchema);
export const Appointment = model("Appointment", appointmentSchema);
export const Message = model("Message", messageSchema);
export const AuditEvent = model("AuditEvent", auditSchema);
export const Medicine = model("Medicine", medicineSchema);
const prescriptionSchema = new Schema({
  appointmentId:{type:Schema.Types.ObjectId,ref:"Appointment",required:true},
  patientId:{type:Schema.Types.ObjectId,ref:"User",required:true},
  doctorId:{type:Schema.Types.ObjectId,ref:"User",required:true},
  status:{type:String,enum:["draft","signed","voided"],default:"draft"},
  signatureImageFileId:{type:Schema.Types.ObjectId,ref:"PrivateFile",default:null}, signatureImageHash:String, pdfFileId:{type:Schema.Types.ObjectId,ref:"PrivateFile",default:null},
  items:[{brand:String,generic:{type:String,required:true},strength:String,form:String,dose:{type:String,required:true},frequency:{type:String,required:true},duration:{type:String,required:true},instructions:String,medicineId:{type:Schema.Types.ObjectId,ref:"Medicine"}}],
  notes:String, signedAt:Date, signatureHash:String, signatureAlgorithm:String, signatureValue:String, publicKeyFingerprint:String, signerName:String, signerBmdc:String, voidReason:String
},{timestamps:true});
prescriptionSchema.index({appointmentId:1,createdAt:-1});
export const Prescription = model("Prescription",prescriptionSchema);
const callSignalSchema = new Schema({
  appointmentId:{type:Schema.Types.ObjectId,ref:"Appointment",required:true,index:true},
  senderId:{type:Schema.Types.ObjectId,ref:"User",required:true},
  type:{type:String,enum:["offer","answer","ice","hangup"],required:true},
  payload:{type:Schema.Types.Mixed}
},{timestamps:true});
callSignalSchema.index({createdAt:1},{expireAfterSeconds:86400});
export const CallSignal = model("CallSignal",callSignalSchema);


const medicalReportSchema = new Schema({
  patientId:{type:Schema.Types.ObjectId,ref:"User",required:true,index:true}, doctorId:{type:Schema.Types.ObjectId,ref:"User",default:null,index:true}, originalFileId:{type:Schema.Types.ObjectId,ref:"PrivateFile",required:true},
  status:{type:String,enum:["uploaded","ai_processing","ai_analysis_completed","pending_doctor_review","under_review","changes_requested","rejected","approved","signed","delivered"],default:"uploaded",index:true},
  extractedText:String, analysisMode:{type:String,enum:["pdf_text_ocr","image_vision_ocr"]}, findings:[{name:String,value:String,unit:String,normalRange:String,status:String,check:String}], urgencyLevel:String, aiExplanation:String, aiPdfFileId:{type:Schema.Types.ObjectId,ref:"PrivateFile"}, finalPdfFileId:{type:Schema.Types.ObjectId,ref:"PrivateFile"},
  reviewComment:String, rejectionReason:String, reviewedAt:Date, signedAt:Date, signatureImageFileId:{type:Schema.Types.ObjectId,ref:"PrivateFile"}, signatureImageHash:String, deliveredAt:Date
},{timestamps:true});
medicalReportSchema.index({doctorId:1,status:1,createdAt:-1});
const notificationSchema = new Schema({userId:{type:Schema.Types.ObjectId,ref:"User",required:true,index:true},type:{type:String,required:true},title:{type:String,required:true},message:{type:String,required:true},resourceType:String,resourceId:String,readAt:Date},{timestamps:true});
notificationSchema.index({userId:1,createdAt:-1});
export const MedicalReport = model("MedicalReport", medicalReportSchema);
export const Notification = model("Notification", notificationSchema);

const systemErrorSchema = new Schema({
  requestId:{type:String,index:true}, severity:{type:String,enum:["warning","error","critical"],default:"error"},
  errorName:String, message:{type:String,required:true}, statusCode:Number, method:String, route:String,
  actorId:{type:Schema.Types.ObjectId,ref:"User",default:null}, resolvedAt:Date, resolvedBy:{type:Schema.Types.ObjectId,ref:"User",default:null}
},{timestamps:true});
systemErrorSchema.index({resolvedAt:1,createdAt:-1});
export const SystemError = model("SystemError",systemErrorSchema);


// Operational call metadata only. This stores no audio, video, transcript, or SDP payload.
const callSessionSchema = new Schema({
  appointmentId:{type:Schema.Types.ObjectId,ref:"Appointment",required:true,index:true},
  patientId:{type:Schema.Types.ObjectId,ref:"User",required:true,index:true},
  doctorId:{type:Schema.Types.ObjectId,ref:"User",required:true,index:true},
  status:{type:String,enum:["active","ended","stale"],default:"active",index:true},
  startedAt:{type:Date,default:Date.now}, lastHeartbeatAt:{type:Date,default:Date.now}, endedAt:Date,
  lastConnectionState:{type:String,enum:["starting","connected","disconnected","failed","ended"],default:"starting"}
},{timestamps:true});
callSessionSchema.index({appointmentId:1,status:1});
callSessionSchema.index({lastHeartbeatAt:1});
export const CallSession = model("CallSession",callSessionSchema);
