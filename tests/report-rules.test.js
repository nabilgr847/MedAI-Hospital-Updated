import test from "node:test";
import assert from "node:assert/strict";
import {parseRange,toNumber,verifyFindings} from "../apps/api/src/reportRules.js";

test("parses numeric reference ranges and comparator ranges",()=>{
  assert.deepEqual(parseRange("13.0 - 17.0"),[13,17]);
  assert.deepEqual(parseRange("< 200"),[null,200]);
  assert.deepEqual(parseRange(">= 40"),[40,null]);
  assert.equal(toNumber("1,250.5 mg/dL"),1250.5);
});
test("rule engine classifies only against explicit or fallback ranges",()=>{
  const r=verifyFindings([
    {name:"Hemoglobin",value:"10.2",unit:"g/dL",normal_range:"12.0 - 17.0"},
    {name:"HbA1c",value:"6.2",unit:"%",normal_range:"4.0 - 5.6"},
    {name:"Unknown marker",value:"3.1",unit:"x",normal_range:""}
  ]);
  assert.deepEqual(r.findings.map(x=>x.status),["low","high","unclear"]);
  assert.equal(r.stats.verified,2);assert.equal(r.stats.unchecked,1);
});
test("possible OCR decimal errors are not silently classified",()=>{
  const r=verifyFindings([{name:"HbA1c",value:"41",unit:"%",normal_range:"4.0-5.6"}]);
  assert.equal(r.findings[0].status,"unclear");
  assert.match(r.findings[0].check,/OCR decimal loss/);
});
