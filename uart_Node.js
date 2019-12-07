const Koa = require('koa')
const  route = require('koa-route')
const websockify = require('koa-websocket');
 
const app = websockify(new Koa());
 
// Regular middleware
// Note it's app.ws.use and not app.use
app.ws.use(function(ctx, next) {
ctx.websocket.send("success");
	console.log("log is")
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
	console.log(message  )
	  ctx.websocket.send('axxxxxxxxxxxxxxxxxxxxx')
	  console.log(ctx);
  });

}));
const port = 81
app.listen(port,()=>{
    console.log(`Uart node listen port:${port}`);
    
});
