const io = require("socket.io-client")("http://localhost:3000/Node");
io.on("connect", () => {
  io.emit("test", { a: 2132 });
  console.log("success");
});
io.on("as", data => console.log(data));
