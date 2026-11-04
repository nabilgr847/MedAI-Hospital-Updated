import { useEffect, useState } from "react";
import { Api, json, downloadFile, postForm, fmtDate, fmtDay, fmtSize, label } from "./api";
import { Tabs, Chat, ChangePassword } from "./common";
import { printRx } from "./print";
import TeleVisitCall from "./TeleVisitCall";

const PRESCRIBABLE = ["awaiting_records", "awaiting_tests", "confirmed", "waiting_room", "in_progress", "completed", "follow_up_required"];
const SCHEDULABLE = ["requested", "awaiting_records", "awaiting_tests", "follow_up_required"];
const CLOSED = ["completed", "cancelled", "rejected"];
const NEXT: [string, string][] = [["waiting_room", "Waiting room"], ["in_progress", "In progress"], ["completed", "Completed"], ["awaiting_records", "Need records"], ["awaiting_tests", "Need tests"], ["follow_up_required", "Follow-up needed"], ["rejected", "Reject request"], ["cancelled", "Cancel"]];
const emptyItem = () => ({ brand: "", generic: "", strength: "", form: "Tablet", dose: "", frequency: "", duration: "", instructions: "", medicineId: "" });

export default function DoctorPanel({ api, token, user, onToken, setMessage }: { api: Api; token: string; user: any; onToken: (t: string) => void; setMessage: (s: string) => void }) {
  const [tab, setTab] = useState("appointments");
  return <div>
    <Tabs tab={tab} setTab={setTab} tabs={[["appointments", "Appointments"], ["requests", "New requests"], ["rx", "Prescriptions"], ["reports", "Report review"], ["notifications", "Notifications"], ["profile", "My doctor profile"]]} />
    {tab === "appointments" && <MyAppointments api={api} token={token} user={user} setMessage={setMessage} />}
    {tab === "requests" && <Requests api={api} setMessage={setMessage} />}
    {tab === "rx" && <PrescriptionList api={api} token={token} setMessage={setMessage} />}
    {tab === "reports" && <DoctorReportReview api={api} token={token} setMessage={setMessage} />}
    {tab === "notifications" && <PortalNotifications api={api} setMessage={setMessage} />}
    {tab === "profile" && <DoctorProfile api={api} token={token} onToken={onToken} setMessage={setMessage} />}
  </div>;
}

function Requests({ api, setMessage }: { api: Api; setMessage: (s: string) => void }) {
  const [list, setList] = useState<any[]>([]);
  async function load() { try { const d = await api("/doctor/unassigned-appointment-requests"); setList(d.requests || []); } catch (e: any) { setMessage(e.message); } }
  useEffect(() => { load(); }, []);
  async function claim(id: string) { try { await api(`/appointments/${id}/claim`, { method: "POST", body: json({}) }); setMessage("Request assigned to you. Open Appointments to schedule it."); load(); } catch (e: any) { setMessage(e.message); load(); } }
  return <div className="grid"><article className="full"><h3>Unassigned patient requests</h3><button className="outline" onClick={load}>Refresh</button>
    {list.length === 0 && <p className="muted">No open requests.</p>}
    {list.map((a) => <div className="item" key={a._id}><b>{a.patientId?.name || "Patient"}</b> · {fmtDate(a.createdAt)} · {label(a.consultationType)}<p>{a.problem}</p><button className="primary" onClick={() => claim(a._id)}>Accept request</button></div>)}</article></div>;
}

function MyAppointments({ api, token, user, setMessage }: { api: Api; token: string; user: any; setMessage: (s: string) => void }) {
  const [list, setList] = useState<any[]>([]); const [booked, setBooked] = useState<any[]>([]); const [open, setOpen] = useState<{ id: string; kind: string }>({ id: "", kind: "" });
  async function load() {
    try {
      const d = await api("/appointments"); setList(d.appointments || []);
      const av = await api(`/doctors/${user.id}/availability`); setBooked(av.bookedSlots || []);
    } catch (e: any) { setMessage(e.message); }
  }
  useEffect(() => { load(); }, []);
  const toggle = (id: string, kind: string) => setOpen(open.id === id && open.kind === kind ? { id: "", kind: "" } : { id, kind });
  return <div className="grid">
    <article className="full"><h3>My appointments</h3><button className="outline" onClick={load}>Refresh</button>
      {booked.length > 0 && <p className="muted">Already booked: {booked.map((b) => fmtDate(b.scheduledAt)).join(" · ")}</p>}
      {list.length === 0 && <p className="muted">No assigned appointments. Accept a request from “New requests”.</p>}
      {list.map((a) => <div className="item" key={a._id}>
        <b>{a.patientId?.name || "Patient"}</b> · {label(a.status)}{a.scheduledAt && <> · {fmtDate(a.scheduledAt)}</>} · {label(a.consultationType)}
        <p>{a.problem}</p>
        {!CLOSED.includes(a.status) && <ScheduleBox api={api} appt={a} reload={load} setMessage={setMessage} />}
        <div className="row">
          <button className="outline" onClick={() => toggle(a._id, "record")}>Patient record</button>
          <button className="outline" onClick={() => toggle(a._id, "chat")}>Chat</button>
          {a.consultationType === "online" && <button className="outline" onClick={() => toggle(a._id, "call")}>Audio / Video call</button>}
          {PRESCRIBABLE.includes(a.status) && <button className="outline" onClick={() => toggle(a._id, "rx")}>Write prescription</button>}
        </div>
        {open.id === a._id && open.kind === "record" && <PatientRecord api={api} token={token} id={a._id} setMessage={setMessage} />}
        {open.id === a._id && open.kind === "chat" && <Chat api={api} appointmentId={a._id} meId={user.id} />}
        {open.id === a._id && open.kind === "call" && <TeleVisitCall api={api} token={token} appointmentId={a._id} user={user} setMessage={setMessage} />}
        {open.id === a._id && open.kind === "rx" && <RxEditor api={api} appointmentId={a._id} onSaved={() => { setOpen({ id: "", kind: "" }); setMessage("Draft saved. Open the Prescriptions tab to review and sign it."); }} setMessage={setMessage} />}
      </div>)}</article></div>;
}

function ScheduleBox({ api, appt, reload, setMessage }: { api: Api; appt: any; reload: () => void; setMessage: (s: string) => void }) {
  const [when, setWhen] = useState(""); const [next, setNext] = useState("");
  async function patch(body: any, ok: string) { try { await api(`/appointments/${appt._id}`, { method: "PATCH", body: json(body) }); setMessage(ok); reload(); } catch (e: any) { setMessage(e.message); } }
  const minNow = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return <div className="row">
    {SCHEDULABLE.includes(appt.status) && <>
      <input type="datetime-local" min={minNow} value={when} onChange={(e) => setWhen(e.target.value)} />
      <button className="primary" disabled={!when} onClick={() => patch({ status: "confirmed", scheduledAt: new Date(when).toISOString() }, "Appointment confirmed.")}>Confirm time</button></>}
    <select value={next} onChange={(e) => setNext(e.target.value)}><option value="">Change status…</option>{NEXT.filter(([s]) => s !== appt.status).map(([s, t]) => <option key={s} value={s}>{t}</option>)}</select>
    <button className="outline" disabled={!next} onClick={() => { if (["rejected", "cancelled"].includes(next) && !confirm("Close this appointment?")) return; patch({ status: next }, "Status updated."); setNext(""); }}>Update</button>
  </div>;
}

function PatientRecord({ api, token, id, setMessage }: { api: Api; token: string; id: string; setMessage: (s: string) => void }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { api(`/appointments/${id}/patient-record`).then(setD).catch((e) => setMessage(e.message)); }, [id]);
  if (!d) return <p className="muted">Loading record…</p>;
  const p = d.patient || {};
  return <div className="record">
    <p><b>{p.name}</b> · {p.gender || "—"} · {p.bloodGroup || "blood group unknown"} · DOB {fmtDay(p.dateOfBirth)} · {p.phone || "no phone"}</p>
    <p className={(p.allergies || []).length ? "warn" : "muted"}>Allergies: {(p.allergies || []).join(", ") || "none recorded"}</p>
    <p>Current medicines: {(p.currentMedicines || []).join(", ") || "none recorded"}</p>
    <p>History: {p.medicalHistory || "none recorded"}</p>
    <p className="muted">Emergency contact: {p.emergencyContact?.name || "—"} {p.emergencyContact?.phone || ""} {p.emergencyContact?.relationship ? "(" + p.emergencyContact.relationship + ")" : ""}</p>
    <b>Reports</b>{(d.files || []).length === 0 && <p className="muted">No reports uploaded.</p>}
    {(d.files || []).map((f: any) => <p key={f._id}>{f.originalName} <span className="muted">{fmtDay(f.createdAt)} · {fmtSize(f.size)}</span> <button className="outline" onClick={() => downloadFile(token, f._id, f.originalName).catch((e) => setMessage(e.message))}>Download</button></p>)}
    <p className="muted">Viewing this record is logged.</p>
  </div>;
}

function RxEditor({ api, appointmentId, rx, onSaved, setMessage }: { api: Api; appointmentId?: string; rx?: any; onSaved: () => void; setMessage: (s: string) => void }) {
  const [items, setItems] = useState<any[]>(rx ? rx.items.map((i: any) => ({ ...emptyItem(), ...i, medicineId: i.medicineId || "" })) : [emptyItem()]);
  const [notes, setNotes] = useState<string>(rx?.notes || ""); const [sugg, setSugg] = useState<{ i: number; list: any[] }>({ i: -1, list: [] });
  const upd = (i: number, k: string, v: string) => setItems(items.map((x, n) => (n === i ? { ...x, [k]: v } : x)));
  async function search(i: number, v: string) {
    setItems(items.map((x, n) => (n === i ? { ...x, generic: v, medicineId: "" } : x)));
    if (v.trim().length < 2) { setSugg({ i, list: [] }); return; }
    try { const d = await api(`/medicines?q=${encodeURIComponent(v)}`); setSugg({ i, list: d.medicines || [] }); } catch { setSugg({ i, list: [] }); }
  }
  function pick(i: number, m: any) { setItems(items.map((x, n) => (n === i ? { ...x, brand: m.brand, generic: m.generic, strength: m.strength || "", form: m.form || x.form, medicineId: m._id } : x))); setSugg({ i: -1, list: [] }); }
  async function save(e: any) {
    e.preventDefault();
    try {
      const body = json({ items: items.map((x) => ({ ...x, medicineId: x.medicineId || undefined })), notes });
      if (rx) await api(`/prescriptions/${rx._id}`, { method: "PATCH", body }); else await api(`/appointments/${appointmentId}/prescriptions`, { method: "POST", body });
      onSaved();
    } catch (x: any) { setMessage(x.message); }
  }
  return <form onSubmit={save} className="record">
    <p className="muted">Doses are entered by you. Check the patient’s allergies and current medicines in “Patient record” before prescribing.</p>
    {items.map((it, i) => <div className="item" key={i}>
      <label>Medicine (generic or brand)<input value={it.generic} onChange={(e) => search(i, e.target.value)} placeholder="Type at least 2 letters" required />
        {it.brand && <span className="muted">Selected: {it.brand}</span>}</label>
      {sugg.i === i && sugg.list.length > 0 && <div className="suggestions">{sugg.list.map((m) => <button type="button" className="suggestion" key={m._id} onClick={() => pick(i, m)}>{m.brand} — {m.generic} {m.strength || ""} {m.form || ""}</button>)}</div>}
      <div className="cols">
        <label>Strength<input value={it.strength} onChange={(e) => upd(i, "strength", e.target.value)} /></label>
        <label>Form<select value={it.form} onChange={(e) => upd(i, "form", e.target.value)}>{["Tablet", "Capsule", "Syrup", "Injection", "Cream", "Eye drops", "Other"].map((f) => <option key={f}>{f}</option>)}</select></label>
        <label>Dose<input list={`dose-options-${i}`} value={it.dose} onChange={(e) => upd(i, "dose", e.target.value)} placeholder="Enter clinician-decided dose" required /><datalist id={`dose-options-${i}`}><option value="As directed by clinician" /><option value="1 tablet" /><option value="1 capsule" /><option value="5 mL" /><option value="1 drop" /></datalist></label>
        <label>Frequency<input list={`frequency-options-${i}`} value={it.frequency} onChange={(e) => upd(i, "frequency", e.target.value)} placeholder="Enter frequency" required /><datalist id={`frequency-options-${i}`}><option value="Once daily" /><option value="Twice daily" /><option value="Three times daily" /><option value="Every 8 hours" /><option value="As needed (specify maximum)" /></datalist></label>
        <label>Duration<input list={`duration-options-${i}`} value={it.duration} onChange={(e) => upd(i, "duration", e.target.value)} placeholder="Enter duration" required /><datalist id={`duration-options-${i}`}><option value="1 day" /><option value="3 days" /><option value="5 days" /><option value="7 days" /><option value="14 days" /></datalist></label>
        <label>Instructions<input value={it.instructions} onChange={(e) => upd(i, "instructions", e.target.value)} /></label>
      </div>
      {items.length > 1 && <button type="button" className="danger" onClick={() => setItems(items.filter((_, n) => n !== i))}>Remove medicine</button>}
    </div>)}
    <button type="button" className="outline" onClick={() => setItems([...items, emptyItem()])}>+ Add another medicine</button>
    <label>Notes for patient<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
    <button className="primary">{rx ? "Save changes" : "Save prescription draft"}</button>
  </form>;
}

function PrescriptionList({ api, token, setMessage }: { api: Api; token: string; setMessage: (s: string) => void }) {
  const [list, setList] = useState<any[]>([]); const [edit, setEdit] = useState(""); const [check, setCheck] = useState<Record<string, string>>({});
  async function load() { try { const d = await api("/prescriptions/mine"); setList(d.prescriptions || []); } catch (e: any) { setMessage(e.message); } }
  useEffect(() => { load(); }, []);
  async function sign(id: string) { if (!confirm("Sign this prescription? After signing it cannot be edited, only voided.")) return; try { await api(`/prescriptions/${id}/sign`, { method: "POST", body: json({}) }); setMessage("Prescription signed."); load(); } catch (e: any) { setMessage(e.message); } }
  async function del(id: string) { if (!confirm("Delete this draft?")) return; try { await api(`/prescriptions/${id}`, { method: "DELETE" }); load(); } catch (e: any) { setMessage(e.message); } }
  async function voidRx(id: string) { const reason = prompt("Reason for voiding (shown to the patient):"); if (!reason) return; try { await api(`/prescriptions/${id}/void`, { method: "POST", body: json({ reason }) }); setMessage("Prescription voided. Write a corrected one."); load(); } catch (e: any) { setMessage(e.message); } }
  async function verify(id: string) { try { const d = await api(`/prescriptions/${id}/verify`); setCheck({ ...check, [id]: d.valid ? "✔ Signature valid and content unchanged" : "✖ Not valid: " + (d.reason || "content or signature mismatch") }); } catch (e: any) { setMessage(e.message); } }
  return <div className="grid"><article className="full"><h3>Prescriptions</h3><button className="outline" onClick={load}>Refresh</button>
    {list.length === 0 && <p className="muted">No prescriptions yet. Create one from an appointment.</p>}
    {list.map((rx) => <div className="item" key={rx._id}>
      <b>{label(rx.status)}</b> · {rx.patientId?.name} · {fmtDay(rx.signedAt || rx.createdAt)}
      {rx.items.map((i: any, n: number) => <p key={n}>• {i.brand ? i.brand + " — " : ""}{i.generic} {i.strength} {i.form} — {i.dose}, {i.frequency}, {i.duration}</p>)}
      {rx.signatureHash && <p className="muted">Hash: {rx.signatureHash}</p>}
      <div className="row">
        {rx.status === "draft" && <><button className="outline" onClick={() => setEdit(edit === rx._id ? "" : rx._id)}>Edit</button><button className="primary" onClick={() => sign(rx._id)}>Review &amp; sign</button><button className="danger" onClick={() => del(rx._id)}>Delete draft</button></>}
        {rx.status === "signed" && <><button className="outline" onClick={() => verify(rx._id)}>Verify</button><button className="outline" onClick={() => printRx(rx)}>Print</button>{rx.pdfFileId && <button className="outline" onClick={() => downloadFile(token, rx.pdfFileId, "signed-prescription.pdf").catch((e) => setMessage(e.message))}>Download PDF</button>}<button className="danger" onClick={() => voidRx(rx._id)}>Void</button></>}
      </div>
      {check[rx._id] && <p className="notice">{check[rx._id]}</p>}
      {edit === rx._id && <RxEditor api={api} rx={rx} onSaved={() => { setEdit(""); setMessage("Draft updated."); load(); }} setMessage={setMessage} />}
    </div>)}
    <p className="muted">Signing creates an in-app Ed25519 signature and content hash. It is not a government-issued qualified digital certificate.</p></article></div>;
}



function PortalNotifications({api,setMessage}:{api:Api;setMessage:(s:string)=>void}){
 const [items,setItems]=useState<any[]>([]);async function load(){try{const d=await api("/notifications/mine");setItems(d.notifications||[]);}catch(e:any){setMessage(e.message);}}useEffect(()=>{load();},[]);
 async function read(id:string){try{await api(`/notifications/${id}/read`,{method:"POST",body:json({})});load();}catch(e:any){setMessage(e.message);}}
 return <div className="grid"><article className="full"><h3>Notifications</h3><button className="outline" onClick={load}>Refresh</button>{items.length===0&&<p className="muted">No notifications.</p>}{items.map(n=><div className="item" key={n._id}><b>{n.title}</b><p>{n.message}</p><p className="muted">{fmtDate(n.createdAt)} · {n.readAt?"Read":"Unread"}</p>{!n.readAt&&<button className="outline" onClick={()=>read(n._id)}>Mark as read</button>}</div>)}</article></div>;
}

function DoctorReportReview({ api, token, setMessage }: { api: Api; token: string; setMessage: (s: string) => void }) {
  const [reports,setReports]=useState<any[]>([]); const [comments,setComments]=useState<Record<string,string>>({});
  async function load(){try{const d=await api("/doctor/reports/pending");setReports(d.reports||[]);}catch(e:any){setMessage(e.message);}}
  useEffect(()=>{load();},[]);
  async function review(id:string,action:string){try{await api(`/reports/${id}/review`,{method:"POST",body:json({action,comment:comments[id]||""})});setMessage(`Report ${action.replace("_"," ")} successfully.`);load();}catch(e:any){setMessage(e.message);}}
  return <div className="grid"><article className="full"><h3>Reports awaiting doctor review</h3><button className="outline" onClick={load}>Refresh</button>{reports.length===0&&<p className="muted">No reports pending review.</p>}{reports.map(r=><div className="item" key={r._id}><b>{r.patientId?.name||"Patient"}</b> · {label(r.status)} · {fmtDay(r.createdAt)}<p className="muted">AI-generated analysis — not doctor-approved</p><div className="row"><button className="outline" onClick={()=>downloadFile(token,r.originalFileId?._id||r.originalFileId,"original-report").catch((e)=>setMessage(e.message))}>Open original report</button>{r.aiPdfFileId&&<button className="outline" onClick={()=>downloadFile(token,r.aiPdfFileId,"ai-analysis.pdf").catch((e)=>setMessage(e.message))}>AI PDF</button>}</div>{(r.findings||[]).map((f:any,i:number)=><p key={i}>{f.name}: {f.value} {f.unit} · <b>{f.status}</b> · {f.check}</p>)}<pre className="answer">{r.aiExplanation}</pre><textarea rows={3} value={comments[r._id]||""} onChange={e=>setComments({...comments,[r._id]:e.target.value})} placeholder="Review comments / rejection reason / requested correction"/><div className="row"><button className="outline" onClick={()=>review(r._id,"start")}>Start review</button><button className="outline" onClick={()=>review(r._id,"comment")}>Save comment</button><button className="outline" onClick={()=>review(r._id,"request_changes")}>Request changes</button><button className="danger" onClick={()=>review(r._id,"reject")}>Reject</button><button className="primary" onClick={()=>review(r._id,"approve")}>Approve &amp; sign</button></div></div>)}</article></div>;
}

function DoctorProfile({ api, token, onToken, setMessage }: { api: Api; token: string; onToken: (t: string) => void; setMessage: (s: string) => void }) {
  const [d, setD] = useState<any>(null); const [phone, setPhone] = useState(""); const [clinic, setClinic] = useState(""); const [signature, setSignature] = useState<File | null>(null); const [signatureInfo, setSignatureInfo] = useState<any>(null); const [sigBusy, setSigBusy] = useState(false); const [slots,setSlots]=useState<any[]>([]); const [slotDay,setSlotDay]=useState("1"); const [slotStart,setSlotStart]=useState("09:00"); const [slotEnd,setSlotEnd]=useState("17:00");
  async function load() { try { const r = await api("/doctor/me"); setD(r); setPhone(r.user.phone || ""); setClinic(r.user.doctorProfile?.clinicName || ""); setSlots(r.user.doctorProfile?.availabilitySlots || []); const sig = await api("/doctor/signature"); setSignatureInfo(sig.signature); } catch (e: any) { setMessage(e.message); } }
  useEffect(() => { load(); }, []);
  async function save(e: any) { e.preventDefault(); try { await api("/doctor/profile", { method: "PATCH", body: json({ phone, clinicName: clinic }) }); setMessage("Profile updated."); load(); } catch (x: any) { setMessage(x.message); } }
  const u = d?.user; const p = u?.doctorProfile || {};
  return <div className="grid">
    <article><h3>Doctor ID</h3>{!u ? <p className="muted">Loading…</p> : <>
      <p><b>Dr. {u.name}</b></p><p>{p.specialty} · {(p.qualifications || []).join(", ")}</p>
      <p>BMDC: <b>{p.bmdcNumber}</b> · {p.experienceYears ?? 0} years</p><p>{u.email}</p>
      <p className="notice">{u.status === "active" ? "Verified" + (p.verifiedAt ? " on " + fmtDay(p.verifiedAt) : "") : label(u.status)}</p>
      <b>Submitted documents</b>{(d.documents || []).map((f: any) => <p key={f._id}>{label(f.category)} — {f.originalName} <button className="outline" onClick={() => downloadFile(token, f._id, f.originalName).catch((e) => setMessage(e.message))}>Download</button></p>)}</>}</article>
    <article><h3>Permanent signature</h3><p className="muted">Upload a clear PNG, JPG or WEBP signature once. It is stored privately and a historical snapshot is attached when you sign a prescription or approve a report.</p><input type="file" accept="image/png,image/jpeg" onChange={e => setSignature(e.target.files?.[0] || null)} /><button className="primary" disabled={!signature || sigBusy} onClick={async()=>{if(!signature)return;const fd=new FormData();fd.append("file",signature);setSigBusy(true);try{const r=await postForm("/doctor/signature",fd,token);setSignatureInfo(r.signature);setSignature(null);setMessage("Permanent signature saved securely.");}catch(e:any){setMessage(e.message);}finally{setSigBusy(false);}}}>{sigBusy?"Saving…":signatureInfo?"Replace saved signature":"Save signature"}</button>{signatureInfo&&<p className="notice">Signature saved · {fmtDay(signatureInfo.updatedAt)}</p>}</article>
    <article><h3>Weekly availability</h3><p className="muted">Publish the hours when patients may be scheduled. Times are interpreted in the hospital server's configured timezone.</p><div className="row"><select value={slotDay} onChange={e=>setSlotDay(e.target.value)}><option value="0">Sunday</option><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option></select><input type="time" value={slotStart} onChange={e=>setSlotStart(e.target.value)}/><input type="time" value={slotEnd} onChange={e=>setSlotEnd(e.target.value)}/><button className="outline" onClick={()=>{if(slotStart>=slotEnd){setMessage("End time must be after start time.");return;}setSlots([...slots,{day:Number(slotDay),start:slotStart,end:slotEnd}]);}}>Add</button></div>{slots.map((x,i)=><p key={i} className="muted">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][x.day]} · {x.start}–{x.end} <button className="outline" onClick={()=>setSlots(slots.filter((_,n)=>n!==i))}>Remove</button></p>)}<button className="primary" onClick={async()=>{try{await api("/doctor/availability",{method:"PATCH",body:json({slots})});setMessage("Availability published.");}catch(e:any){setMessage(e.message);}}}>Save availability</button></article>
    <article><h3>Edit contact details</h3><form onSubmit={save}>
      <label>Phone<input value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
      <label>Clinic / hospital<input value={clinic} onChange={(e) => setClinic(e.target.value)} /></label>
      <button className="primary">Save</button></form>
      <p className="muted">Name, BMDC number and specialty can only be changed by the admin team after verification.</p></article>
    <ChangePassword api={api} onToken={onToken} setMessage={setMessage} />
  </div>;
}
