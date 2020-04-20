import config from "../config";
import axios from "axios"
import tool from "./tool";
import socketClient from "socket.io-client";
import { registerConfig, queryObject, client } from "./interface";
import TcpServer from "./TcpServer";

export default class Socket {
  TcpServer!: TcpServer;
  io: SocketIOClient.Socket;
  registerConfig?: registerConfig
  constructor() {
    console.log(config.ServerHost);
    this.io = socketClient(config.ServerHost, { path: "/Node" })
  }

  start() {
    // 监听socket
    this.io
      .on("connect", () => {
        console.log(`已连接到UartServer:${config.ServerHost},socketID:${this.io.id},`);
        this.io.emit("register", tool.NodeInfo());
      })
      .on("registerSuccess", (data: registerConfig) => this._registerSuccess(data))
      .on("query", (data: queryObject) => this.TcpServer?.Query(data))
      .on("disconnect", (reason: string) => console.log(`${reason},socket连接已丢失，取消发送运行数据`))  //断开连接时触发    
      .on("error", (error: Error) => { console.log("error") }) // 发生错误时触发
      .on('reconnect_failed', () => { console.log('reconnect_failed') }) // 无法在内部重新连接时触发
      .on('reconnect_error', (error: Error) => { console.log("reconnect_error") }) // 重新连接尝试错误时触发
      .on('reconnecting', (attemptNumber: number) => { console.log({ 'reconnecting': attemptNumber }) }) // 尝试重新连接时触发
      .on('reconnect', (attemptNumber: number) => { console.log({ 'reconnect': attemptNumber }) }) //重新连接成功后触发
      .on('connect_timeout', (timeout: number) => { console.log({ 'connect_timeout': timeout }) })
      .on('connect_error', (error: Error) => { console.log("connect_error") })

  }
  // socket注册成功
  private _registerSuccess(config: registerConfig) {
    this.registerConfig = config
    try {
      if (this.TcpServer) {
        console.log('TcpServer实例已存在');
        // 重新注册终端
        this.TcpServer.MacSet.forEach(el => this.io.emit("terminalOn", el))

      } else {
        this.TcpServer = new TcpServer(config);
        this.TcpServer.start();
        this.TcpServer.Event
          .on("terminalOn", (clients: client) => {
            // console.log({clients});        
            this.io.emit("terminalOn", clients.mac)
          })
          .on("terminalOff", (clients: client) => {
            this.io.emit("terminalOff", clients.mac)
          })
        this.intervalUpload()
      }
    } catch (error) {
      this.io.emit("startError", error)
      return
    }
    this.io.emit("ready")
  }
  // 
  // 定时上传
  private async intervalUpload() {
    // 设备查询结果集
    const DevQueryResult = () => {
      const QueryColletion = this.TcpServer.QueryColletion
      return Object.assign(this.registerConfig, {
        data: QueryColletion
      })
    }
    // Node节点运行状态
    const NodeInfo = tool.NodeInfo()
    //  WebSocket运行状态
    const WebSocketInfo = async () => {
      const getConnections = await new Promise((resolve) => {
        this.TcpServer.getConnections((err, count) => {
          resolve(count);
        });
      });
      const SocketMaps = Array.from(this.TcpServer.SocketMaps.values())
      return {
        NodeName: (this.registerConfig as registerConfig).Name,
        Connections: getConnections,
        SocketMaps
      };
    }
    // interval 2secd
    setInterval(() => {
      axios
        .post(
          config.ServerApi + config.ApiPath.uart, DevQueryResult())
        .then(() => {
          console.log(`上传数据条目:${this.TcpServer.QueryColletion.length}`);
          this.TcpServer.QueryColletion = []
        })
        .catch(_e => console.log("UartData api error"));
    }
      , 1000 * 10)

    // 10 min
    setInterval(async () => {
      const WebSocketInfos = await WebSocketInfo()
      axios.post(config.ServerApi + config.ApiPath.runNode, { NodeInfo, WebSocketInfos, updateTime: new Date().toLocaleString() })
        .then(() => {
          console.log(`上传runData:${new Date().toLocaleString()}`);
        })
        .catch(_e => console.log("UartData api error"));
    }, 1000 * 60 * 10)
  }

}
