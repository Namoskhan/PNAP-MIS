const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { monitorEventLoopDelay, performance } = require('node:perf_hooks');
const { start, root, hash } = require('../o2/harness.cjs');

const out = path.join(root, 'performance-tests/results/optimization/o3');
if (fs.existsSync(out)) throw new Error('O3 raw output exists; refusing overwrite');
fs.mkdirSync(out, { recursive: true });
const save = (name, data) => fs.writeFileSync(path.join(out, name), JSON.stringify(data, null, 2));
const urls = {
  summary: '/api/dashboard/summary?days=365', scope: '/api/dashboard/scope?days=365',
  'org-breakdown': '/api/dashboard/org-breakdown?days=365', membership: '/api/dashboard/membership?days=365',
  campaigns: '/api/dashboard/campaigns?days=365', meetings: '/api/dashboard/meetings?days=365&yearBasis=CALENDAR&years=5',
  reports: '/api/dashboard/reports?days=365',
  'inactive-units': '/api/dashboard/inactive-units?days=365&level=BASIC_UNIT&page=1&limit=10',
  'inactive-members': '/api/dashboard/inactive-members?days=365&page=1&limit=10',
};
const dashboard = Object.keys(urls);
const pct = (a, p) => { const s=[...a].sort((x,y)=>x-y),i=(s.length-1)*p; return s[Math.floor(i)]+(s[Math.ceil(i)]-s[Math.floor(i)])*(i%1); };
const stats = (a) => { const mean=a.reduce((x,y)=>x+y,0)/a.length, variance=a.reduce((x,y)=>x+(y-mean)**2,0)/a.length, sd=Math.sqrt(variance); return {n:a.length,mean,sd,cv:mean?sd/mean:0,p50:pct(a,.5),p90:pct(a,.9),p95:pct(a,.95),p99:pct(a,.99),max:Math.max(...a)}; };
function cpuTicks() { return os.cpus().reduce((a,c)=>{ for(const [k,v] of Object.entries(c.times)){a.total+=v;if(k==='idle')a.idle+=v;} return a;},{idle:0,total:0}); }
function setState(state) {
  delete process.env.O3_SUMMARY_COUNT_CONTROL; delete process.env.O3_DIRECTORY_HYDRATE; delete process.env.O3_DIRECTORY_SEQUENTIAL;
  Object.assign(process.env, state);
}
async function measured(h, url, state={}) {
  setState(state); h.analytics.invalidateCache(); h.resetLog();
  const cpu0=process.cpuUsage(), host0=cpuTicks(), mem0=process.memoryUsage();
  const eld=monitorEventLoopDelay({resolution:1}); eld.enable(); const t=performance.now();
  const r=await h.request(url,{cold:false}); const wall=performance.now()-t; eld.disable();
  const cpu=process.cpuUsage(cpu0), host1=cpuTicks(), used=(host1.total-host0.total)-(host1.idle-host0.idle);
  const commands=h.getLog().flatMap(x=>x.commands);
  return {ms:r.ms,wall,status:r.status,bytes:r.bytes,hash:r.hash,shapeHash:r.shapeHash,dbOperations:commands.length,
    querySignatures:commands.map(x=>x.signature),processCpuPct:(cpu.user+cpu.system)/1000/wall*100,
    hostCpuPct:(host1.total-host0.total)?used/(host1.total-host0.total)*100:null,
    rss:process.memoryUsage().rss,heapUsed:process.memoryUsage().heapUsed,rssDelta:process.memoryUsage().rss-mem0.rss,
    eventLoop:{meanMs:Number(eld.mean)/1e6,p50Ms:Number(eld.percentile(50))/1e6,p95Ms:Number(eld.percentile(95))/1e6,p99Ms:Number(eld.percentile(99))/1e6,maxMs:Number(eld.max)/1e6}};
}
async function main(){
  const h=await start();
  try {
    const before=await h.fingerprint(); save('environment.json',{...(await h.environment()),mongoVersion:await h.db.command({buildInfo:1}).then(x=>x.version),host:{totalRam:os.totalmem(),freeRam:os.freemem(),logicalProcessors:os.cpus().length,cpuModel:os.cpus()[0].model},backendPort:new URL(h.base).port,frontendPort:new URL(h.base).port});
    const current={};
    const reproduction={};
    for(const name of dashboard){ for(let i=0;i<3;i++) await measured(h,urls[name],current); const rows=[]; for(let i=0;i<30;i++) rows.push(await measured(h,urls[name],current)); reproduction[name]={metrics:stats(rows.map(x=>x.ms)),first:rows[0],samples:rows}; console.log('reproduce',name,reproduction[name].metrics.p95.toFixed(2)); }
    save('reproduction.json',reproduction);
    const interleaved={};
    for(const name of ['summary','org-breakdown','inactive-units']){const A=[],B=[];for(let i=0;i<30;i++){A.push(await measured(h,urls[name],current));B.push(await measured(h,urls[name],{O3_SUMMARY_COUNT_CONTROL:'1'}));}interleaved[name]={current:stats(A.map(x=>x.ms)),control:stats(B.map(x=>x.ms)),currentRows:A,controlRows:B,responseEqual:A.every((x,i)=>x.hash===B[i].hash&&x.shapeHash===B[i].shapeHash),queryShapeEqual:A[0].querySignatures.join()==B[0].querySignatures.join()};}
    save('endpoint-interleaved-results.json',interleaved);
    async function experiment(control){const result={};for(const name of ['membership','campaigns','reports']){const A=[],B=[];for(let i=0;i<20;i++){A.push(await measured(h,urls[name],current));B.push(await measured(h,urls[name],control));}result[name]={current:stats(A.map(x=>x.ms)),control:stats(B.map(x=>x.ms)),currentResource:{cpu:stats(A.map(x=>x.processCpuPct)),rss:stats(A.map(x=>x.rss))},controlResource:{cpu:stats(B.map(x=>x.processCpuPct)),rss:stats(B.map(x=>x.rss))},responseEqual:A.every((x,i)=>x.hash===B[i].hash)};}return result;}
    save('lean-experiment.json',await experiment({O3_DIRECTORY_HYDRATE:'1'}));
    save('parallelism-experiment.json',await experiment({O3_DIRECTORY_SEQUENTIAL:'1'}));
    async function fanout(names,state={}){setState(state);h.analytics.invalidateCache();const eld=monitorEventLoopDelay({resolution:1});eld.enable();const c0=process.cpuUsage(),s0=cpuTicks(),t=performance.now();const rs=await Promise.all(names.map(n=>h.request(urls[n],{cold:false})));const wall=performance.now()-t,c=process.cpuUsage(c0),s1=cpuTicks();eld.disable();return {wall,requests:Object.fromEntries(rs.map((r,i)=>[names[i],r.ms])),hashes:Object.fromEntries(rs.map((r,i)=>[names[i],r.hash])),processCpuPct:(c.user+c.system)/1000/wall*100,hostCpuPct:((s1.total-s0.total)-(s1.idle-s0.idle))/(s1.total-s0.total)*100,rss:process.memoryUsage().rss,freeRam:os.freemem(),eventLoop:{meanMs:Number(eld.mean)/1e6,p95Ms:Number(eld.percentile(95))/1e6,p99Ms:Number(eld.percentile(99))/1e6,maxMs:Number(eld.max)/1e6}};}
    const groups={g1:['summary'],g2:['summary','org-breakdown'],g3:['summary','org-breakdown','inactive-units'],g4:dashboard},fan={};for(const [k,names] of Object.entries(groups)){const rows=[];for(let i=0;i<15;i++)rows.push(await fanout(names));fan[k]={completion:stats(rows.map(x=>x.wall)),cpu:stats(rows.map(x=>x.processCpuPct)),hostCpu:stats(rows.map(x=>x.hostCpuPct)),eventLoopP95:stats(rows.map(x=>x.eventLoop.p95Ms)),rows};}save('fanout-experiment.json',fan);
    const dash={current:[],control:[]};for(let i=0;i<10;i++){dash.current.push(await fanout(dashboard,current));dash.control.push(await fanout(dashboard,{O3_SUMMARY_COUNT_CONTROL:'1'}));}save('dashboard-interleaved-results.json',{current:stats(dash.current.map(x=>x.wall)),control:stats(dash.control.map(x=>x.wall)),currentRows:dash.current,controlRows:dash.control});
    save('event-loop-results.json',{isolatedSummary:stats(reproduction.summary.samples.map(x=>x.eventLoop.p95Ms)),isolatedOrgBreakdown:stats(reproduction['org-breakdown'].samples.map(x=>x.eventLoop.p95Ms)),isolatedInactiveUnits:stats(reproduction['inactive-units'].samples.map(x=>x.eventLoop.p95Ms)),fullDashboard:fan.g4.eventLoopP95});
    save('resource-results.json',{isolated:Object.fromEntries(['summary','org-breakdown','inactive-units'].map(n=>[n,{processCpu:stats(reproduction[n].samples.map(x=>x.processCpuPct)),hostCpu:stats(reproduction[n].samples.map(x=>x.hostCpuPct)),rss:stats(reproduction[n].samples.map(x=>x.rss))}])),fanout:Object.fromEntries(Object.entries(fan).map(([k,v])=>[k,{processCpu:v.cpu,hostCpu:v.hostCpu,freeRam:stats(v.rows.map(x=>x.freeRam)),rss:stats(v.rows.map(x=>x.rss))}]))});
    save('mongodb-timing-results.json',{note:'Driver command shapes/counts captured; server command duration was not available from the existing request-scoped monitor. Handler-vs-query attribution uses operation counts, unchanged signatures and fan-out behavior.',suspects:Object.fromEntries(['summary','org-breakdown','inactive-units'].map(n=>[n,{dbOperations:reproduction[n].first.dbOperations,querySignatures:reproduction[n].first.querySignatures,responseBytes:reproduction[n].first.bytes}]))});
    save('integrity-before.json',before);const after=await h.fingerprint();save('integrity-after.json',after);if(hash(before)!==hash(after))throw new Error('Database changed');
  } finally {setState({});await h.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
