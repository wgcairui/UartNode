import net, { Socket } from "net";
import config from "../config";
import { client, queryObjectServer, instructQuery, registerConfig, IntructQueryResult, DTUoprate, AT } from "uart";
//18056371098

export default class TcpServer extends net.Server {
  private host: string;
  private port: number;
  // 缓存mac->client
  MacSocketMaps: Map<string, client>;
  // 使用DTU Set
  private UseDTUs: Set<string>
  //
  private configs: registerConfig;
  private io: SocketIOClient.Socket;
  //
  constructor(configs: registerConfig, io: SocketIOClient.Socket) {
    super();
    this.configs = configs;
    this.io = io
    // net.Server 运行参数配置
    this.setMaxListeners(configs.MaxConnections);
    this.host = "0.0.0.0"; //127.0.0.1是监听本机 0.0.0.0是监听整个网络
    this.port = configs.Port || config.localport; //监听端口
    // this.SocketMaps = new Map();
    this.MacSocketMaps = new Map();
    // 在用设备列表
    this.UseDTUs = new Set()
  }

  start() {
    // webSocketServer start
    this.on("connection", this._Connection)
      .on("error", (err) => console.log("Server error: %s.", err))
      .listen(this.port, this.host, () => {
        const ad = this.address() as net.AddressInfo;
        console.log(`### WebSocketServer listening: ${this.configs.IP}:${ad.port}`);
      });
  }

  private _Connection(socket: Socket) {
    //构建客户端
    const client: client = {
      socket,
      ip: socket.remoteAddress as string,
      port: socket.remotePort as number,
      mac: "",
      jw: "",
      AT: false,
      uart: '',
      CacheATInstruct: [],
      CacheOprateInstruct: [],
      CacheQueryInstruct: [],
      timeOut: new Map(),
      TickClose: false
    };
    console.log(
      `${new Date().toLocaleString()} ## DTU连接,连接参数: ${client.ip}:${client.port}`,
    );
    // 配置socket参数
    client.socket
      // 设置socket连接超时
      .setTimeout(config.timeOut)
      // socket保持长连接
      .setKeepAlive(true, 100000)
      // 关闭Nagle算法,优化性能,打开则优化网络,default:false
      .setNoDelay(true)
      // 配置socket监听
      .on("close", () => {
        this._closeClient(client, 'close');
      })
      .on("error", (err) => {
        console.error(err);
        // this._closeClient(client, 'error');
      })
      .on("timeout", () => {
        // console.log(`### timeout==${client.ip}:${client.port}`);
        this._closeClient(client, 'timeOut');
      })
      // 监听第一个包是否是注册包
      .once("data", async (data) => {
        //判断是否是注册包
        const r = data.toString(); //'register&mac=98D863CC870D&jw=1111,3333'
        if (/^register&mac=/.test(r)) {
          const registerObjectArray = r
            .replace(/^register\&/, "")
            .split("&")
            .map((el) => {
              const [key, val] = el.split("=");
              return { [key]: val };
            });
          const registerObject = Object.assign({}, ...registerObjectArray) as { [x in string]: string; };
          // 是注册包之后监听正常的数据
          client.socket.on('data', (buffer: Buffer | string) => {
            if (!Buffer.isBuffer(buffer) && buffer === 'end') {
              this.UseDTUs.delete(client.mac)
              // console.log({ mac: client.mac, msg: 'querySuccess', AT: client.CacheATInstruct, OPRATE: client.CacheOprateInstruct, QUERY: client.CacheQueryInstruct });
              this.CheckClient(client)
            }
          });
          // mac地址为后12位
          const maclen = registerObject.mac.length;
          client.mac = registerObject.mac.slice(maclen - 12, maclen);
          client.jw = registerObject.hasOwnProperty("jw") && /[1-9]/.test(registerObject['jw']) ? registerObject.jw : "";
          const { AT, msg } = await this.QueryAT(client, 'UART=1')
          client.AT = AT
          client.uart = AT ? msg : 'noData'
          console.info(`${new Date().toLocaleTimeString()} ## DTU注册:Mac=${client.mac},Jw=${client.jw},Uart=${client.uart}`);
          // 添加缓存
          this.MacSocketMaps.set(client.mac, client);
          // 触发新设备上线
          this.io.emit(config.EVENT_TCP.terminalOn, client.mac)
        } else {
          // 如果第一个包不是注册包则销毁链接,等待重新连接
          console.log(`###${client.ip}:${client.port} 配置错误或非法连接,销毁连接,[${r}]`);
          client.socket.destroy();
        }
      });
  }

  // 销毁socket实例，并删除
  _closeClient(client: client, event: string) {
    // 错误和断开连接可能会触发两次事件,判断缓存是否被清除,是的话跳出操作
    if (!client || !this.MacSocketMaps.has(client.mac)) return;
    this.MacSocketMaps.delete(client.mac);
    console.error(`${new Date().toLocaleTimeString()} ## 设备断开:Mac${client.mac} close,event:${event}`);
    // 设备下线
    client.TickClose = true
    this.CheckClient(client)
  }

  // 创建事件
  public Bus(EventType: 'QueryInstruct' | 'OprateInstruct' | 'ATInstruct', Query: queryObjectServer | instructQuery | DTUoprate, listener: (buffer: Buffer | any) => void) {
    const { DevMac } = Query
    const client = this.MacSocketMaps.get(DevMac)
    if (client) {
      Query.eventType = EventType
      Query.listener = listener
      switch (EventType) {
        case 'ATInstruct':
          if (this.UseDTUs.has(DevMac)) {
            client.CacheATInstruct.push(Query)
          } else {
            this.ATInstruct(Query)
          }
          break
        case 'OprateInstruct':
          if (this.UseDTUs.has(DevMac)) {
            client.CacheOprateInstruct.push(<instructQuery>Query)
          } else {
            this.OprateInstruct(Query as instructQuery)
          }
          break
        case "QueryInstruct":
          if (this.UseDTUs.has(DevMac)) {
            client.CacheQueryInstruct.push(<queryObjectServer>Query)
            if (client.CacheQueryInstruct.length > 10) {
              console.log(`查询指令已堆积超过10条,清除缓存`);
              client.CacheQueryInstruct = []
            }
          } else {
            this.QueryInstruct(Query as queryObjectServer)
          }
          break
      }
    }
  }

  // 指令查询
  private async QueryInstruct(Query: queryObjectServer) {
    this.UseDTUs.add(Query.DevMac)
    const client = this.MacSocketMaps.get(Query.DevMac) as client
    // 记录socket.bytes
    const Bytes = client.socket.bytesRead + client.socket.bytesWritten;
    // 记录useTime
    const useTime = Date.now();
    // 存储结果集
    const IntructQueryResults = [] as IntructQueryResult[];
    // 便利设备的每条指令,阻塞终端,依次查询
    for (let content of Query.content) {
      const QueryResult = await new Promise<IntructQueryResult>((resolve) => {
        // 指令查询操作开始时间
        const QueryStartTime = Date.now();
        // 设置等待超时
        const QueryTimeOut = setTimeout(() => { client.socket.emit("data", 'timeOut') }, Query.Interval);
        // 注册一次监听事件，监听超时或查询数据
        client.socket.once('data', buffer => {
          clearTimeout(QueryTimeOut);
          resolve({ content, buffer, useTime: Date.now() - QueryStartTime });
        })
        // 构建查询字符串转换Buffer
        const queryString = Query.type === 485 ? Buffer.from(content, "hex") : Buffer.from(content + "\r", "utf-8");
        // socket套接字写入Buffer
        client.socket.write(queryString);
      });
      IntructQueryResults.push(QueryResult);
    }
    // 如果查询设备PID没有超时记录，发送end字符串,提示本次查询已结束
    if (!client.timeOut.has(Query.pid)) client.socket.emit("data", 'end')
    // 统计
    Query.useBytes = client.socket.bytesRead + client.socket.bytesWritten - Bytes;
    Query.useTime = Date.now() - useTime;
    Query.listener({ Query, IntructQueryResults })


  }

  // 指令操作
  private async OprateInstruct(Query: instructQuery) {
    this.UseDTUs.add(Query.DevMac)
    const client = this.MacSocketMaps.get(Query.DevMac) as client
    const buffer = await new Promise<Buffer | string>((resolve) => {
      const QueryTimeOut = setTimeout(() => { client.socket.emit("data", 'timeOut') }, 10000);
      // 注册一次监听事件，监听超时或查询数据
      client.socket.once('data', buffer => {
        clearTimeout(QueryTimeOut);
        resolve(buffer);
      })
      // 构建查询字符串转换Buffer
      const queryString = Query.type === 485 ? Buffer.from(Query.content as string, "hex") : Buffer.from(Query.content as string + "\r", "utf-8");
      // socket套接字写入Buffer
      client.socket.write(queryString);
    });
    // 发送end字符串,提示本次查询已结束
    client.socket.emit("data", 'end')
    Query.listener(buffer)
  }

  // AT指令
  private async ATInstruct(Query: DTUoprate) {
    this.UseDTUs.add(Query.DevMac)
    const client = this.MacSocketMaps.get(Query.DevMac) as client
    const buffer = await new Promise<string | Buffer>((resolve) => {
      const QueryTimeOut = setTimeout(() => { client.socket.emit("data", 'timeOut') }, 10000);
      // 注册一次监听事件，监听超时或查询数据
      client.socket.once('data', buffer => {
        clearTimeout(QueryTimeOut);
        resolve(buffer);
      })
      client.socket.write(Buffer.from(Query.content + "\r", "utf-8"));
    });
    // 发送end字符串,提示本次查询已结束
    client.socket.emit("data", 'end')
    Query.listener(buffer)
  }

  // 当DTU空闲,检查DTU client下面的缓存是否有指令,有的话执行一个
  private CheckClient(client: client) {
    const time = new Date().toLocaleString()
    // 如果TickClose为true,关闭连接
    if (client.TickClose) {
      this.io.emit(config.EVENT_TCP.terminalOff, client.mac, true)
      // 销毁socket
      client.socket.destroy();
      console.log(client.mac + '主动离线,socket销毁状态: ' + client.socket.destroyed);
      //<any>client = null
      client.timeOut.clear()
      client.CacheQueryInstruct = []
      client.CacheOprateInstruct = []
      client.CacheATInstruct = []
      //
      this.getConnections((err, count) => {
        console.log('Tcp Server连接数: ' + count);
      });
      return
    }
    if (client.CacheATInstruct.length > 0) {
      console.log(`${time}### DTU ${client.mac} 缓存有AT指令=${client.CacheATInstruct.length}`);
      this.ATInstruct(client.CacheATInstruct.shift() as DTUoprate)
      return
    }
    if (client.CacheOprateInstruct.length > 0) {
      console.log(`${time}### DTU ${client.mac} 缓存有Oprate指令=${client.CacheOprateInstruct.length}`);
      this.OprateInstruct(client.CacheOprateInstruct.shift() as instructQuery)
      return
    }
    if (client.CacheQueryInstruct.length > 0) {
      console.log(`${time}### DTU ${client.mac} 缓存有Query指令=${client.CacheQueryInstruct.length}`);
      this.QueryInstruct(client.CacheQueryInstruct.shift() as queryObjectServer)
      return
    }
  }

  // 查询AT指令
  async QueryAT(client: client, AT: AT) {
    this.UseDTUs.add(client.mac)
    return await new Promise<{ AT: boolean, msg: string }>((resolve) => {
      const QueryTimeOut = setTimeout(() => { client.socket.emit("data", 'timeOut') }, 1000);
      client.socket.once('data', (buffer: Buffer | string) => {
        clearTimeout(QueryTimeOut);
        // 发送end字符串,提示本次查询已结束
        // client.socket.emit("data", 'end')
        const result = { AT: false, msg: 'timeOut' }
        if (Buffer.isBuffer(buffer)) {
          const str = buffer.toString('utf8')
          result.AT = /(^\+ok)/.test(str)
          result.msg = str.replace(/(^\+ok)/, '').replace(/^\=/, '').replace(/^[0-9]\,/, '')
        }
        this.UseDTUs.delete(client.mac)
        resolve(result);
      })
      client.socket.write(Buffer.from('+++AT+' + AT + "\r", "utf-8"));
    })
  }


}
