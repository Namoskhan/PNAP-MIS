const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {AsyncLocalStorage}=require('node:async_hooks');
const root=path.resolve(__dirname,'../../..'),appRoot=path.join(root,'pnap-mis');
const appRequire=require('node:module').createRequire(path.join(appRoot,'server/package.json'));
const mongoose=appRequire('mongoose'),{EJSON}=appRequire('bson');
const hash=v=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
function norm(v,k=''){if(Array.isArray(v)){const a=v.map(x=>norm(x));return k==='byTier'?a.sort((x,y)=>y.total-x.total||JSON.stringify(x).localeCompare(JSON.stringify(y))):a}if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().filter(x=>x!=='generatedAt').map(x=>[x,norm(v[x],x)]));return v}
async function start(){
 const raw=process.env.O7_MONGO_URI;if(!raw)throw Error('O7_MONGO_URI is required');const u=new URL(raw),dbName=u.pathname.slice(1);
 if(u.hostname!=='127.0.0.1'||(u.port&&u.port!=='27017')||dbName==='pnap_mis'||!/^pnap_mis_o7_[a-d]$/.test(dbName))throw Error('STOP: O7 requires 127.0.0.1 and pnap_mis_o7_a..d');
 process.env.MONGO_URI=raw;process.env.NODE_ENV='development';
 mongoose.set('autoIndex',false);mongoose.set('autoCreate',false);mongoose.set('strictQuery',true);
 await mongoose.connect(raw,{autoIndex:false,autoCreate:false,monitorCommands:true,serverSelectionTimeoutMS:5000});
 const db=mongoose.connection.db,cmdline=await db.admin().command({getCmdLineOpts:1});
 const modelDir=path.join(appRoot,'server/src/models');for(const f of fs.readdirSync(modelDir).filter(f=>f.endsWith('.js')))require(path.join(modelDir,f));
 const context=new AsyncLocalStorage();let log=[];
 mongoose.connection.getClient().on('commandStarted',e=>{const r=context.getStore();if(!r||!['find','aggregate','count','distinct','getMore'].includes(e.commandName))return;const keys=['find','aggregate','count','distinct','filter','sort','projection','skip','limit','pipeline'];const command=EJSON.serialize(Object.fromEntries(keys.filter(k=>k in e.command).map(k=>[k,e.command[k]])));r.commands.push({type:e.commandName,collection:e.command[e.commandName],command,signature:hash(command)})});
 const app=require(path.join(appRoot,'server/src/app')),outer=appRequire('express')();outer.use((req,res,next)=>{if(!req.url.startsWith('/api/'))return next();const r={url:req.url,method:req.method,commands:[]};log.push(r);context.run(r,next)});outer.use(app);
 const server=outer.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const analytics=require(path.join(appRoot,'server/src/services/analyticsService')),{signToken}=require(path.join(appRoot,'server/src/middleware/auth')),User=mongoose.model('User'),user=await User.findOne({roles:'SUPER_ADMIN',isActive:true});if(!user)throw Error('Synthetic super admin missing');const token=signToken(user);
 async function request(url,opt={}){if(opt.cold!==false)analytics.invalidateCache();const t=performance.now(),res=await fetch(base+url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(120000)}),text=await res.text(),ms=performance.now()-t;let body;try{body=JSON.parse(text)}catch{body={raw:text}}return{status:res.status,ms,bytes:Buffer.byteLength(text),hash:hash(norm(body)),body}}
 return{db,dbName,analytics,request,resetLog:()=>{log=[]},getLog:()=>log,environment:async()=>({database:dbName,dbPath:cmdline.parsed.storage.dbPath,node:process.version,dbStats:await db.stats()}),close:async()=>{await new Promise(r=>server.close(r));await mongoose.disconnect()}};
}
module.exports={start,hash};
