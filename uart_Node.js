const TcpServer = require("./lib/TcpServer");

const tcpServer = new TcpServer(9000);

tcpServer.on("connect", client => {
  console.log("%s:%s connect.", client["ip"], client["port"]);
});

tcpServer.on("register", client => {
  console.log(`设备注册:Mac=${client["mac"]},Jw=${client["jw"]}`);
  client["socket"].write("register success");
});
tcpServer.on("data", client => {
  let data = client["data"].toString();
  console.log("%s:%s send: %s.", client["ip"], client["port"], data);
  console.log(client);

  tcpServer.broadcast(data);
});
tcpServer.on("close", client => {
  console.log("%s:%s close.", client["ip"], client["port"]);
});
tcpServer.start();
