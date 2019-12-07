const Koa = require('koa')
const  route = require('koa-route')
const websockify = require('koa-websocket');
 
const logger = require("koa-logger")

const koa = new Koa()

koa.use(logger())

const app = websockify(koa);
 
// Regular middleware
// Note it's app.ws.use and not app.use
app.ws.use(function(ctx, next) {
ctx.websocket.send("success");
	
	  console.log(new Date()+ctx.websocket.protocol)
  // return `next` to pass the context (ctx) on to the next ws middleware
  return next(ctx);
});
 
// Using routes
app.ws.use(route.all("/", function (ctx) {
	ctx.websocket.send("successxsacdcdddddd");
  // `ctx` is the regular koa context created from the `ws` onConnection `socket.upgradeReq` object.
  // the websocket is added to the context on `ctx.websocket`.
  console.log(ctx);
  

 
  ctx.websocket.on("message", function(message) {
    // do something with the message from client
	console.log("mmmmmmmmmmmmm")
	  ctx.websocket.send('axxxxxxxxxxxxxxxxxxxxx')
	  console.log(ctx);
  });

}));
const port = 9000
app.listen(port,()=>{
    console.log(`Uart node listen port:${port}`);
    
});
