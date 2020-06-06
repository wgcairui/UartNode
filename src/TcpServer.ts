import net, { Socket } from "net";
import { EventEmitter } from "events";
import config from "../config";
import {
  registerConfig,
  client,
  queryOkUp,
  queryObjectServer,
  IntructQueryResult,
  instructQuery,
  ApolloMongoResult,
} from "./interface";

export default class TcpServer extends net.Server {
  private host: string;
  private port: number;
  private timeout: number;
  // 缓存port->client
  public SocketMaps: Map<number, client>;
  // 缓存mac->client
  private MacSocketMaps: Map<string, client>;
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
    this.configs = configs
    // net.Server 运行参数配置
    this.setMaxListeners(configs.MaxConnections);
    this.host = "0.0.0.0"; //127.0.0.1是监听本机 0.0.0.0是监听整个网络
    this.port = configs.Port || config.localport; //监听端口
    this.timeout = config.timeOut; //超时时间(单位：毫秒)
    this.SocketMaps = new Map();
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
    };
    console.log(`${new Date().toLocaleTimeString()} ## 透传终端已连接,连接参数: ${client.ip}:${client.port}`);
    // 配置socket参数
    client.socket
      .setTimeout(this.timeout)
      .setKeepAlive(true, 100)
      .setNoDelay(true)
      // 配置socket监听
      .on("close", () => {
        this.closeClient(client);
      })
      .on("error", (err) => {
        this.closeClient(client);
      })
      .on("timeout", () => {
        console.log(`timeout==${client.ip}:${client.port}`);
        this.closeClient(client);
      })
      // 监听第一个包是否是注册包
      .once("data", (data) => {
        //判断是否是注册包
        const r = data.toString(); //'register&mac=98D863CC870D&jw=1111,3333'
        console.log({ r });
        if (/^register&mac=/.test(r)) {
          const registerObjectArray = r.replace(/^register\&/, '').split("&").map(el => {
            const [key, val] = el.split("=")
            return { [key]: val }
          })
          const registerObject = Object.assign({}, ...registerObjectArray) as { [x in string]: string }

          // mac地址为后12位
          const maclen = registerObject.mac.length
          client.mac = registerObject.mac.slice(maclen - 12, maclen);
          client.jw = registerObject.hasOwnProperty("jw") ? registerObject.jw : ''
          // console.log({ data, r, registerObject });
          console.info(
            `${new Date().toLocaleTimeString()} ## 设备注册:Mac=${client.mac},Jw=${client.jw}`,
          );
          // 是注册包之后监听正常的数据
          client.socket.on("data", (buffer: Buffer) => {
            client.event.emit("recv", buffer);
          });
          // 添加缓存
          this.MacSet.add(client.mac);
          this.MacSocketMaps.set(client.mac, client);
          this.SocketMaps.set(client.port, client);
          // 触发新设备上线
          this.Event.emit(config.EVENT_TCP.terminalOn, client);
        }
      });
  }

  //销毁socket实例，并删除
  private closeClient(client: client) {
    //const port = <number>socket.remotePort;
    // 错误和断开连接可能会触发两次事件,判断缓存是否被清除,是的话跳出操作
    if (!client || !this.SocketMaps.has(client.port)) return;
    console.error(`${new Date().toLocaleTimeString()} ## 设备断开:Mac${client.mac} close`);
    // 设备下线
    this.Event.emit(config.EVENT_TCP.terminalOff, client);
    // 销毁socket
    client.socket.destroy();
    //
    this.MacSet.delete(client.mac);
    // 销魂缓存
    this.SocketMaps.delete(client.port);
    // 销毁
    this.MacSocketMaps.delete(client.mac);
  }
  // 查询
  public async QueryIntruct(Query: queryObjectServer) {
    const client = <client>this.MacSocketMaps.get(Query.mac);
    if (!client) {
      console.log(`Query:设备 ${Query.mac} 不在线,拒绝查询`);
      return
    };
    // 检测mac是否被占用，如果被占用缓存指令
    if (client.stat) return this.writeQueryCache(Query);
    // 锁定设备
    client.stat = true;
    // 存储结果集
    /* const IntructQueryResults = [] as IntructQueryResult[];
    // 便利设备的每条指令,阻塞终端,依次查询
    for (let content of Query.content) {
      IntructQueryResults.push(
        await new Promise<IntructQueryResult>((resolve) => {
          const timeOut = setTimeout(
            () => client.event.emit("recv", "timeOut"),
            Query.Interval,
          );
          // 注册一次监听事件，监听超时或查询数据
          client.event.once("recv", (buffer: Buffer | string) => {
            // 清除超时
            clearTimeout(timeOut);
            resolve({ content, buffer });
          });
          // 构建查询字符串转换Buffer
          const queryString =
            Query.type === 485 ? Buffer.from(content, "hex") : Buffer.from(content + "\r", "utf-8");
          // socket套接字写入Buffer
          client.socket.write(queryString);
        }),
      );
    } */
    const PromiseIntructQueryResults = Query.content.map(content => {
      // 构建查询字符串转换Buffer
      const queryString =
        Query.type === 485 ? Buffer.from(content, "hex") : Buffer.from(content + "\r", "utf-8");
      return new Promise<IntructQueryResult>((resolve) => {
        console.time(queryString.toString() + Query.timeStamp);
        const timeOut = setTimeout(
          () => client.event.emit("recv", "timeOut"),
          Query.Interval / 2,
        );
        // 注册一次监听事件，监听超时或查询数据
        client.event.once("recv", (buffer: Buffer | string) => {
          // 清除超时
          clearTimeout(timeOut);
          console.timeEnd(queryString.toString() + Query.timeStamp)
          if (!Buffer.isBuffer(buffer)) {
            console.log({ Query, buffer });
          }
          resolve({ content, buffer });
        });
        // socket套接字写入Buffer
        client.socket.write(queryString);
      })
    })
    // 等待查询执行完成
    const IntructQueryResults = await Promise.all(PromiseIntructQueryResults)
    // 释放占用的端口
    client.stat = false;
    // uart释放处理
    this._uartEmpty(Query);
    // 处理查询的数据集
    this._disposeIntructResult(Query, IntructQueryResults);
    // console.log(IntructQueryResults);
  }
  // 处理查询指令结果集
  private async _disposeIntructResult(Query: queryObjectServer, Result: IntructQueryResult[]) {
    // 如果结果集每条指令都超时则加入到超时记录
    if (Result.every((el) => !Buffer.isBuffer(el.buffer))) {
      this._assertError(Query);
    } else {
      // 刷选出有结果的buffer
      const contents = Result.filter((el) => Buffer.isBuffer(el.buffer));
      // 合成result
      const SuccessResult = Object.assign<queryObjectServer, Partial<queryOkUp>>(Query, {
        contents,
        time: new Date().toLocaleString(),
      }) as queryOkUp;
      // console.log(SuccessResult.time);      
      this.QueryColletion.push(SuccessResult);
      this._assertSuccess(SuccessResult);
    }
  }

  // 如果设备锁定解除
  private _uartEmpty(query: queryObjectServer) {
    // 拦截操作，检查设备下是否有oprate操作指令缓存
    if (this.CacheInstructQuery.has(query.mac)) {
      this._CheckOprateInstruct(query);
    }
    // 构建指令字符hash
    const instruct = query.mac + query.pid;
    // 删除缓存
    this.querySet.delete(instruct);
    // 取出缓存指令数组引用
    const queryList = this.queryList.get(query.mac);
    // 如果有缓存指令
    if (queryList && queryList.length > 0) {
      const querys = queryList.shift() as queryObjectServer;
      this.QueryIntruct(querys);
    }
  }
  // 请求写入缓存列表
  private writeQueryCache(query: queryObjectServer) {
    // 构建缓存指令
    const instruct = query.mac + query.pid;
    // 检查缓存指令是否以存在,存在则取消操作
    if (this.querySet.has(instruct)) return;
    // 指令写入set
    this.querySet.add(instruct);
    // 检查指令缓存内相同的mac是否已经有Map key
    if (this.queryList.has(query.mac)) {
      const list = this.queryList.get(query.mac) as queryObjectServer[];
      // 后期加入指令堆积数量比较->服务器下发数据,比较每个mac指令条目数超出
      if (list.length > 3) console.log(`Mac设备:${query.mac}-PID ${query.pid} 指令堆积超过3,${list.length}`);
      list.push(query);
    } else {
      this.queryList.set(query.mac, [query]);
    }
  }
  // 检查查询超时
  private _assertError(Query: queryObjectServer) {
    // 构建缓存指令
    const instruct = Query.mac + Query.pid;
    const QueryTimeOutList = this.QueryTimeOutList;
    if (QueryTimeOutList.has(instruct)) {
      // 获取指令超时次数
      const num = QueryTimeOutList.get(instruct) as number + 1;
      // 超时次数+1
      QueryTimeOutList.set(instruct, num);
      // 超时次数在限制内=>10,加入查询缓存,重复查询
      if (num < config.queryTimeOutNum) {
        //console.log(`查询指令超时,参数: ${instruct}, num: ${num + 1},加入指令到缓存`);
        this.writeQueryCache(Query);
      } else {
        console.log({
          msg: `查询指令超时,device: ${instruct},${Query.mountDev},超时次数${num}已超限,告警并销毁链接`,
          Query
        });
        // 如果超时次数过多,加入到超时Set,不再发送查询,发送告警信息
        // 销毁client连接
        const client = this.MacSocketMaps.get(Query.mac) as client;
        this.closeClient(client);
        // 加入一个定时清除超时函数,检查设备是否恢复
        // 发送查询指令超时告警
        this.Event.emit(config.EVENT_TCP.terminalMountDevTimeOut, Query);
        setTimeout(() => {
          this.QueryTimeOutList.delete(instruct);
          // 发送查询指令超时恢复告警
          this.Event.emit(config.EVENT_TCP.terminalMountDevTimeOutRestore, Query);
        }, config.queryTimeOutReload);
      }
    } else {
      QueryTimeOutList.set(instruct, 1);
    }
  }
  // 恢复查询记录
  private async _assertSuccess(Q: queryOkUp) {
    // 构建缓存指令
    const instruct = Q.mac + Q.pid;
    const QueryTimeOutList = this.QueryTimeOutList;
    // 如果指令有超时记录,记录大于3则减3,否则删掉记录
    if (QueryTimeOutList.has(instruct) && (QueryTimeOutList.get(instruct) as number) > 3) {
      this.QueryTimeOutList.delete(instruct);
      // 发送查询指令超时恢复告警
      this.Event.emit(config.EVENT_TCP.terminalMountDevTimeOutRestore, Q);
    }
  }
  // 发送查询指令
  public async SendOprate(Query: instructQuery) {
    const client = <client>this.MacSocketMaps.get(Query.DevMac);
    // 检测mac是否在线
    if (!client) {
      this.Event.emit(config.EVENT_TCP.instructOprate, Query, {
        ok: 0,
        msg: "节点设备离线",
      } as ApolloMongoResult);
    }
    // 检测mac是否被占用，如果被占用缓存指令
    if (client.stat) return this._SaveInstructQuery(Query);
    // 锁定设备
    client.stat = true;
    Query.result = await new Promise((resolve) => {
      const timeOut = setTimeout(() => client.event.emit("recv", "timeOut"), config.queryTimeOut);
      client.event.once("recv", (buffer: Buffer | string) => {
        // 清除超时
        clearTimeout(timeOut);
        resolve(buffer);
      });
      // 构建查询字符串转换Buffer
      const queryString =
        Query.type === 485
          ? Buffer.from(Query.content, "hex")
          : Buffer.from(Query.content + "\r", "utf-8");
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
      {
        switch (Query.type) {
          case 232:
            M.msg = "设备已响应,返回数据：" + Query.result.toString("utf8").replace(/(\(|\n|\r)/g, '');
            break
          case 485:
            if (Query.result.readIntBE(1, 1) !== parseInt(Query.content.slice(2, 4))) {
              M.msg = "设备已响应，但操作失败,返回字节：" + Query.result.toString("hex");
            } else {
              M.msg = "设备已响应,返回字节：" + Query.result.toString("hex");
            }
            break
        }

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
    if (this.CacheInstructQuery.has(Query.DevMac)) {
      this.CacheInstructQuery.get(Query.DevMac)?.push(Query);
    } else {
      this.CacheInstructQuery.set(Query.DevMac, [Query]);
    }
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
}
