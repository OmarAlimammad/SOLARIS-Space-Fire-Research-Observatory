// Optional dependency-free Node.js local server, no external packages.
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve(import.meta.dirname||process.cwd());
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.glb':'model/gltf-binary','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.md':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  let pathname=decodeURIComponent(url.pathname);if(pathname==='/')pathname='/index.html';
  const filepath=resolve(root,'.'+pathname);
  if(!(filepath===root||filepath.startsWith(root+sep))){res.writeHead(403);res.end('Forbidden');return;}
  const s=await stat(filepath);if(!s.isFile())throw Error('Not found');
  const data=await readFile(filepath);res.writeHead(200,{'Content-Type':mime[extname(filepath)]||'application/octet-stream','Cache-Control':'no-cache','Access-Control-Allow-Origin':'*'});res.end(data);
 }catch(e){res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
});
server.listen(8000,'127.0.0.1',()=>console.log('Saturn V flight lab: http://127.0.0.1:8000/'));
