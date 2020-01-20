const config = require("../config");
const socketClient = require("socket.io-client");
const TcpServer = require("./TcpServer");
const Querys = require("./Query");
const tool = require("./tool")

class Socket {
  constructor() {
    this.TcpServer = null;
    this.Query = null;
    this.io = socketClient(config.ServerHost);
  }

  start() {
    this.io
      .on("connect", () => this._register())
      .on("registerSuccess", data => this._registerSuccess(data))
      .on("disconnect", () => this._disconnect)
      .on("query", data => this.Query.emit("query", data));
  }

  _register() {
    console.log(`已连接到UartServer:${config.ServerHost},socketID${this.io.id},`);
    this.io.emit("register", tool.NodeInfo());
  }
  _registerSuccess(config) {
    if(this.TcpServer) return
    // let { clients, IP, Name, MaxConnections, Port } = config
    console.log(`已在 UartServer 成功注册`);
    this.TcpServer = new TcpServer(config);
    this.TcpServer.start();
    this.Query = new Querys(this.io, this.TcpServer, config);
    this.Query.start();
    //run.IntelSendUartData(this.TcpServer)
  }
  _disconnect() {
    console.log(`socket连接已丢失，取消发送运行数据`);
  }
}

module.exports = { Socket };
