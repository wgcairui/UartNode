const config = require("../config");
const run = require("./run");
const socketClient = require("socket.io-client");
const os = require("os");

class Socket {
  constructor(tcpServer) {
    this.tcpServer = tcpServer
    console.log(config.ServerHost);
    
    this.io = socketClient(config.ServerHost);
  }

  start() {
    this.io.on("connect", () => {
      console.log(`已连接到UartServer:${config.ServerHost},socketID${this.io.id},`);
      this._register()
    }).on("registerSuccess", () => {
      console.log(`已在UartServer成功注册，准备上发运行数据`);
      run.IntelSendUartData(this.tcpServer)
    })
      .on("disconnect", () => {
        console.log(`socket连接已丢失，取消发送运行数据`);
        run.CloseIntelSendUartData()
      });
  }

  _register() {
    this.io.emit("register", {
      hostname: os.hostname(),
      totalmem: os.totalmem(),
      freemem: os.freemem(),
      loadavg: os.loadavg(),
      networkInterfaces: os.networkInterfaces(),
      type: os.type(),
      uptime: os.uptime(),
      userInfo: os.userInfo()
    });
  }
}

module.exports = { Socket };
