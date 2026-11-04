import { useEffect, useState } from "react";
import { Api, json, postForm, downloadFile, fmtDate, fmtDay, fmtSize, label, listFromText } from "./api";
import { Tabs, Chat, ChangePassword } from "./common";
import { printRx } from "./print";
import TeleVisitCall from "./TeleVisitCall";

const CANCELLABLE = ["requested", "awaiting_records", "awaiting_tests", "confirmed", "follow_up_required"];

export default function PatientPanel({ api, token, user, onToken, setMessage }: { api: Api; token: string; user: any; onToken: (t: string) => void; setMessage: (s: string) => void }) {
  const [tab, setTab] = useState("appointments");
  return <div>
    <Tabs tab={tab} setTab={setTab} tabs={[["appointments", "Appointments"], ["reports", "My reports"], ["notifications", "Notifications"], ["nearby", "Nearby care"], ["rx", "Prescriptions"], ["medicines", "Medicine search"], ["profile", "Health profile"], ["ai", "AI information"], ["account", "Account"]]} />
    {tab === "appointments" && <Appointments api={api} token={token} user={user} setMessage={setMessage} />}
    {tab === "reports" && <Reports api={api} token={token} setMessage={setMessage} />}
    {tab === "notifications" && <PatientNotifications api={api} setMessage={setMessage} />}
    {tab === "nearby" && <NearbyCare />}
    {tab === "rx" && <MyPrescriptions api={api} token={token} user={user} setMessage={setMessage} />}
    {tab === "medicines" && <MedicineSearch api={api} setMessage={setMessage} />}
    {tab === "profile" && <Profile api={api} setMessage={setMessage} />}
    {tab === "ai" && <AskAI api={api} setMessage={setMessage} />}
    {tab === "account" && <div className="grid"><ChangePassword api={api} onToken={onToken} setMessage={setMessage} /></div>}
  </div>;
}

function Appointments({ api, token, user, setMessage }: { api: Api; token: string; user: any; setMessage: (s: string) => void }) {
  const [list, setList] = useState<any[]>([]); const [doctors, setDoctors] = useState<any[]>([]);
  const [problem, setProblem] = useState(""); const [doctorId, setDoctorId] = useState(""); const [type, setType] = useState("online"); const [openChat, setOpenChat] = useState(""); const [openCall, setOpenCall] = useState("");
  async function load() { try { const d = await api("/appointments"); setList(d.appointments || []); } catch (e: any) { setMessage(e.message); } }
  useEffect(() => { load(); api("/doctors").then((d) => setDoctors(d.doctors || [])).catch(() => {}); }, []);
  async function book(e: any) {
    e.preventDefault();
    try { await api("/appointments", { method: "POST", body: json({ problem, consultationType: type, ...(doctorId ? { doctorId } : {}) }) }); setProblem(""); setDoctorId(""); setMessage("Appointment request submitted. A doctor will accept it and confirm a time."); load(); } catch (x: any) { setMessage(x.message); }
  }
  async function cancel(id: string) { if (!confirm("Cancel this appointment?")) return; try { await api(`/appointments/${id}/cancel`, { method: "POST", body: json({}) }); setMessage("Appointment cancelled."); load(); } catch (x: any) { setMessage(x.message); } }
  return <div className="grid">
    <article><h3>Request an appointment</h3><form onSubmit={book}>
      <textarea placeholder="Describe the reason for your appointment" value={problem} onChange={(e) => setProblem(e.target.value)} required minLength={5} />
      <label>Doctor (optional)<select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}><option value="">Any available doctor</option>{doctors.map((d) => <option key={d._id} value={d._id}>{d.name}{d.doctorProfile?.specialty ? " — " + d.doctorProfile.specialty : ""}</option>)}</select></label>
      <label>Consultation type<select value={type} onChange={(e) => setType(e.target.value)}><option value="online">Online</option><option value="in_person">In person</option></select></label>
      <button className="primary">Send request</button></form>
      <p className="warn">For chest pain, severe breathing difficulty, stroke symptoms, unconsciousness or severe bleeding, call 999 now instead of booking.</p></article>
    <article><h3>My appointments</h3><button className="outline" onClick={load}>Refresh</button>
      {list.length === 0 && <p className="muted">No appointments yet.</p>}
      {list.map((a) => <div className="item" key={a._id}>
        <b>{label(a.status)}</b>{a.scheduledAt && <> · {fmtDate(a.scheduledAt)}</>}
        <p>{a.problem}</p>
        <p className="muted">{a.doctorId ? "Dr. " + a.doctorId.name + (a.doctorId.doctorProfile?.specialty ? " (" + a.doctorId.doctorProfile.specialty + ")" : "") : "Waiting for a doctor to accept"} · {label(a.consultationType)}</p>
        <div className="row">
          {a.doctorId && <button className="outline" onClick={() => setOpenChat(openChat === a._id ? "" : a._id)}>{openChat === a._id ? "Hide chat" : "Chat"}</button>}
          {a.doctorId && a.consultationType === "online" && <button className="outline" onClick={() => setOpenCall(openCall === a._id ? "" : a._id)}>{openCall === a._id ? "Hide call" : "Audio / Video call"}</button>}
          {CANCELLABLE.includes(a.status) && <button className="danger" onClick={() => cancel(a._id)}>Cancel</button>}
        </div>
        {openChat === a._id && <Chat api={api} appointmentId={a._id} meId={user.id} />}
        {openCall === a._id && <TeleVisitCall api={api} token={token} appointmentId={a._id} user={user} setMessage={setMessage} />}
      </div>)}</article>
  </div>;
}


function PatientNotifications({api,setMessage}:{api:Api;setMessage:(s:string)=>void}){
 const [items,setItems]=useState<any[]>([]);async function load(){try{const d=await api("/notifications/mine");setItems(d.notifications||[]);}catch(e:any){setMessage(e.message);}}useEffect(()=>{load();},[]);
 async function read(id:string){try{await api(`/notifications/${id}/read`,{method:"POST",body:json({})});load();}catch(e:any){setMessage(e.message);}}
 return <div className="grid"><article className="full"><h3>Notifications</h3><button className="outline" onClick={load}>Refresh</button>{items.length===0&&<p className="muted">No notifications.</p>}{items.map(n=><div className="item" key={n._id}><b>{n.title}</b><p>{n.message}</p><p className="muted">{fmtDate(n.createdAt)} · {n.readAt?"Read":"Unread"}</p>{!n.readAt&&<button className="outline" onClick={()=>read(n._id)}>Mark as read</button>}</div>)}</article></div>;
}

function Reports({ api, token, setMessage }: { api: Api; token: string; setMessage: (s: string) => void }) {
  const [files, setFiles] = useState<any[]>([]); const [reports, setReports] = useState<any[]>([]); const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [reportText, setReportText] = useState(""); const [reportAnalysis, setReportAnalysis] = useState("");
  async function load() { try { const d = await api("/files/mine"); setFiles((d.files || []).filter((f: any) => f.category === "patient_report")); const r=await api("/reports/mine");setReports(r.reports||[]); } catch (e: any) { setMessage(e.message); } }
  useEffect(() => { load(); }, []);
  async function send() {
    if (!file) return; const fd = new FormData(); fd.append("file", file); fd.append("category", "patient_report"); setBusy(true);
    try { await postForm("/files/upload", fd, token); setFile(null); setMessage("Report uploaded privately. Your assigned doctor can view it."); load(); } catch (e: any) { setMessage(e.message); } finally { setBusy(false); }
  }
  async function remove(id: string) { if (!confirm("Delete this report permanently?")) return; try { await api(`/files/${id}`, { method: "DELETE" }); load(); } catch (e: any) { setMessage(e.message); } }
  async function analyzeReport() { setBusy(true); try { const d = await api("/ai/report-analysis", { method: "POST", body: json({ reportText }) }); setReportAnalysis(d.answer + "\n\n" + d.disclaimer); } catch (e: any) { setMessage(e.message); } finally { setBusy(false); } }
  return <div className="grid">
    <article><h3>Upload a report</h3><p className="muted">PDF, JPG, PNG or WEBP. Only you and the doctor assigned to your appointment can open patient reports.</p>
      <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <div className="row"><button className="primary" onClick={send} disabled={!file || busy}>{busy ? "Working…" : "Upload report"}</button><button className="outline" onClick={async()=>{if(!file)return;const fd=new FormData();fd.append("file",file);setBusy(true);try{const uploaded=await postForm("/files/upload",fd,token);const analyzed=await api(`/reports/${uploaded.file.id}/analyze`,{method:"POST",body:json({})});setReportAnalysis(analyzed.report.aiExplanation+"\n\nStatus: "+analyzed.report.status+"\n\n"+analyzed.disclaimer);load();}catch(e:any){setMessage(e.message);}finally{setBusy(false);}}} disabled={!file || busy}>{busy ? "Analyzing…" : "Analyze PDF/image"}</button></div></article>
    <article><h3>Upload audio or video</h3><p className="muted">MP3, M4A, OGG, WAV, MP4, WEBM or MOV. Uploading stores the file privately; it does not automatically transcribe or analyze it.</p><MediaUploader api={api} token={token} setMessage={setMessage} /></article>
    <article className="full"><h3>Explain report text with AI</h3><p className="muted">PDF text extraction/scanned-page OCR is used for PDFs. Report images are sent to the configured vision-capable AI model and cross-checked with Bangla/English OCR. OCR/vision may misread numbers; verify every value against the original. Text analysis is also available below.</p><textarea rows={5} value={reportText} onChange={e => setReportText(e.target.value)} placeholder="Paste test name, result, unit and reference range…" /><button className="primary" disabled={busy || reportText.trim().length < 20} onClick={analyzeReport}>{busy ? "Analyzing…" : "Explain report text"}</button>{reportAnalysis && <pre className="answer">{reportAnalysis}</pre>}</article>
    <article><h3>My reports</h3>{files.length === 0 && reports.length===0 && <p className="muted">No reports uploaded.</p>}
      {files.map((f) => <div className="item" key={f._id}><b>{f.originalName}</b><p className="muted">{fmtDay(f.createdAt)} · {fmtSize(f.size)}</p><div className="row"><button className="outline" onClick={() => downloadFile(token, f._id, f.originalName).catch((e) => setMessage(e.message))}>Download original</button><button className="danger" onClick={() => remove(f._id)}>Delete</button></div></div>)}
      {reports.map((r:any)=><div className="item" key={r._id}><b>AI report review · {label(r.status)}</b><p className="muted">{fmtDay(r.createdAt)} · {r.doctorId?.name?`Dr. ${r.doctorId.name}`:"Waiting for doctor assignment"}</p>{r.rejectionReason&&<p className="warn">Reason: {r.rejectionReason}</p>}{r.reviewComment&&<p>{r.reviewComment}</p>}<div className="row">{r.aiPdfFileId&&<button className="outline" onClick={()=>downloadFile(token,r.aiPdfFileId,"ai-report.pdf").catch((e)=>setMessage(e.message))}>Download AI PDF</button>}{r.finalPdfFileId&&<button className="primary" onClick={()=>downloadFile(token,r.finalPdfFileId,"doctor-approved-report.pdf").catch((e)=>setMessage(e.message))}>Download approved PDF</button>}</div></div>)}</article>
  </div>;
}

function NearbyCare() {
  const [coords, setCoords] = useState<{lat:number;lon:number}|null>(null);
  const [places, setPlaces] = useState<any[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function find() {
    setError(""); setBusy(true);
    if (!navigator.geolocation) { setError("Location is not supported by this browser."); setBusy(false); return; }
    navigator.geolocation.getCurrentPosition(async pos => {
      const lat=pos.coords.latitude, lon=pos.coords.longitude; setCoords({lat,lon});
      const query=`[out:json][timeout:20];(node(around:8000,${lat},${lon})[amenity~"hospital|clinic|doctors|pharmacy"];way(around:8000,${lat},${lon})[amenity~"hospital|clinic|doctors|pharmacy"];relation(around:8000,${lat},${lon})[amenity~"hospital|clinic|doctors|pharmacy"];);out center tags;`;
      try {
        const response=await fetch("https://overpass-api.de/api/interpreter",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body:"data="+encodeURIComponent(query)});
        if(!response.ok) throw new Error("OpenStreetMap search is temporarily unavailable.");
        const data=await response.json();
        const found=(data.elements||[]).map((x:any)=>({id:x.id,name:x.tags?.name||x.tags?.["name:en"]||x.tags?.amenity||"Healthcare place",type:x.tags?.amenity||"healthcare",lat:x.lat??x.center?.lat,lon:x.lon??x.center?.lon,address:[x.tags?.["addr:street"],x.tags?.["addr:city"]].filter(Boolean).join(", ")})).filter((x:any)=>Number.isFinite(x.lat)&&Number.isFinite(x.lon)).slice(0,40);
        setPlaces(found);
      } catch(e:any) { setError(e.message||"Could not load nearby places."); } finally { setBusy(false); }
    }, e=>{setError(e.message||"Allow location permission to search nearby.");setBusy(false);},{enableHighAccuracy:false,timeout:10000});
  }
  const mapSrc=coords?`https://www.openstreetmap.org/export/embed.html?bbox=${coords.lon-0.07}%2C${coords.lat-0.07}%2C${coords.lon+0.07}%2C${coords.lat+0.07}&layer=mapnik&marker=${coords.lat}%2C${coords.lon}`:"";
  return <div className="grid"><article className="full"><h3>Nearby hospitals & healthcare</h3><p className="muted">Uses OpenStreetMap data, not Google Maps. Results may be incomplete or outdated; call the facility to confirm availability.</p><button className="primary" onClick={find} disabled={busy}>{busy?"Searching…":"Find places near me"}</button>{error&&<p className="warn">{error}</p>}{coords&&<iframe title="OpenStreetMap nearby healthcare map" src={mapSrc} loading="lazy" style={{width:"100%",height:360,border:0,borderRadius:16,marginTop:16}} />}</article><article className="full"><h3>Results within 8 km</h3>{places.length===0&&!busy&&<p className="muted">Tap “Find places near me” to load available map data.</p>}{places.map(p=><div className="item" key={`${p.id}-${p.type}`}><b>{p.name}</b><p className="muted">{p.type}{p.address?` · ${p.address}`:""}</p><a href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=17/${p.lat}/${p.lon}`} target="_blank" rel="noreferrer">Open in OpenStreetMap</a></div>)}</article></div>;
}

function MediaUploader({ api, token, setMessage }: { api: Api; token: string; setMessage: (s: string) => void }) {
  const [media, setMedia] = useState<File | null>(null); const [busy, setBusy] = useState(false);
  async function uploadMedia() {
    if (!media) return;
    const fd = new FormData(); fd.append("file", media); fd.append("category", "other");
    setBusy(true);
    try { await postForm("/files/upload", fd, token); setMedia(null); setMessage("Media file uploaded privately. It is stored only; automatic transcription/AI analysis is not enabled."); }
    catch (e: any) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  return <div className="stack">
    <input type="file" accept="audio/*,video/mp4,video/webm,video/quicktime" onChange={e => setMedia(e.target.files?.[0] || null)} />
    {media && <p className="muted">{media.name} · {fmtSize(media.size)}</p>}
    <button className="primary" onClick={uploadMedia} disabled={!media || busy}>{busy ? "Uploading…" : "Upload audio/video"}</button>
  </div>;
}

function MyPrescriptions({ api, token, user, setMessage }: { api: Api; token: string; user: any; setMessage: (s: string) => void }) {
  const [list, setList] = useState<any[]>([]); const [check, setCheck] = useState<Record<string, string>>({});
  useEffect(() => { api("/prescriptions/mine").then((d) => setList(d.prescriptions || [])).catch((e) => setMessage(e.message)); }, []);
  async function verify(id: string) { try { const d = await api(`/prescriptions/${id}/verify`); setCheck({ ...check, [id]: d.valid ? "✔ Signature valid and content unchanged" : "✖ Could not verify: " + (d.reason || "content or signature does not match") }); } catch (e: any) { setMessage(e.message); } }
  return <div className="grid"><article className="full"><h3>My prescriptions</h3>
    <p className="muted">Take your prescription to a licensed pharmacist. Do not change doses without your doctor.</p>
    {list.length === 0 && <p className="muted">No prescriptions yet.</p>}
    {list.map((rx) => <div className="item" key={rx._id}>
      <b>{label(rx.status)}</b> · {fmtDay(rx.signedAt || rx.createdAt)} · Dr. {rx.doctorId?.name}
      {rx.status === "voided" && <p className="warn">This prescription was voided{rx.voidReason ? ": " + rx.voidReason : ""}. Do not use it.</p>}
      {rx.items.map((i: any, n: number) => <p key={n}>• {i.brand ? i.brand + " — " : ""}{i.generic} {i.strength} {i.form} — {i.dose}, {i.frequency}, {i.duration}{i.instructions ? " (" + i.instructions + ")" : ""}</p>)}
      {rx.notes && <p className="muted">Notes: {rx.notes}</p>}
      <div className="row"><button className="outline" onClick={() => verify(rx._id)}>Verify signature</button><button className="outline" onClick={() => printRx(rx, user.name)}>Print</button>{rx.pdfFileId && <button className="outline" onClick={() => downloadFile(token, rx.pdfFileId, "signed-prescription.pdf").catch((e) => setMessage(e.message))}>Download signed PDF</button>}</div>
      {check[rx._id] && <p className="notice">{check[rx._id]}</p>}
    </div>)}</article></div>;
}

function MedicineSearch({api,setMessage}:{api:Api;setMessage:(s:string)=>void}){
 const [q,setQ]=useState("");const [items,setItems]=useState<any[]>([]);const [busy,setBusy]=useState(false);
 async function search(e:any){e?.preventDefault?.();if(q.trim().length<2){setItems([]);return;}setBusy(true);try{const d=await api(`/medicines?q=${encodeURIComponent(q.trim())}`);setItems(d.medicines||[]);}catch(x:any){setMessage(x.message);}finally{setBusy(false);}}
 return <div className="grid"><article className="full"><h3>Bangladesh medicine catalogue</h3><p className="muted">Search verified catalogue entries by brand or generic name. This is reference information only, not a recommendation to start, stop or change medicine.</p><form className="row" onSubmit={search}><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search medicine brand or generic"/><button className="primary" disabled={busy||q.trim().length<2}>{busy?"Searching…":"Search"}</button></form>{items.length===0&&!busy&&<p className="muted">No verified matches yet. The catalogue may be incomplete; ask a licensed doctor or pharmacist.</p>}{items.map((m:any)=><div className="item" key={m._id}><b>{m.brand}</b> — {m.generic}<p className="muted">{m.strength||"Strength not listed"} · {m.form||"Form not listed"} · {m.manufacturer||"Manufacturer not listed"}</p><p className="muted">Verified catalogue entry · Confirm current registration and product details with a pharmacist.</p></div>)}</article></div>;
}

function Profile({ api, setMessage }: { api: Api; setMessage: (s: string) => void }) {
  const [f, setF] = useState<any>({ name: "", phone: "", dateOfBirth: "", gender: "", bloodGroup: "", address: "", allergies: "", currentMedicines: "", medicalHistory: "", ecName: "", ecPhone: "", ecRel: "" });
  useEffect(() => {
    api("/profile").then(({ user: u }) => setF({ name: u.name || "", phone: u.phone || "", dateOfBirth: u.dateOfBirth ? String(u.dateOfBirth).slice(0, 10) : "", gender: u.gender || "", bloodGroup: u.bloodGroup || "", address: u.address || "", allergies: (u.allergies || []).join(", "), currentMedicines: (u.currentMedicines || []).join(", "), medicalHistory: u.medicalHistory || "", ecName: u.emergencyContact?.name || "", ecPhone: u.emergencyContact?.phone || "", ecRel: u.emergencyContact?.relationship || "" })).catch((e) => setMessage(e.message));
  }, []);
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  async function save(e: any) {
    e.preventDefault();
    try {
      await api("/profile", { method: "PATCH", body: json({ name: f.name, phone: f.phone, dateOfBirth: f.dateOfBirth, gender: f.gender, bloodGroup: f.bloodGroup, address: f.address, allergies: listFromText(f.allergies), currentMedicines: listFromText(f.currentMedicines), medicalHistory: f.medicalHistory, emergencyContact: { name: f.ecName, phone: f.ecPhone, relationship: f.ecRel } }) });
      setMessage("Health profile saved. Your assigned doctor can see it.");
    } catch (x: any) { setMessage(x.message); }
  }
  return <div className="grid"><article className="full"><h3>Health profile</h3><p className="muted">Doctors assigned to your appointments can see this to treat you safely. Keep allergies and current medicines up to date.</p>
    <form onSubmit={save} className="cols">
      <label>Full name<input value={f.name} onChange={(e) => set("name", e.target.value)} required minLength={2} /></label>
      <label>Phone<input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></label>
      <label>Date of birth<input type="date" value={f.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} /></label>
      <label>Gender<select value={f.gender} onChange={(e) => set("gender", e.target.value)}><option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Other</option></select></label>
      <label>Blood group<select value={f.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)}><option value="">Unknown</option>{["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => <option key={b}>{b}</option>)}</select></label>
      <label>Address<input value={f.address} onChange={(e) => set("address", e.target.value)} /></label>
      <label className="full">Allergies (comma separated)<input value={f.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="e.g. Penicillin, Peanuts" /></label>
      <label className="full">Current medicines (comma separated)<input value={f.currentMedicines} onChange={(e) => set("currentMedicines", e.target.value)} /></label>
      <label className="full">Medical history<textarea value={f.medicalHistory} onChange={(e) => set("medicalHistory", e.target.value)} /></label>
      <label>Emergency contact name<input value={f.ecName} onChange={(e) => set("ecName", e.target.value)} /></label>
      <label>Emergency contact phone<input value={f.ecPhone} onChange={(e) => set("ecPhone", e.target.value)} /></label>
      <label>Relationship<input value={f.ecRel} onChange={(e) => set("ecRel", e.target.value)} /></label>
      <button className="primary full">Save profile</button></form></article></div>;
}

function AskAI({ api, setMessage }: { api: Api; setMessage: (s: string) => void }) {
  const [q, setQ] = useState(""); const [answer, setAnswer] = useState(""); const [busy, setBusy] = useState(false);
  async function ask(e: any) {
    e.preventDefault(); setBusy(true);
    try { const d = await api("/ai/health-information", { method: "POST", body: json({ question: q }) }); setAnswer(d.answer + "\n\n" + d.disclaimer); } catch (x: any) { setMessage(x.message); } finally { setBusy(false); }
  }
  return <div className="grid"><article className="full"><h3>AI health information</h3>
    <form onSubmit={ask}><textarea placeholder="Ask a general health information question. Do not include your name or other identifying details." value={q} onChange={(e) => setQ(e.target.value)} required minLength={5} />
      <button className="primary" disabled={busy}>{busy ? "Thinking…" : "Ask MedAI"}</button></form>
    {answer && <p className="answer">{answer}</p>}</article></div>;
}
