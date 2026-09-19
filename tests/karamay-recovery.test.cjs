const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('GoogleAppsScript.gs','utf8');
function scenario(mode) {
  const properties = new Map();
  const records = [['ClaimID','Attachments','DateStamp'],['KRM-old','[{"storage_id":"chunk-old"}]',new Date('2026-09-01')]];
  const original = JSON.stringify(records);
  let sourceReads = 0, creates = 0;
  const oldSheet = {getDataRange: () => ({getValues() {
    sourceReads++;
    if (mode === 'concurrent' && sourceReads > 1) return [records[0], [...records[1], 'changed']];
    return records;
  }})};
  let destinationRows = [];
  const targetSheet = {setName() {}, getRange(row,col,count,width) { return {
    setValues(batch) {if (mode === 'write') throw Error('write rejected');batch.forEach((r,i) => {destinationRows[row-1+i] = [...r];});},
    getValues() {const data=destinationRows.slice(row-1,row-1+count).map(r=>r.slice(col-1,col-1+width));if(mode==='verify') data[1][0]='wrong';return data;}
  };}};
  const oldBook = {getSpreadsheetTimeZone: () => 'Asia/Manila'};
  const newBook = {getId: () => 'new-book', getUrl: () => 'new-url', getSheets: () => [targetSheet],setSpreadsheetTimeZone(zone) {assert.equal(zone,'Asia/Manila');}};
  const ctx=vm.createContext({
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties.get(key),setProperty:(key,value)=>properties.set(key,value)})},
    SpreadsheetApp:{create(){creates++;return newBook;},openById(id){assert.equal(id,'new-book');return newBook;},flush(){}},
    Logger:{log(){}}
  });
  vm.runInContext(source,ctx);
  ctx.withScriptLock=fn=>fn();ctx.getSpreadsheet=()=>oldBook;
  const routing=[];
  ctx.getSheetByNameFlexible=(book,name)=>{routing.push({book,name});return book===oldBook?oldSheet:targetSheet;};
  ctx.ensureHeaders=()=>{};
  if (mode) {
    assert.throws(()=>ctx.recoverKaramayClaimsStorage());
    assert.equal(properties.get('KARAMAY_CLAIMS_SHEET_ID'),undefined);
    assert.equal(properties.get('KARAMAY_RECOVERY_CANDIDATE_ID'),'new-book');
  } else {
    assert.equal(ctx.recoverKaramayClaimsStorage(),'new-url');
    assert.equal(JSON.stringify(destinationRows),original);
    assert.equal(properties.get('KARAMAY_CLAIMS_SHEET_ID'),'new-book');
    assert.equal(ctx.recoverKaramayClaimsStorage(),'new-url');
    assert.equal(creates,1);
    assert.equal(ctx.getSheet('Karamay Claims',[]),targetSheet);
    assert.equal(ctx.getSheet('Karamay Attachment Data',[]),oldSheet);
    assert.equal(ctx.getSheet('Users',[]),oldSheet);
  }
  assert.equal(JSON.stringify(records),original);
}
scenario();scenario('write');scenario('verify');scenario('concurrent');
console.log('PASS: verified recovery, repeated-run safety, Karamay-only routing, historical chunks stay on original, original unchanged, no activation on write/verification/concurrent-edit failures.');
