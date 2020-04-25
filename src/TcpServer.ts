import net, { Socket } from "net";
import { EventEmitter } from "events";
import config from "../config";
import { registerConfig, client, QueryEmit, queryObject, queryOkUp, timelog, queryObjectServer, IntructQueryResult } from "./interface";

export default class TcpServer extends net.Server {
  private host: string;
  private port: number;
  private timeout: number;
  // 缓存port->client
  public SocketMaps: Map<number, client>;
  // 缓存mac->client
  private MacSocketMaps: Map<string, client>;
  // 缓存mac
  public MacSet: Set<string>
  //事件总线
  Event: EventEmitter
  // 缓存查询对象数组:instruct=>query
  private queryList: Map<string, queryObjectServer[]>;
  // 缓存未执行查询的id mac+pid
  private querySet: Set<string>
  // 请求成功的结果集
  public QueryColletion: queryOkUp[];
  // 请求超时设备Set=>mac+pid =>num
  public QueryTimeOutList: Map<string, number>
  //
  constructor(configs: registerConfig) {
    super();
    // net.Server 运行参数配置
    this.setMaxListeners(configs.MaxConnections);
    this.host = "0.0.0.0"; //127.0.0.1是监听本机 0.0.0.0是监听整个网络
    this.port = configs.Port || config.localport; //监听端口
    this.timeout = config.timeOut; //超时时间(单位：毫秒)
    this.SocketMaps = new Map();
    this.MacSocketMaps = new Map();
    this.MacSet = new Set()
    //
    this.queryList = new Map();
    this.querySet = new Set()
    this.QueryColletion = [];
    this.QueryTimeOutList = new Map()
    // 事件总线
    this.Event = new EventEmitter()

  }

  start() {
    // webSocketServer start
    this
      .on("connection", this._Connection)
      .on("error", err => console.log("Server error: %s.", err))
      .on('close', () => {
        console.log('close');
      })
      .listen(this.port, this.host, () => {
        const ad = this.address() as net.AddressInfo
        console.log(`WebSocketServer listening: ${ad.address}:${ad.port}`);
      })
  }

  private _Connection(socket: Socket) {
    const port = <number>socket.remotePort;
    const ip = <string>socket.remoteAddress;
    console.log(`透传终端已连接,连接参数< ${ip}:${port} >`);
    //构建客户端
    const client: client = { socket, ip, port, mac: '', jw: '', stat: false, event: new EventEmitter() }
    // 配置socket参数
    socket
      .setTimeout(this.timeout)
      .setKeepAlive(true, 100)
      .setNoDelay(true)
      // 配置socket监听
      .on("close", () => {
        this.closeClient(client);
      })
      .on("error", err => {
        this.closeClient(client);
      })
      .on('timeout', () => {
        console.log('timeout');

      })
    // 监听第一个包是否是注册包
    client.socket.once("data", data => {
      //判断是否是注册包
      if (data.toString().includes("register")) {
        const r = data.toString();
        client.mac = r.slice(9, 24);
        client.jw = r.slice(24, -1);
        console.log(`设备注册:Mac=${client.mac},Jw=${client.jw}`);
        // 是注册包之后监听正常的数据
        client.socket.on("data", (buffer: Buffer) => {
          client.event.emit("recv", buffer);
        });
        // 触发新设备上线
        this.Event.emit(config.EVENT_TCP.terminalOn, client);
        // 添加缓存
        this.MacSet.add(client.mac)
        this.MacSocketMaps.set(client.mac, client);
        this.SocketMaps.set(port, client);
      }
    })


  }

  //销毁socket实例，并删除
  private closeClient(client: client) {
    //const port = <number>socket.remotePort;
    // 错误和断开连接可能会触发两次事件,判断缓存是否被清除,是的话跳出操作
    if (!client || !this.SocketMaps.has(client.port)) return
    console.log("%s:%s close.", client.ip, client.port);
    // 设备下线
    this.Event.emit(config.EVENT_TCP.terminalOff, client);
    // 销毁socket
    client.socket.destroy();
    //
    this.MacSet.delete(client.mac)
    // 销魂缓存
    this.SocketMaps.delete(client.port);
    // 销毁
    this.MacSocketMaps.delete(client.mac);

  }
  // 查询
  public async QueryIntruct(Query: queryObjectServer) {
    // 检测mac是否在线
    //console.log(this.MacSet);

    if (!this.MacSet.has(Query.mac)) return
    const client = <client>this.MacSocketMaps.get(Query.mac);
    // 检测mac是否被占用，如果被占用缓存指令
    if (client.stat) return this.writeQueryCache(Query)
    // 锁定设备
    client.stat = true
    // 存储结果集
    const IntructQueryResults = [] as IntructQueryResult[]
    // 便利设备的每条指令,阻塞终端,依次查询
    for (let content of Query.content) {
      IntructQueryResults.push(await new Promise<IntructQueryResult>((resolve) => {
        const timeOut = setTimeout(() => client.event.emit("recv", "timeOut"), config.queryTimeOut);
        // 注册一次监听事件，监听超时或查询数据
        client.event.once("recv", (buffer: Buffer | string) => {
          // 清除超时    
          clearTimeout(timeOut);
          resolve({ content, buffer });
        })
        // 构建查询字符串转换Buffer
        const queryString = Query.type === 485 ? Buffer.from(content, "hex") : Buffer.from(content + "\r", "utf-8")
        // socket套接字写入Buffer
        client.socket.write(queryString);
      })
      )
    }
    // 释放占用的端口
    client.stat = false
    this._uartEmpty(Query)
    this._disposeIntructResult(Query, IntructQueryResults)
    console.log(IntructQueryResults);

  }
  // 处理查询指令结果集
  private async _disposeIntructResult(Query: queryObjectServer, Result: IntructQueryResult[]) {
    // 如果结果集每条指令都超时则加入到超时记录
    if (Result.every(el => !Buffer.isBuffer(el.buffer))) {
      this._assertError(Query)
    } else {
      const contents = Result.filter(el => Buffer.isBuffer(el.buffer))
      const SuccessResult = Object.assign<queryObjectServer, Partial<queryOkUp>>(Query, { contents }) as queryOkUp
      this.QueryColletion.push(SuccessResult)
      this._assertSuccess(SuccessResult)
    }
  }

  // 如果设备锁定解除
  private _uartEmpty(query: queryObjectServer) {
    // 构建指令字符hash
    const instruct = query.mac + query.pid
    // 删除缓存
    this.querySet.delete(instruct)
    // 取出缓存指令数组引用
    const queryList = this.queryList.get(query.mac);
    // 如果有缓存指令
    if (queryList && queryList.length > 0) {
      const querys = queryList.shift() as queryObjectServer
      this.QueryIntruct(querys)
    }
  }
  // 请求写入缓存列表
  private writeQueryCache(query: queryObjectServer) {
    // 构建缓存指令
    const instruct = query.mac + query.pid
    // 检查缓存指令是否以存在,存在则取消操作
    if (this.querySet.has(instruct)) return
    // 指令写入set
    this.querySet.add(instruct)
    // 检查指令缓存内相同的mac是否已经有Map key
    if (this.queryList.has(query.mac)) {
      const list = this.queryList.get(query.mac) as queryObjectServer[]
      // 后期加入指令堆积数量比较->服务器下发数据,比较每个mac指令条目数超出
      if (list.length > 0) {
        console.log(`Mac设备:${query.mac}**指令堆积超过默认值,${list.length}`);
      }
      list.push(query)
    } else {
      this.queryList.set(query.mac, [query])
    }
  }
  // 检查查询超时
  private _assertError(Query: queryObjectServer) {
    // 构建缓存指令
    const instruct = Query.mac + Query.pid
    const QueryTimeOutList = this.QueryTimeOutList
    if (QueryTimeOutList.has(instruct)) {
      // 获取指令超时次数
      const num = QueryTimeOutList.get(instruct) as number
      // 超时次数+1
      QueryTimeOutList.set(instruct, num + 1)
      // 超时次数在限制内=>10,加入查询缓存,重复查询
      if (num < config.queryTimeOutNum) {
        console.log(`查询指令超时,参数: ${instruct}, num: ${num + 1},加入指令到缓存`);
        this.writeQueryCache(Query)
      } else {
        console.log(`查询指令超时,参数: ${instruct}, num: ${num + 1},超时次数已超限,告警并销毁链接`);
        console.log({ Query });
        // 如果超时次数过多,加入到超时Set,不再发送查询,发送告警信息
        // 销毁client连接
        const client = this.MacSocketMaps.get(Query.mac) as client
        this.closeClient(client)
        // 加入一个定时清除超时函数,检查设备是否恢复
        // 发送查询指令超时告警
        this.Event.emit(config.EVENT_TCP.terminalMountDevTimeOut, Query)
        setTimeout(() => {
          this.QueryTimeOutList.delete(instruct)
          // 发送查询指令超时恢复告警
          this.Event.emit(config.EVENT_TCP.terminalMountDevTimeOutRestore, Query)
        }, config.queryTimeOutReload);
      }
    } else {
      QueryTimeOutList.set(instruct, 1)
    }
  }
  // 恢复查询记录
  private async _assertSuccess(Q: queryOkUp) {
    // 构建缓存指令
    const instruct = Q.mac + Q.pid
    const QueryTimeOutList = this.QueryTimeOutList
    // 如果指令有超时记录,记录大于3则减3,否则删掉记录
    if (QueryTimeOutList.has(instruct) && QueryTimeOutList.get(instruct) as number > 3) {
      this.QueryTimeOutList.delete(instruct)
      // 发送查询指令超时恢复告警
      this.Event.emit(config.EVENT_TCP.terminalMountDevTimeOutRestore, Q)
    }
  }
}
