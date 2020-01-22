import config from "../config";
import tool from "./tool";
import socketClient from "socket.io-client";
import { registerConfig, queryObject } from "./interface";
import Query from "./Query";
import TcpServer from "./TcpServer";

export default class Socket {
  TcpServer!: TcpServer;
  Query!: Query;
  io: SocketIOClient.Socket;

  constructor() {
    console.log(config.ServerHost);
    
    this.io = socketClient(config.ServerHost);
  }

  start() {
    this.io
      .on("connect", () => this._register())
      .on("registerSuccess", (data: registerConfig) => this._registerSuccess(data))
      .on("disconnect", () => this._disconnect)
      .on("query", (data: queryObject) => this.Query.emit("query", data));
  }

  _register(): void {
    console.log(`已连接到UartServer:${config.ServerHost},socketID:${this.io.id},`);
    this.io.emit("register", tool.NodeInfo());
  }
  _registerSuccess(config: registerConfig): void {
    if (this.TcpServer) return;
    // let { clients, IP, Name, MaxConnections, Port } = config
    console.log(`已在 UartServer 成功注册`);
    this.TcpServer = new TcpServer(config);
    this.TcpServer.start();
    this.Query = new Query(this.io, this.TcpServer, config);
    this.Query.start();
    //run.IntelSendUartData(this.TcpServer)
  }
  _disconnect(): void {
    console.log(`socket连接已丢失，取消发送运行数据`);
  }
}
