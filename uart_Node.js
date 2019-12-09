const TcpServer = require("./lib/TcpServer");

const tcpServer = new TcpServer(9000);

tcpServer.on("connect", client => {
  console.log("%s:%s connect.", client["ip"], client["port"]);
});

tcpServer.on("register", client => {
  console.log(`设备注册:Mac=${client["mac"]},Jw=${client["jw"]}`);
  //tcpServer.sendData({ mac: client.mac, data: "register success" });
});
tcpServer.on("data", async (client,data) => {
  //let data = client["data"];
  //let dataString = data.toString();
  console.log(data);
  // console.log("%s:%s dataString: %s.", client["ip"], client["port"], dataString);
  //tcpServer.sendData({ mac: client.mac, data: `rec success,data:${data}` });
  tcpServer
    .SendClientBind({ mac: client.mac, type: 485, content: "QGS" })
    .then(res => console.log(res))
    .catch(e => console.log(e));
});
tcpServer.on("close", client => {
  console.log("%s:%s close.", client["ip"], client["port"]);
  tcpServer.broadcast(`${client.mac} is close`);
});
tcpServer.start();
