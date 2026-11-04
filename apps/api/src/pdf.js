import PDFDocument from "pdfkit";

export function makeTextPdf(title, lines, signatureBuffer = null, signatureMime = "image/png") {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({size:"A4", margins:{top:48,bottom:48,left:48,right:48}, autoFirstPage:true});
    const chunks=[]; doc.on("data",c=>chunks.push(c)); doc.on("error",reject); doc.on("end",()=>resolve(Buffer.concat(chunks)));
    doc.font("Helvetica-Bold").fontSize(16).text(String(title).slice(0,160)); doc.moveDown(0.8);
    doc.font("Helvetica").fontSize(9);
    for(const line of lines||[]){
      const value=String(line??"").normalize("NFKD").replace(/[^\x20-\x7E]/g,"?").slice(0,1000);
      if(doc.y>730) doc.addPage();
      doc.text(value,{width:500,lineGap:2});
    }
    if(signatureBuffer){
      if(doc.y>650) doc.addPage();
      doc.moveDown(1).font("Helvetica-Bold").text("Doctor signature:"); doc.moveDown(0.3);
      try { doc.image(signatureBuffer, {fit:[180,70],align:"left"}); }
      catch(e){ reject(new Error("Signature image could not be embedded. Upload a PNG or JPG signature.")); return; }
      doc.moveDown(4);
    }
    doc.end();
  });
}
