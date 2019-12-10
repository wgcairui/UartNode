const TcpServer = require("./lib/TcpServer");

const tcpServer = new TcpServer(9000);

tcpServer.on("connect", client => {
  console.log("%s:%s connect.", client["ip"], client["port"]);
});

tcpServer.on("register", client => {
  console.log(`设备注册:Mac=${client["mac"]},Jw=${client["jw"]}`);
  //tcpServer.sendData({ mac: client.mac, data: "register success" });
  setInterval(() => {
    console.log(`start send ups`);
    
    tcpServer
      .SendClientBind({ mac: client.mac, type: 232, content: "QGS" })
      .then(res => console.log({ res }))
      .catch(e => console.log({ e }));
  }, 10000);
});
tcpServer.on("data", async (client, data) => {
  console.log(data);
});
tcpServer.on("close", client => {
  console.log("%s:%s close.", client["ip"], client["port"]);
});
tcpServer.start();
