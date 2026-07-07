const fs=require('fs');const path=require('path');
const html=fs.readFileSync('auth-test.html','utf8');
const importMap=JSON.parse(html.match(/<script type="importmap">\s*([\s\S]*?)\s*<\/script>/)[1]);
const mapped=new Set(Object.keys(importMap.imports));
const re=/from ['"]([^.'"][^'"]*)['"]|import\s*\(['"]([^.'"][^'"]*)['"]\)/g;
const unmapped=new Map();
function scan(file, seen=new Set()){
  const abs=path.resolve(file);
  if(seen.has(abs)) return; seen.add(abs);
  if(!fs.existsSync(abs)){ console.log('MISSING FILE', abs); return; }
  const txt=fs.readFileSync(abs,'utf8');
  let m;
  while((m=re.exec(txt))){
    const spec=m[1]||m[2];
    if(!spec||spec.startsWith('node:')) continue;
    if(!mapped.has(spec) && (spec.startsWith('@')||spec.startsWith('firebase/')||spec==='idb'||spec==='re2js')){
      const list=unmapped.get(spec)||[]; list.push(path.relative(process.cwd(),abs)); unmapped.set(spec,list);
    }
  }
  const relRe=/from ['"](\.[^'"]+)['"]|import ['"](\.[^'"]+)['"]/g;
  while((m=relRe.exec(txt))){
    const rel=m[1]||m[2];
    if(rel && rel.startsWith('.')) scan(path.join(path.dirname(abs), rel), seen);
  }
}
// full tree from all mapped entrypoints
for(const p of Object.values(importMap.imports)) scan(p.replace(/^\.\//,''));
for(const r of ['js/auth.js','js/firebase.js']) scan(r);
console.log('Unmapped:', unmapped.size);
for(const [spec, files] of [...unmapped.entries()].sort()) console.log(spec, '->', [...new Set(files)].slice(0,3).join(', '));
