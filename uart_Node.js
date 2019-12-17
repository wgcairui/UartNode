const TcpServer = require("./lib/TcpServer");
const { Socket } = require("./lib/socket.client");

const tcpServer = new TcpServer(9000);
const socket = new Socket(tcpServer);
//socket注册成功后定时发送数据给server  
socket.start()
//监听tcp连接
tcpServer
  .on("connect", client => {
    console.log("%s:%s connect.", client["ip"], client["port"]);
  })
  .on("close", client => {
    console.log("%s:%s close.", client["ip"], client["port"]);
  })
  .on("register", client => {
    console.log(`设备注册:Mac=${client["mac"]},Jw=${client["jw"]}`);
    setInterval(() => {
      console.log(`start send ups`);
      tcpServer
        .SendClientBind({
          mac: client.mac,
          type: 485,
          content: "000300000002C5DA"
        })
        .then(res => console.log({ res }))
        .catch(e => console.log({ e }));
    }, 1000);
  });

tcpServer.start();
