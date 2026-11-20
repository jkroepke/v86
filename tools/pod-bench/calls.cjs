// node calls.cjs gstat.json System.map fn... : number of calls into fn (interpreter-only recordings), by caller
const fs=require("fs"); const [file,map,...fns]=process.argv.slice(2);
const g=JSON.parse(fs.readFileSync(file));
const syms=fs.readFileSync(map,"utf8").split("\n").map(l=>l.split(" ")).filter(p=>p.length===3&&/[tT]/.test(p[1])).map(p=>[parseInt(p[0],16),p[2]]).sort((a,b)=>a[0]-b[0]);
const sym=a=>{let lo=0,hi=syms.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(syms[m][0]<=a)lo=m;else hi=m-1;}return syms[lo];};
const cnt=Object.fromEntries(g.ecnt); const res={};
for(const [i,k] of g.ekeys){const key=k-1; const a=Math.floor(key/2**24), b=key%2**24; const t=sym(0xc1000000+b); if(t[0]!==0xc1000000+b) continue; if(!fns.includes(t[1])) continue; const c=sym(0xc1000000+a)[1]; (res[t[1]]??={})[c]=(res[t[1]][c]||0)+cnt[i];}
for(const f of fns){const r=res[f]||{}; const tot=Object.values(r).reduce((x,y)=>x+y,0); console.log(f, tot, Object.entries(r).sort((x,y)=>y[1]-x[1]).slice(0,5).map(x=>x.join(":")).join(" "));}
