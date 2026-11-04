import { useEffect, useState } from "react";
import { Api, json, downloadFile, fmtDate, fmtDay, label, parseCsv } from "./api";
import { Tabs, ChangePassword } from "./common";

export default function AdminPanel({ api, token, onToken, setMessage }: { api: Api; token: string; onToken: (t: string) => void; setMessage: (s: string) => void }) {
  const [tab, setTab] = useState("doctors");
  return <div>
    <Tabs tab={tab} setTab={setTab} tabs={[["doctors", "Doctor verification"], ["users", "Users"], ["monitor", "Live monitoring"], ["medicines", "Medicine review"], ["import", "Import medicines"], ["security", "Password & audit"]]} />
    {tab === "doctors" && <><Overview api={api} setMessage={setMessage} /><DoctorQueue api={api} token={token} setMessage={setMessage} /></>}
    {tab === "users" && <Users api={api} setMessage={setMessage} />}
    {tab === "monitor" && <LiveMonitoring api={api} setMessage={setMessage} />}
    {tab === "medicines" && <MedicineReview api={api} setMessage={setMessage} />}
    {tab === "import" && <ImportMedicines api={api} setMessage={setMessage} />}
    {tab === "security" && <Security api={api} onToken={onToken} setMessage={setMessage} />}
  </div>;
}

function LiveMonitoring({ api, setMessage }: { api: Api; setMessage: (s: string) => void }) {
  const [data, setData] = useState<any>(null); const [updated, setUpdated] = useState("");
  async function load() { try { const d = await api("/admin/monitoring"); setData(d); setUpdated(new Date().toLocaleTimeString()); } catch (e: any) { setMessage(e.message); } }
  useEffect(() => { load(); const t = window.setInterval(load, 10000); return () => window.clearInterval(t); }, []);
  const counts = Object.fromEntries((data?.onlineCounts || []).map((x: any) => [x._id, x.count]));
  return <div className="grid">
    <article className="full"><h3>Live platform activity</h3><p className="muted">Auto-refreshes every 10 seconds. A user is considered online after a heartbeat within 75 seconds. Offline status is approximate and depends on browser/network connectivity. Last refresh: {updated || "Loading…"}</p>
      <div className="row"><b>Online patients: {counts.patient || 0}</b><b>Online doctors: {counts.doctor || 0}</b><b>Active calls: {data?.activeCalls?.length || 0}</b><button className="outline" onClick={load}>Refresh now</button></div>
    </article>
    <article className="full"><h3>Online users</h3>{!data?.onlineUsers?.length && <p className="muted">No recent user heartbeats.</p>}
      {(data?.onlineUsers || []).map((u: any) => <div className="item" key={u._id}><b>{u.name}</b> · {u.role} · {u.email}<p className="muted">Last seen: {fmtDate(u.lastSeenAt)} · Last login: {fmtDate(u.lastLoginAt)}</p></div>)}
    </article>
    <article className="full"><h3>Live call sessions</h3><p className="muted">Only operational metadata is shown. No call audio, video, messages, transcript, or private call content is accessible here. A session may remain visible briefly if a device disconnects without sending hangup.</p>
      {!data?.activeCalls?.length && <p className="muted">No active call sessions detected.</p>}
      {(data?.activeCalls || []).map((c: any) => <div className="item" key={c._id}><b>Appointment {c.appointmentId?._id || c.appointmentId}</b> · {c.lastConnectionState}<p>Patient: {c.patientId?.name || "—"} · Doctor: {c.doctorId?.name || "—"}</p><p className="muted">Started: {fmtDate(c.startedAt)} · Last heartbeat: {fmtDate(c.lastHeartbeatAt)}</p></div>)}
    </article>
    <article className="full"><h3>Recent activity</h3>{(data?.recentActivity || []).map((ev: any) => <p className="item" key={ev._id}>{fmtDate(ev.createdAt)} · <b>{ev.action}</b> · {ev.actorId?.name || "System"} ({ev.actorId?.role || "system"}) · {ev.targetType || ""}</p>)}</article>
  </div>;
}

function Overview({ api, setMessage }: { api: Api; setMessage: (s: string) => void }) {
  const [o, setO] = useState<any>(null);
  useEffect(() => { api("/admin/overview").then(setO).catch((e) => setMessage(e.message)); }, []);
  return <div className="grid"><article className="full"><h3>Overview</h3>{o ? <p>Patients: {o.patients} · Doctors: {o.doctors} · Pending doctors: {o.pendingDoctors} · Appointments: {o.appointments} · Reports: {o.uploadedReports}</p> : <p className="muted">Loading…</p>}</article></div>;
}

function DoctorQueue({ api, token, setMessage }: { api: Api; token: string; setMessage: (s: string) => void }) {
  const [apps, setApps] = useState<any[]>([]);
  async function load() { try { const d = await api("/admin/doctors/pending"); setApps(d.applications || []); } catch (e: any) { setMessage(e.message); } }
  useEffect(() => { load(); }, []);
  return <div className="grid"><article className="full"><h3>Doctor verification queue</h3><button className="outline" onClick={load}>Refresh</button>
    <p className="muted">Open every document and compare the BMDC number with the official BMDC register before approving.</p>
    {apps.length === 0 && <p className="muted">No pending applications.</p>}
    {apps.map((x) => <Review key={x.doctor._id} x={x} api={api} token={token} done={load} setMessage={setMessage} />)}</article></div>;
}

function Review({ x, api, token, done, setMessage }: { x: any; api: Api; token: string; done: () => void; setMessage: (s: string) => void }) {
  const [note, setNote] = useState(""); const d = x.doctor; const p = d.doctorProfile || {};
  async function decide(decision: string) {
    if (decision !== "approve" && !note.trim()) { setMessage("Write a note for the doctor first (what is wrong or what is missing)."); return; }
    if (decision === "approve" && !confirm(`Approve Dr. ${d.name} (BMDC ${p.bmdcNumber})? They will be able to prescribe.`)) return;
    try { await api(`/admin/doctors/${d._id}/decision`, { method: "POST", body: json({ decision, note }) }); setMessage("Decision saved."); done(); } catch (e: any) { setMessage(e.message); }
  }
  return <div className="item"><b>{d.name}</b> · {d.email} · {d.phone}
    <p>BMDC: <b>{p.bmdcNumber}</b> · {p.specialty} · {(p.qualifications || []).join(", ")} · {p.experienceYears} yrs</p>
    {p.verificationNote && <p className="muted">Earlier note: {p.verificationNote}</p>}
    <b>Documents ({x.documents.length})</b>
    {x.documents.map((f: any) => <p key={f._id}>{label(f.category)} — {f.originalName} <button className="outline" onClick={() => downloadFile(token, f._id, f.originalName).catch((e) => setMessage(e.message))}>Open</button></p>)}
    <textarea placeholder="Note to the doctor (required for reject / request info)" value={note} onChange={(e) => setNote(e.target.value)} />
    <div className="row"><button className="primary" onClick={() => decide("approve")}>Approve</button><button className="outline" onClick={() => decide("request_info")}>Request info</button><button className="danger" onClick={() => decide("reject")}>Reject</button></div></div>;
}

function Users({ api, setMessage }: { api: Api; setMessage: (s: string) => void }) {
  const [role, setRole] = useState("doctor"); const [users, setUsers] = useState<any[]>([]);
  async function load() { try { const d = await api(`/admin/users?role=${role}`); setUsers(d.users || []); } catch (e: any) { setMessage(e.message); } }
  useEffect(() => { load(); }, [role]);
  async function setStatus(id: string, status: string) { if (status === "suspended" && !confirm("Suspend this account? They will be signed out immediately.")) return; try { await api(`/admin/users/${id}/status`, { method: "POST", body: json({ status }) }); load(); } catch (e: any) { setMessage(e.message); } }
  async function resetPassword(id:string){if(!confirm("Reset this user's password? A temporary password will be shown once."))return;try{const d=await api(`/admin/users/${id}/reset-password`,{method:"POST",body:json({})});window.prompt("Copy this temporary password and share it securely. It will not be shown again:",d.temporaryPassword);setMessage("Password reset completed and audit event recorded.");}catch(e:any){setMessage(e.message);}}
  return <div className="grid"><article className="full"><h3>Users</h3>
    <div className="row"><button className={role === "doctor" ? "primary" : "outline"} onClick={() => setRole("doctor")}>Doctors</button><button className={role === "patient" ? "primary" : "outline"} onClick={() => setRole("patient")}>Patients</button></div>
    {users.length === 0 && <p className="muted">No users.</p>}
    {users.map((u) => <div className="item" key={u._id}><b>{u.name}</b> · {u.email} · {label(u.status)}<p className="muted">User ID: {u._id}</p>
      {u.role === "doctor" && <p className="muted">BMDC {u.doctorProfile?.bmdcNumber} · {u.doctorProfile?.specialty}</p>}
      <p className="muted">Joined {fmtDay(u.createdAt)}</p>
      <div className="row">{u.status === "active" ? <button className="danger" onClick={() => setStatus(u._id, "suspended")}>Suspend</button> : <button className="primary" onClick={() => setStatus(u._id, "active")}>Reactivate</button>}<button className="outline" onClick={()=>resetPassword(u._id)}>Reset password</button></div></div>)}</article></div>;
}

function MedicineReview({ api, setMessage }: { api: Api; setMessage: (s: string) => void }) {
  const [d, setD] = useState<any>({ records: [], total: 0, page: 1, pages: 1 }); const [page, setPage] = useState(1); const [q, setQ] = useState(""); const [sel, setSel] = useState<string[]>([]);
  async function load(p = page, text = q) { try { const r = await api(`/admin/medicines/review?page=${p}&q=${encodeURIComponent(text)}`); setD(r); setSel([]); } catch (e: any) { setMessage(e.message); } }
  useEffect(() => { load(page); }, [page]);
  async function bulk(ids: string[], status: string) { if (!ids.length) return; try { const r = await api("/admin/medicines/review-bulk", { method: "POST", body: json({ ids, status }) }); setMessage(`${r.updated} medicine(s) marked ${status}.`); load(); } catch (e: any) { setMessage(e.message); } }
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const ids = d.records.map((m: any) => m._id);
  return <div className="grid"><article className="full"><h3>Medicine catalogue review</h3>
    <p className="muted">Only “verified” medicines appear in the doctor’s prescription search. {d.total} waiting for review.</p>
    <form className="row" onSubmit={(e) => { e.preventDefault(); setPage(1); load(1, q); }}><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search brand or generic" /><button className="outline">Search</button></form>
    <div className="row"><button className="primary" disabled={!sel.length} onClick={() => bulk(sel, "verified")}>Verify selected ({sel.length})</button><button className="outline" onClick={() => setSel(sel.length === ids.length ? [] : ids)}>{sel.length === ids.length && ids.length ? "Clear" : "Select all on page"}</button><button className="danger" disabled={!sel.length} onClick={() => bulk(sel, "rejected")}>Reject selected</button></div>
    {d.records.map((m: any) => <label className="item check" key={m._id}><input type="checkbox" checked={sel.includes(m._id)} onChange={() => toggle(m._id)} /><span><b>{m.brand}</b> — {m.generic} {m.strength} {m.form}<br /><span className="muted">{m.manufacturer} · {m.sourceName}</span></span></label>)}
    <div className="row"><button className="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span className="muted">Page {d.page} of {d.pages}</span><button className="outline" disabled={page >= d.pages} onClick={() => setPage(page + 1)}>Next</button></div></article></div>;
}

function ImportMedicines({ api, setMessage }: { api: Api; setMessage: (s: string) => void }) {
  const [file, setFile] = useState<File | null>(null); const [src, setSrc] = useState({ name: "", url: "", license: "" }); const [busy, setBusy] = useState(false); const [log, setLog] = useState("");
  async function run(e: any) {
    e.preventDefault(); if (!file) return; setBusy(true); setLog("");
    try {
      const raw = await file.text(); let rows: any[]; if (file.name.toLowerCase().endsWith(".json")) { const parsed = JSON.parse(raw); rows = Array.isArray(parsed) ? parsed : parsed?.medicines; } else { rows = parseCsv(raw); } if (!Array.isArray(rows) || !rows.length) throw new Error("No rows found. Expected JSON array or CSV columns: brand,generic,strength,form,manufacturer,registrationNumber");
      let done = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const r = await api("/admin/medicines/import", { method: "POST", body: json({ records: rows.slice(i, i + 500), sourceName: src.name, sourceUrl: src.url, sourceLicense: src.license }) });
        done += r.imported; setLog(`Imported ${done} of ${rows.length}…`);
      }
      setLog(`Done: ${done} of ${rows.length} rows imported. Review them in “Medicine review”.`); setMessage("Import finished.");
    } catch (x: any) { setMessage(x.message); } finally { setBusy(false); }
  }
  return <div className="grid"><article className="full"><h3>Import medicines (CSV / JSON)</h3>
    <p className="muted">CSV columns or JSON object fields: brand, generic, strength, form, manufacturer, registrationNumber. Download the sample JSON in data/bangladesh_medicine_import_template.json. Use only data you are authorised to use. Existing verified entries keep their status.</p>
    <form onSubmit={run}><input type="file" accept=".csv,.json,application/json,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
      <input placeholder="Source name" value={src.name} onChange={(e) => setSrc({ ...src, name: e.target.value })} required />
      <input placeholder="Source URL" value={src.url} onChange={(e) => setSrc({ ...src, url: e.target.value })} required />
      <input placeholder="Data-use / licence basis" value={src.license} onChange={(e) => setSrc({ ...src, license: e.target.value })} required />
      <button className="primary" disabled={busy}>{busy ? "Importing…" : "Import"}</button></form>
    {log && <p className="notice">{log}</p>}</article></div>;
}

function Security({ api, onToken, setMessage }: { api: Api; onToken: (t: string) => void; setMessage: (s: string) => void }) {
  const [events, setEvents] = useState<any[]>([]); const [errors, setErrors] = useState<any[]>([]);
  async function loadErrors() { try { const d = await api("/admin/system/errors?resolved=false&limit=100"); setErrors(d.errors || []); } catch (e: any) { setMessage(e.message); } }
  async function resolveError(id: string) { try { await api(`/admin/system/errors/${id}/resolve`, { method: "POST", body: json({}) }); setMessage("System error marked resolved."); loadErrors(); } catch (e: any) { setMessage(e.message); } }
  async function audit() { try { const d = await api("/admin/audit"); setEvents(d.events || []); } catch (e: any) { setMessage(e.message); } }
  useEffect(() => { audit(); loadErrors(); }, []);
  return <div className="grid">
    <article className="full"><h3>Admin password</h3><p className="muted">Sign in with the Admin ID and password. No OTP or authenticator code is required. You can change the password here.</p>
      <ChangePassword api={api} onToken={onToken} setMessage={setMessage} /></article>
    <article className="full"><h3>Activity log</h3><button className="outline" onClick={audit}>Refresh</button>
      {events.map((ev) => <p className="item" key={ev._id}>{fmtDate(ev.createdAt)} · <b>{ev.action}</b> · {ev.actorId?.email || "system"} · {ev.targetType} {ev.ip ? "· " + ev.ip : ""}</p>)}</article>
    <article className="full"><h3>System errors</h3><p className="muted">API errors are logged with request ID, route, status and actor. Sensitive request bodies and credentials are not stored.</p><button className="outline" onClick={loadErrors}>Refresh errors</button>
      {errors.length === 0 && <p className="muted">No unresolved system errors.</p>}
      {errors.map((er) => <div className="item" key={er._id}><b>{er.severity?.toUpperCase()} · HTTP {er.statusCode}</b> · {fmtDate(er.createdAt)}<p>{er.errorName}: {er.message}</p><p className="muted">{er.method} {er.route} · {er.actorId?.email || "Unauthenticated/system"} · Request {er.requestId}</p><button className="outline" onClick={() => resolveError(er._id)}>Mark resolved</button></div>)}
    </article>
  </div>;
}
