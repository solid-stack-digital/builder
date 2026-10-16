import http from "node:http";
const port = Number(process.env.PORT ?? 3000);
http.createServer((_req,res)=>{res.writeHead(200,{"content-type":"text/plain"});res.end("ok");}).listen(port,"0.0.0.0");
