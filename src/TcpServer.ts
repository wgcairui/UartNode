import net, { Socket } from "net";
import { EventEmitter } from "events";
import config from "../config";
import { registerConfig, client, QueryEmit, queryObject, queryOkUp } from "./interface";

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
  // 缓存查询对象数组
  private queryList: Map<string, queryObject[]>;
  // 缓存未执行查询的id mac+pid+content
  private querySet: Set<string>
  // 请求成功的结果集
  public QueryColletion: queryOkUp[];
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
    // 事件总线
    this.Event = new EventEmitter()

  }

  start() {
    // webSocketServer start
    this
      .on("connection", this._Connection)
      .on("error", err => console.log("Server error: %s.", err))
      .listen(this.port, this.host, () => {
        console.log(`WebSocketServer listening:`);
        console.log(this.address());
      })
    // 事件总线监听
    this.Event.on(QueryEmit.uartEmpty.toString(), this._uartEmpty) // 监听设备占用解除

  }

  private _Connection(socket: Socket) {
    const port = <number>socket.remotePort;
    const ip = <string>socket.remoteAddress;
    console.log(`new connect,ip:${ip}:${port}`);
    // 配置socket参数
    socket
      .setTimeout(this.timeout)
      .setKeepAlive(true, 100)
      .setNoDelay(true);
    // 配置socket监听
    // 监听第一个包是否是注册包
    //构建客户端
    const client: client = { socket, ip, port, mac: '', jw: '', stat: false, event: new EventEmitter() }

    client.socket.once("data", data => {
      // console.log({ data: data.toString() });
      //判断是否是注册包
      if (data.toString().includes("register")) {
        const r = data.toString();
        client.mac = r.slice(9, 24);
        client.jw = r.slice(24, -1);
        console.log(`设备注册:Mac=${client.mac},Jw=${client.jw}`);
        // 是注册包之后监听正常的数据
        socket.on("data", (buffer: Buffer) => {
          client.event.emit("recv", buffer);
        });
        // 触发新设备上线
        this.Event.emit("terminalOn", client);
        // 添加缓存
        this.MacSet.add(client.mac)
        console.log(this.MacSet);
        
        this.MacSocketMaps.set(client.mac, client);
        this.SocketMaps.set(port, client);
      }
    })
      .on("close", () => {
        this.closeClient(port);
      })
      .on("error", err => {
        this.closeClient(port);
      })
  }

  //销毁socket实例，并删除
  private closeClient(port: number) {
    const client = <client>this.SocketMaps.get(port);
    console.log("%s:%s close.", client.ip, client.port);
    // 设备下线
    this.Event.emit("terminalOff", client);
    // 销毁socket
    client.socket.destroy();
    //
    this.MacSet.delete(client.mac)
    // 销魂缓存
    this.SocketMaps.delete(port);
    // 销毁
    this.MacSocketMaps.delete(client.mac);

  }
  // 发送查询
  public async Query(query: queryObject) {
    const isClient = this.MacSet.has(query.mac)
    //console.log({ query, isClient, mac: this.MacSet });
    // 检测mac是否在线
    if (!isClient) {
      return ({ code: 1, event: "terminalOff", msg: `${query.mac} 未上线` })
    }
    const client = <client>this.MacSocketMaps.get(query.mac);
    // 检测mac是否被占用，如果被占用缓存指令
    if (client.stat) {
      // 检查是否有重复等待查询的指令，
      const isQueryWait = this.querySet.has(query.mac + query.pid + query.content)
      // 请求写入缓存列表
      if (!isQueryWait) this.writeQueryCache(query)
      return ({ code: 1, event: "terminalEmploy", msg: `${query.mac} 被占用` })
    }
    // 锁定设备
    client.stat = true
    // 执行写入操作
    const result = await this._socketWrite(query, client)
    console.log({ result });

    // 查询操作指令正常buffer
    if (result.stat) {
      result.time = new Date().toLocaleString()
      this.QueryColletion.push(result)
      return result
    } else {
      // 写入缓存
      this.writeQueryCache(result)
    }

  }
  // 请求写入缓存列表
  private writeQueryCache(query: queryObject) {
    // 指令写入set
    this.querySet.add(query.mac + query.pid + query.content)
    // 检查相同的mac是否已经有Map key
    const isQueryList = this.queryList.has(query.mac)
    if (isQueryList) {
      const queryList = <queryObject[]>this.queryList.get(query.mac)
      queryList.push(query)
    } else {
      this.queryList.set(query.mac, [query])
    }
  }

  // socket套接字写入
  private _socketWrite(query: queryObject, client: client) {
    // 构建promise,设置超时机制，发送指令后超时rej
    const Query: Promise<queryOkUp> = new Promise((resolve) => {
      // 设置超时
      const timeOut = setTimeout(() => client.event.emit("recv", "timeOut"), config.queryTimeOut);
      // 注册一次监听事件，监听超时或查询数据
      client.event.once("recv", (buffer: Buffer | string) => {
        console.log({buffer});
        // 清除超时    
        clearTimeout(timeOut);
        // 设备占用锁定解除
        client.stat = false;
        // 触发设备占用空
        this._uartEmpty(query.mac)
        //this.Event.emit(QueryEmit.uartEmpty.toString(), query)
        // 构建结果对象
        const queryResult: queryOkUp = Object.assign(query, { buffer, stat: Buffer.isBuffer(buffer) ? true : false })
        resolve(queryResult);
      })
      // 构建查询字符串转换Buffer
      const queryString = query.type == 485 ? Buffer.from(query.content, "hex") : Buffer.from(query.content + "\r", "utf-8")
      // socket套接字写入Buffer
      client.socket.write(queryString);
    })
    return Query
  }

  // 如果设备锁定解除
  private _uartEmpty(mac: string) {
    const queryList = <queryObject[]>this.queryList.get(mac);
    const query = queryList.shift()
    if (query) {
      this.Query(query)
    }
  }
}
