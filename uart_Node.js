const TcpServer = require("./lib/TcpServer");
const { Socket } = require("./lib/socket.client");
const Run = require("./lib/run");

const tcpServer = new TcpServer(9000);
const socket = new Socket();
const run = new Run();
//socket注册成功后定时发送数据给server
socket.io
  .on("registerSuccess", ()=>run.IntelSendUartData(tcpServer))
  .on("disconnect", ()=>run.CloseIntelSendUartData());

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
    }, 10000);
  });

tcpServer.start();
