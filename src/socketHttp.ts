import config from "../config";
import axios from "axios"
import tool from "./tool";
import socketClient from "socket.io-client";
import TcpServer from "./TcpServer";
import { registerConfig, queryObjectServer, instructQuery, client, ApolloMongoResult, DTUoprate, IntructQueryResult, queryOkUp } from "uart";

export default class Socket {
  TcpServer!: TcpServer;
  io: SocketIOClient.Socket;
  registerConfig?: registerConfig
  // 请求成功的结果集
  public QueryColletion: queryOkUp[];
  // 请求超时设备Set=>mac+pid =>num
  //public QueryTimeOutList: Map<string, number>;

  constructor() {
    console.log(config.ServerHost);
    this.io = socketClient(config.ServerHost, { path: "/Node" })
    //
    this.QueryColletion = [];
    //this.QueryTimeOutList = new Map();
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

      // 终端设备查询指令
      .on(config.EVENT_SOCKET.query, (Query: queryObjectServer) => {
        Query.DevMac = Query.mac
        this.TcpServer.Bus('QueryInstruct', Query, async ({ Query, IntructQueryResults }: { Query: queryObjectServer, IntructQueryResults: IntructQueryResult[] }) => {
          const client = this.TcpServer.MacSocketMaps.get(Query.mac)
          if (client) {
            // 设备查询超时记录
            const QueryTimeOutList = client.timeOut
            // 如果结果集每条指令都超时则加入到超时记录
            if (IntructQueryResults.every((el) => !Buffer.isBuffer(el.buffer))) {
              let num = QueryTimeOutList.get(Query.pid) || 1
              // 超时次数=10次,硬重启DTU设备
              console.log(`###DTU ${Query.mac}/${Query.pid}/${Query.mountDev}/${Query.protocol} 查询指令超时 [${num}]次,pids:${Array.from(client.pids)}`);
              // 如果挂载的pid全部超时且次数大于10,执行设备重启指令
              if (num > 10 && !client.TickClose && client.timeOut.size >= client.pids.size && Array.from(client.timeOut.values()).every(num => num > 10)) {
                this.TcpServer.QueryAT(client, 'Z')
                this.TcpServer._closeClient(client, 'QueryTimeOut');
                console.error(`###DTU ${Query.mac}/pids:${Array.from(client.pids)} 查询指令全部超时十次,硬重启,断开DTU连接`)

              } else {
                client.socket.emit("data", 'end')
                QueryTimeOutList.set(Query.pid, num + 1);
                this.io.emit(config.EVENT_TCP.terminalMountDevTimeOut, Query, num)
              }
            } else {
              // 如果有超时记录,删除超时记录，触发data
              if (client.timeOut.has(Query.pid)) {
                client.socket.emit("data", 'end')
                client.timeOut.delete(Query.pid)
              }
              // 刷选出有结果的buffer
              const contents = IntructQueryResults.filter((el) => Buffer.isBuffer(el.buffer));
              // 获取正确执行的指令
              const okContents = new Set(contents.map(el => el.content))
              // 刷选出其中超时的指令,发送给服务器超时查询记录
              const TimeOutContents = Query.content.filter(el => !okContents.has(el))
              if (TimeOutContents.length > 0) {
                this.io.emit(config.EVENT_TCP.instructTimeOut, Query, TimeOutContents)
                console.log(`###DTU ${Query.mac}/${Query.pid}/${Query.mountDev}/${Query.protocol}指令:[${TimeOutContents.join(",")}] 超时`);
              }
              // 合成result
              const SuccessResult = Object.assign<queryObjectServer, Partial<queryOkUp>>(Query, { contents, time: new Date().toLocaleString() }) as queryOkUp;
              // 加入结果集
              this.QueryColletion.push(SuccessResult);
            }
          }
        })
      })

      // 终端设备操作指令
      .on(config.EVENT_SERVER.instructQuery, (Query: instructQuery) => {
        this.TcpServer.Bus('OprateInstruct', Query, buffer => {
          const result: Partial<ApolloMongoResult> = {
            ok: 0,
            msg: "挂载设备响应超时，请检查指令是否正确或设备是否在线/" + buffer
          };
          if (Buffer.isBuffer(buffer)) {
            result.ok = 1;
            // 检测接受的数据是否合法
            switch (Query.type) {
              case 232:
                result.msg = "设备已响应,返回数据：" + buffer.toString("utf8").replace(/(\(|\n|\r)/g, "");
                break;
              case 485:
                if (buffer.readIntBE(1, 1) !== parseInt((<string>Query.content).slice(2, 4))) result.msg = "设备已响应，但操作失败,返回字节：" + buffer.toString("hex");
                else result.msg = "设备已响应,返回字节：" + buffer.toString("hex");
                break;
            }
          }
          this.io.emit(Query.events, result);
        })
      })

      // 发送终端设备AT指令
      .on(config.EVENT_SERVER.DTUoprate, async (Query: DTUoprate) => {
        this.TcpServer.Bus("ATInstruct", Query as DTUoprate, buffer => {
          const result: Partial<ApolloMongoResult> = {
            ok: 0,
            msg: `${Query.DevMac} 不在线!!`
          }
          const str = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : buffer
          if (/^\+ok/.test(str)) {
            result.ok = 1
            result.msg = str.replace(/(^\+ok)/, '').replace(/^\=/, '').replace(/^[0-9]\,/, '')
          } else if (str === 'timeOut') {
            result.ok = 0
            result.msg = "挂载设备响应超时，请检查指令是否正确或设备是否在线"
          } else {
            result.ok = -1
            result.msg = str
          }
          //console.log({ Query, result });
          this.io.emit(Query.events, result);
        })
      })
  }

  // socket注册成功
  private _registerSuccess(registConfig: registerConfig) {
    console.log('进入TcpServer start流程');
    this.registerConfig = registConfig
    try {
      if (this.TcpServer) {
        console.log('TcpServer实例已存在');
        // 重新注册终端
        this.io.emit(config.EVENT_TCP.terminalOn, Array.from(this.TcpServer.MacSocketMaps.keys()))
      } else {
        // 根据节点注册信息启动TcpServer
        this.TcpServer = new TcpServer(this.registerConfig, this.io);
        this.TcpServer.start();
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
        const QueryColletion = this.QueryColletion
        return Object.assign(this.registerConfig, {
          data: QueryColletion
        })
      }

      // interval 2secd
      setInterval(() => {
        if (this.io.connected) {
          axios.post(config.ServerApi + config.ApiPath.uart, DevQueryResult())
            .then(() => {
              //console.log(`上传数据条目:${this.TcpServer.QueryColletion.length}`);
              this.QueryColletion = []
            })
            .catch(_e => console.log({ err: _e, msg: config.ApiPath.uart + "UartData api error" }));
        }
      }, 1000)
    }

    {
      // 1 min
      setInterval(async () => {
        if (this.io.connected) {
          //  WebSocket运行状态
          const WebSocketInfo = async () => {
            return {
              NodeName: (this.registerConfig as registerConfig).Name,
              SocketMaps: Array.from(this.TcpServer.MacSocketMaps.values()).map(el => ({
                ip: el.ip,
                port: el.port,
                mac: el.mac,
                jw: el.jw,
                uart: el.uart,
                AT: el.AT
              })),
              // tcpserver连接数量
              Connections: await new Promise((resolve) => {
                this.TcpServer.getConnections((err, count) => {
                  resolve(count);
                });
              })
            };
          }

          const WebSocketInfos = await WebSocketInfo()
          axios.post(config.ServerApi + config.ApiPath.runNode,
            { NodeInfo: tool.NodeInfo(), WebSocketInfos, updateTime: new Date().toLocaleString() })
            .catch(_e => console.log({ err: _e, msg: config.ApiPath.runNode + "UartData api error" }));
        }

      }, 1000 * 60)
    }
  }

}
