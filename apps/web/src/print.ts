const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c]);

// Opens a printable prescription. Every value is HTML-escaped.
export function printRx(rx: any, patientName?: string) {
  const w = window.open("", "_blank");
  if (!w) { alert("Allow pop-ups to print the prescription."); return; }
  const rows = (rx.items || []).map((i: any, n: number) => `<tr><td>${n + 1}</td><td>${esc(i.brand ? i.brand + " — " : "")}${esc(i.generic)} ${esc(i.strength)} ${esc(i.form)}</td><td>${esc(i.dose)}</td><td>${esc(i.frequency)}</td><td>${esc(i.duration)}</td><td>${esc(i.instructions)}</td></tr>`).join("");
  w.document.write(`<!doctype html><title>Prescription</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:24px auto;color:#111}table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:6px;text-align:left}small{color:#444;word-break:break-all}</style>
<h2>MedAI Hospital — Prescription</h2>
<p>Patient: <b>${esc(patientName || rx.patientId?.name)}</b><br>Doctor: <b>${esc(rx.doctorId?.name || rx.signerName)}</b> · BMDC: ${esc(rx.signerBmdc || rx.doctorId?.doctorProfile?.bmdcNumber)}<br>Status: ${esc(rx.status)} · Date: ${esc(rx.signedAt ? new Date(rx.signedAt).toLocaleString() : "")}</p>
<table><tr><th>#</th><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Duration</th><th>Instructions</th></tr>${rows}</table>
<p>${esc(rx.notes)}</p>
<p><small>${rx.status === "voided" ? "VOIDED — DO NOT USE. " : ""}In-app signature (${esc(rx.signatureAlgorithm)}). Content hash: ${esc(rx.signatureHash)}. This is not a government-issued qualified digital certificate.</small></p>
<script>window.onload=function(){window.print()}</script>`);
  w.document.close();
}
