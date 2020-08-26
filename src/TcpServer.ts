import net, { Socket } from "net";
import { EventEmitter } from "events";
import config from "../config";
import { client, queryObjectServer, queryOkUp, instructQuery, registerConfig, IntructQueryResult, ApolloMongoResult, DTUoprate, AT } from "uart";

export default class TcpServer extends net.Server {
  private host: string;
  private port: number;
  // 缓存port->client
  // public SocketMaps: Map<number, client>;
  // 缓存mac->client
  MacSocketMaps: Map<string, client>;
  // 缓存mac
  public MacSet: Set<string>;
  //事件总线
  Event: EventEmitter;
  // 缓存查询对象数组:instruct=>query
  private queryList: Map<string, queryObjectServer[]>;
  // 缓存未执行查询的id mac+pid
  private querySet: Set<string>;
  // 请求成功的结果集
  public QueryColletion: queryOkUp[];
  // 请求超时设备Set=>mac+pid =>num
  public QueryTimeOutList: Map<string, number>;
  // 操作指令缓存 DevMac => instructQuery
  private CacheInstructQuery: Map<string, instructQuery[]>;
  private configs: registerConfig;
  //
  constructor(configs: registerConfig) {
    super();
    this.configs = configs;
    // net.Server 运行参数配置
    this.setMaxListeners(configs.MaxConnections);
    this.host = "0.0.0.0"; //127.0.0.1是监听本机 0.0.0.0是监听整个网络
    this.port = configs.Port || config.localport; //监听端口
    // this.SocketMaps = new Map();
    this.MacSocketMaps = new Map();
    this.MacSet = new Set();
    //
    this.queryList = new Map();
    this.querySet = new Set();
    this.QueryColletion = [];
    this.QueryTimeOutList = new Map();
    this.CacheInstructQuery = new Map();
    // 事件总线
    this.Event = new EventEmitter();
  }

  start() {
    // webSocketServer start
    this.on("connection", this._Connection)
      .on("error", (err) => console.log("Server error: %s.", err))
      .on("close", () => {
        console.log("close");
      })
      .listen(this.port, this.host, () => {
        const ad = this.address() as net.AddressInfo;
        console.log(`WebSocketServer listening: ${this.configs.IP}:${ad.port}`);
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
      stat: false,
      event: new EventEmitter(),
      uart: '',
      CacheATInstruct: [],
      CacheOprateInstruct: [],
      CacheQueryInstruct: []
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
        console.log(`### timeout==${client.ip}:${client.port}`);
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
          client.socket.on("data", (buffer: Buffer) => {
            client.event.emit("recv", buffer);
          });
          // mac地址为后12位
          const maclen = registerObject.mac.length;
          client.mac = registerObject.mac.slice(maclen - 12, maclen);
          client.jw = registerObject.hasOwnProperty("jw") && /[1-9]/.test(registerObject['jw']) ? registerObject.jw : "";
          /* if (!/[1-9]/.test(client.jw)) {
            console.log(client.jw);
            client.jw = await (await this.QueryAT(client, 'LOCATE=1')).slice(2)
          } */
          // 获取DTU串口通讯参数
          client.uart = await this.QueryAT(client, 'UART=1')
          console.info(`${new Date().toLocaleTimeString()} ## DTU注册:Mac=${client.mac},Jw=${client.jw},Uart=${client.uart}`);
          // 添加缓存
          this.MacSet.add(client.mac);
          this.MacSocketMaps.set(client.mac, client);
          // 触发新设备上线
          this.Event.emit(config.EVENT_TCP.terminalOn, client);
        } else {
          // 如果第一个包不是注册包则销毁链接,等待重新连接
          console.log(`###${client.ip}:${client.port} 配置错误或非法连接,销毁连接,[${r}]`);
          client.socket.destroy();
        }
      });
  }

  // 销毁socket实例，并删除
  private _closeClient(client: client, event: string) {
    // 错误和断开连接可能会触发两次事件,判断缓存是否被清除,是的话跳出操作
    if (!client || !this.MacSocketMaps.has(client.mac)) return;
    console.error(`${new Date().toLocaleTimeString()} ## 设备断开:Mac${client.mac} close,event:${event}`);
    // 设备下线
    this.Event.emit(config.EVENT_TCP.terminalOff, client, client.socket.bytesRead + client.socket.bytesWritten,);
    // 销毁socket
    client.socket.destroy();
    // 销毁缓存
    this.MacSet.delete(client.mac);
    // this.SocketMaps.delete(client.port);
    this.MacSocketMaps.delete(client.mac);
  }

  // 查询
  public async QueryIntruct(Query: queryObjectServer) {
    const client = <client>this.MacSocketMaps.get(Query.mac);
    if (client) {
      // 检测mac是否被占用，如果被占用缓存指令
      if (client.stat) {
        this.writeQueryCache(Query);
        return;
      }
      // 记录socket.bytes
      const Bytes = client.socket.bytesRead + client.socket.bytesWritten;
      // 记录useTime
      const useTime = Date.now();
      // 锁定设备
      client.stat = true;
      // 存储结果集
      const IntructQueryResults = [] as IntructQueryResult[];
      // 便利设备的每条指令,阻塞终端,依次查询
      for (let content of Query.content) {
        const QueryResult = await new Promise<IntructQueryResult>((resolve) => {
          {
            // 指令查询操作开始时间
            const QueryStartTime = Date.now();
            // 设置等待超时
            const QueryTimeOut = setTimeout(
              () => client.event.emit("recv", "timeOut"),
              Query.Interval,
            );
            // 注册一次监听事件，监听超时或查询数据
            client.event.once("recv", (buffer: Buffer | string) => {
              // 清除超时
              clearTimeout(QueryTimeOut);
              resolve({ content, buffer, useTime: Date.now() - QueryStartTime });
            });
          }
          // 构建查询字符串转换Buffer
          const queryString =
            Query.type === 485 ? Buffer.from(content, "hex") : Buffer.from(content + "\r", "utf-8");
          // socket套接字写入Buffer
          client.socket.write(queryString);
        });
        IntructQueryResults.push(QueryResult);
      }
      // 释放占用的端口
      client.stat = false;
      // uart释放处理
      this._uartEmpty(Query);
      // 处理查询的数据集
      Query.useBytes = client.socket.bytesRead + client.socket.bytesWritten - Bytes;
      Query.useTime = Date.now() - useTime;
      this._disposeIntructResult(Query, IntructQueryResults);
    } else {
      console.error(`${new Date().toLocaleTimeString()} ## 设备:${Query.mac} 未连接`);
    }
  }

  // 处理查询指令结果集
  private async _disposeIntructResult(Query: queryObjectServer, Result: IntructQueryResult[]) {
    // 构建缓存指令
    const hash = [Query.mac, Query.pid].join('-');
    // 设备查询超时记录
    const QueryTimeOutList = this.QueryTimeOutList;
    // 如果结果集每条指令都超时则加入到超时记录
    if (Result.every((el) => !Buffer.isBuffer(el.buffer))) {
      let num = QueryTimeOutList.get(hash) || 0
      num++
      QueryTimeOutList.set(hash, num);
      // 超时次数=10次,硬重启DTU设备
      if (num === 10) {
        const client = <client>this.MacSocketMaps.get(Query.mac);
        await this.QueryAT(client, 'Z')
        this._closeClient(this.MacSocketMaps.get(Query.mac) as client, 'QueryTimeOut');
        console.error(`DTU${Query.mac} 查询指令全部超时,且超时次数达到十次,发送硬重启指令到DTU,断开DTU连接,发送下线事件`)
      }
      // 超时次数大于12，向服务器发送查询超时
      if (num > 12) {
        console.log({
          mac: Query.mac,
          pid: Query.pid,
          num,
          inter: Query.Interval,
          content: Query.content,
          event: "QuerytimeOut",
        });
        this.Event.emit(config.EVENT_TCP.terminalMountDevTimeOut, Query, num);
      }
    } else {
      // 刷选出有结果的buffer
      const contents = Result.filter((el) => Buffer.isBuffer(el.buffer));
      {
        // 获取正确执行的指令
        const okContents = new Set(contents.map(el => el.content))
        // 刷选出其中超时的指令,发送给服务器超时查询记录
        const TimeOutContents = Query.content.filter(el => !okContents.has(el))
        if (TimeOutContents.length > 0) {
          this.Event.emit(config.EVENT_TCP.instructTimeOut, { mac: Query.mac, instruct: TimeOutContents })
          console.log(`设备:${Query.mac} 下指令:[${TimeOutContents.join(",")}] 超时`);
        }
      }
      // 合成result
      const SuccessResult = Object.assign<queryObjectServer, Partial<queryOkUp>>(Query, { contents, time: new Date().toLocaleString() }) as queryOkUp;
      // 加入结果集
      this.QueryColletion.push(SuccessResult);
      // 检查超时记录内是否有查询指令超时,有的话则删除超时记录
      if (QueryTimeOutList.has(hash) && (QueryTimeOutList.get(hash) as number) > 3)
        this.QueryTimeOutList.delete(hash);
    }
  }

  // 如果设备锁定解除
  private async _uartEmpty(query: queryObjectServer) {
    // 拦截操作，检查设备下是否有oprate操作指令缓存,有则优先执行操作指令
    if (this.CacheInstructQuery.has(query.mac)) {
      await this._CheckOprateInstruct(query);
    }
    // 构建指令字符hash
    const hash = query.mac + query.pid;
    // 删除缓存
    this.querySet.delete(hash);
    // 取出缓存指令数组引用
    const queryList = this.queryList.get(query.mac);
    // 如果有缓存指令
    if (queryList && queryList.length > 0)
      this.QueryIntruct(queryList.shift() as queryObjectServer);
  }
  // 请求写入缓存列表
  private writeQueryCache(query: queryObjectServer) {
    // 构建缓存指令
    const hash = query.mac + query.pid;
    // 检查缓存指令是否以存在,存在则取消操作
    if (this.querySet.has(hash)) return;
    // 指令写入set
    this.querySet.add(hash);
    // 检查指令缓存内相同的mac是否已经有Map key
    if (this.queryList.has(query.mac)) {
      const list = this.queryList.get(query.mac) as queryObjectServer[];
      list.push(query);
      // 后期加入指令堆积数量比较->服务器下发数据,比较每个mac指令条目数超出
      if (list.length > 3)
        console.log(
          `Mac设备:${query.mac}-${query.pid},${query.mountDev},查询指令堆积超过3,${list.length}`,
        );
    } else this.queryList.set(query.mac, [query]);
  }

  // 发送查询指令
  public async SendOprate(Query: instructQuery) {
    const client = <client>this.MacSocketMaps.get(Query.DevMac);
    // 检测mac是否在线
    if (!client) {
      this.Event.emit(config.EVENT_TCP.instructOprate, Query, { ok: 0, msg: "节点设备离线", } as ApolloMongoResult);
      return
    }
    // 检测mac是否被占用，如果被占用缓存指令
    if (client.stat) return this._SaveInstructQuery(Query);
    // 锁定设备
    client.stat = true;
    Query.result = await new Promise((resolve) => {
      const timeOut = setTimeout(() => client.event.emit("recv", "timeOut"), Query.Interval);
      client.event.once("recv", (buffer: Buffer | string) => {
        // 清除超时
        clearTimeout(timeOut);
        resolve(buffer as any);
      });
      // 构建查询字符串转换Buffer
      const queryString = Query.type === 485 ? Buffer.from(Query.content as string, "hex") : Buffer.from(Query.content + "\r", "utf-8");
      // socket套接字写入Buffer
      client.socket.write(queryString);
    });
    // 释放占用的端口
    client.stat = false;
    // 检测结果是否为超时
    const M: Partial<ApolloMongoResult> = {};
    if (Buffer.isBuffer(Query.result)) {
      M.ok = 1;
      // 检测接受的数据是否合法
      switch (Query.type) {
        case 232:
          M.msg =
            "设备已响应,返回数据：" + Query.result.toString("utf8").replace(/(\(|\n|\r)/g, "");
          break;
        case 485:
          if (Query.result.readIntBE(1, 1) !== parseInt((<string>Query.content).slice(2, 4))) {
            M.msg = "设备已响应，但操作失败,返回字节：" + Query.result.toString("hex");
          } else {
            M.msg = "设备已响应,返回字节：" + Query.result.toString("hex");
          }
          break;
      }
    } else {
      M.ok = 0;
      M.msg = "挂载设备响应超时，请检查指令是否正确或设备是否在线";
    }
    this.Event.emit(config.EVENT_TCP.instructOprate, Query, M);
  }

  // 缓存查询操作指令，在_uartEmpty函数内部拦截对象
  private _SaveInstructQuery(Query: instructQuery) {
    // 如果缓存内有mac记录
    if (this.CacheInstructQuery.has(Query.DevMac)) this.CacheInstructQuery.get(Query.DevMac)?.push(Query);
    else this.CacheInstructQuery.set(Query.DevMac, [Query]);
  }
  // 检查操作指令缓存，发送操作指令，指令具有高优先级
  private async _CheckOprateInstruct(query: queryObjectServer) {
    // 获取操作指令列表
    const OprateArr = this.CacheInstructQuery.get(query.mac) as instructQuery[];
    // 迭代指令
    for (let instruct of OprateArr) {
      await this.SendOprate(instruct);
    }
    // 清除缓存
    this.CacheInstructQuery.delete(query.mac);
  }


  // 发送DTU AT指令
  public async SendAT(Query: DTUoprate) {
    const client = <client>this.MacSocketMaps.get(Query.DevMac);
    const result: Partial<ApolloMongoResult> = {
      ok: 0,
      msg: `${Query.DevMac} 不在线!!`
    }
    if (client) {
      const str = await new Promise<string>((resolve) => {
        const timeOut = setTimeout(() => client.event.emit("recv", "timeOut"), 5000);
        client.event.once("recv", (buffer: Buffer | string) => {
          // 清除超时
          clearTimeout(timeOut);
          if (Buffer.isBuffer(buffer)) {
            buffer = buffer.toString('utf8')
          }
          resolve(buffer);
        });
        // socket套接字写入Buffer
        client.socket.write(Buffer.from(Query.content + "\r", "utf-8"));
      });
      if (/^\+ok*/.test(str)) {
        result.ok = 1
        result.msg = str.replace(/(^\+ok)/, '').replace(/^\=/, '').replace(/^[0-9]\,/, '')
      } else if (str === 'timeOut') {
        result.ok = 0
        result.msg = "挂载设备响应超时，请检查指令是否正确或设备是否在线"
      } else {
        result.ok = -1
        result.msg = str
      }
    }
    return result
  }

  // 查询AT指令
  private async QueryAT(client: client, AT: AT) {
    return await new Promise<string>((resolve) => {
      const timeOut = setTimeout(() => client.event.emit("recv", "timeOut"), 5000);
      client.event.once("recv", (buffer: Buffer | string) => {
        // 清除超时
        clearTimeout(timeOut);
        if (Buffer.isBuffer(buffer)) {
          buffer = buffer.toString('utf8').replace(/(^\+ok)/, '').replace(/^\=/, '').replace(/^[0-9]\,/, '')
        }
        resolve(buffer);
      });
      // socket套接字写入Buffer
      client.socket.write(Buffer.from('+++AT+' + AT + "\r", "utf-8"));
    })
  }
}
