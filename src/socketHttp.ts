import config from "../config";
import axios from "axios"
import tool from "./tool";
import socketClient from "socket.io-client";
import { registerConfig, client, queryObjectServer, instructQuery, ApolloMongoResult } from "./interface";
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
      .on("disconnect", (reason: string) => console.log(`${reason},socket连接已丢失，取消发送运行数据`))  //断开连接时触发    
      .on("error", (error: Error) => { console.log("error") }) // 发生错误时触发
      .on('reconnect_failed', () => { console.log('reconnect_failed') }) // 无法在内部重新连接时触发
      .on('reconnect_error', (error: Error) => { console.log("reconnect_error") }) // 重新连接尝试错误时触发
      .on('reconnecting', (attemptNumber: number) => { console.log({ 'reconnecting': attemptNumber }) }) // 尝试重新连接时触发
      .on('reconnect', (attemptNumber: number) => { console.log({ 'reconnect': attemptNumber }) }) // 重新连接成功后触发
      .on('connect_timeout', (timeout: number) => { console.log({ 'connect_timeout': timeout }) }) // 连接超时
      .on('connect_error', (error: Error) => { console.log("connect_error") }) // 连接出错
      .on("connect", () => { // 连接成功,触发node注册,发送node信息
        console.log(`已连接到UartServer:${config.ServerHost},socketID:${this.io.id},`);
        this.io.emit(config.EVENT_SOCKET.register, tool.NodeInfo());
      })
      .on(config.EVENT_SOCKET.registerSuccess, (data: registerConfig) => this._registerSuccess(data)) // 注册成功,初始化TcpServer
      .on(config.EVENT_SOCKET.query, (Query: queryObjectServer) => this.TcpServer.QueryIntruct(Query)) // 终端设备查询指令
      .on(config.EVENT_SERVER.instructQuery, (Query: instructQuery) => this.TcpServer.SendOprate(Query))  // 终端设备操作指令
  }
  // socket注册成功
  private _registerSuccess(registConfig: registerConfig) {
    console.log('进入TcpServer start流程');
    this.registerConfig = registConfig
    try {
      if (this.TcpServer) {
        console.log('TcpServer实例已存在');
        // 重新注册终端
        this.io.emit(config.EVENT_TCP.terminalOn, Array.from(this.TcpServer.MacSet))
      } else {
        // 根据节点注册信息启动TcpServer
        this.TcpServer = new TcpServer(this.registerConfig);
        this.TcpServer.start();
        // 监听TcpServer事件
        this.TcpServer.Event
          // 监听终端设备上线
          .on(config.EVENT_TCP.terminalOn, (clients: client) => {
            this.io.emit(config.EVENT_TCP.terminalOn, clients.mac)
          })
          // 监听终端设备下线
          .on(config.EVENT_TCP.terminalOff, (clients: client, bytes: number) => {

            this.io.emit(config.EVENT_TCP.terminalOff, clients.mac)
          })
          // 监听终端挂载设备指令查询超时
          .on(config.EVENT_TCP.terminalMountDevTimeOut, (Query, timeoutNum) => {
            this.io.emit(config.EVENT_TCP.terminalMountDevTimeOut, Query, timeoutNum)
          })
          // 监听DTU设备查询指令其中有超时的指令
          .on(config.EVENT_TCP.instructTimeOut,data=>{
            this.io.emit(config.EVENT_TCP.instructTimeOut,data)
          })
          // 监听操作指令完成结果
          .on(config.EVENT_TCP.instructOprate, (Query: instructQuery, result: ApolloMongoResult) => {
            result.msg = 'client' + result.msg
            console.log({ Query, result });
            this.io.emit(Query.events, result)
          })
        // 开启数据定时上传服务
        this.intervalUpload()
      }
    } catch (error) {
      // 告诉服务器节点运行出错
      this.io.emit(config.EVENT_SOCKET.startError, error)
      return
    }
    // 等待10秒,等待终端连接节点,然后告诉服务器节点已准备就绪
    setTimeout(() => {
      this.io.emit(config.EVENT_SOCKET.ready)
    }, 10000)

  }
  // 
  // 定时上传
  private async intervalUpload() {
    {
      // 设备查询结果集
      const DevQueryResult = () => {
        const QueryColletion = this.TcpServer.QueryColletion
        return Object.assign(this.registerConfig, {
          data: QueryColletion
        })
      }

      // interval 2secd
      setInterval(() => {
        if (!this.io.connected) return
        axios
          .post(
            config.ServerApi + config.ApiPath.uart, DevQueryResult())
          .then(() => {
            //console.log(`上传数据条目:${this.TcpServer.QueryColletion.length}`);
            this.TcpServer.QueryColletion = []
          })
          .catch(_e => console.log("UartData api error"));
      }, 1000)
    }

    {
      // 1 min
      setInterval(async () => {
        if (!this.io.connected) return
        // 重新注册终端
        // this.io.emit(config.EVENT_TCP.terminalOn, Array.from(this.TcpServer.MacSet))
        //  WebSocket运行状态
        const WebSocketInfo = async () => {
          return {
            NodeName: (this.registerConfig as registerConfig).Name,
            SocketMaps: Array.from(this.TcpServer.MacSocketMaps.values()),
            // tcpserver连接数量
            Connections: await new Promise((resolve) => {
              this.TcpServer.getConnections((err, count) => {
                resolve(count);
              });
            })
          };
        }
        //
        axios.post(config.ServerApi + config.ApiPath.runNode, { NodeInfo: tool.NodeInfo(), WebSocketInfos: await WebSocketInfo(), updateTime: new Date().toLocaleString() })
          .catch(_e => console.log("UartData api error"));
      }, 1000 * 60)
    }
  }

}
