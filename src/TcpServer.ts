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
      .listen(this.port, this.host, () => {
        console.log(`WebSocketServer listening:`);
        console.log(this.address());
      })
  }

  private _Connection(socket: Socket) {
    const port = <number>socket.remotePort;
    const ip = <string>socket.remoteAddress;
    console.log(`new connect,ip:${ip}:${port}`);
    // 配置socket参数
    socket
      .setTimeout(this.timeout)
      .setKeepAlive(true, 100)
      .setNoDelay(true)
    // 配置socket监听
    .on("close", () => {
      this.closeClient(socket);
    })
    .on("error", err => {
      this.closeClient(socket);
    })
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
        this.Event.emit(config.EVENT_TCP.terminalOn, client);
        // 添加缓存
        this.MacSet.add(client.mac)
        console.log(this.MacSet);

        this.MacSocketMaps.set(client.mac, client);
        this.SocketMaps.set(port, client);
      }
    })
      
  }

  //销毁socket实例，并删除
  private closeClient(socket: Socket) {
    const port = <number>socket.remotePort;
    const client = <client>this.SocketMaps.get(port);
    console.log({port,client,socket,tine:new Date()});
    
    console.log("%s:%s close.", client.ip, client.port);
    // 设备下线
    this.Event.emit(config.EVENT_TCP.terminalOff, client);
    // 销毁socket
    client.socket.destroy();
    //
    this.MacSet.delete(client.mac)
    // 销魂缓存
    this.SocketMaps.delete(port);
    // 销毁
    this.MacSocketMaps.delete(client.mac);

  }
  // 查询
  public async QueryIntruct(Query: queryObjectServer) {
    // 检测mac是否在线
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
    console.log({msg:'请求超时',Query});
    
    // 构建缓存指令
    const instruct = Query.mac + Query.pid
    if (this.QueryTimeOutList.has(instruct)) {
      const num = this.QueryTimeOutList.get(instruct) as number
      this.QueryTimeOutList.set(instruct, num + 1)
      // 超时次数在限制内,加入查询缓存,重复查询
      if (num < config.queryTimeOutNum) {
        this.writeQueryCache(Query)
      } else {
        // 如果超时次数过多,加入到超时Set,不再发送查询,发送告警信息
        // 加入一个定时清除超时函数,检查设备是否恢复
        // 发送查询指令超时告警
        this.Event.emit(config.EVENT_TCP.terminalMountDevTimeOut, { Query })
        setTimeout(() => {
          this.QueryTimeOutList.delete(instruct)
          // 发送查询指令超时恢复告警
          this.Event.emit(config.EVENT_TCP.terminalMountDevTimeOutRestore, { Query })
        }, config.queryTimeOutReload);
      }
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
      this.Event.emit(config.EVENT_TCP.terminalMountDevTimeOutRestore, { query: Q })
    }
  }
  /* // 发送查询
  public async Query(query: queryObject) {
    // 检测查询指令是否在超时列表内,在的话取消查询
    if (this.QueryTimeOutList.has(query.mac + query.pid + query.content)) return
    // 检测mac是否在线
    if (!this.MacSet.has(query.mac)) return
    const client = <client>this.MacSocketMaps.get(query.mac);
    // 检测mac是否被占用，如果被占用缓存指令
    if (client.stat) return this.writeQueryCache(query)
    // 设备正常,开始指令写入操作
    // 锁定设备
    client.stat = true
    // 执行写入操作
    await this._socketWrite(query, client).then(result => {
      result.time = new Date().toLocaleString()
      this.QueryColletion.push(result)
      this._assertSuccess(result)
    }).catch((e: queryOkUp) => {
      console.log({ e });
      // 检测是否有超时记录,如果没有记录
      if (!this.QueryTimeOut.has(e.mac)) this.QueryTimeOut.set(e.mac, new Map())
      // 获取mac对象
      const Times = this.QueryTimeOut.get(e.mac) as Map<number, timelog>
      // 判断是否包含超时查询PID
      if (!Times.has(e.pid)) {
        Times.set(e.pid, { content: e.content, num: 1 })
      } else {
        this._assertError(Times, e)
      }
    })
  }
  // 请求写入缓存列表
  private writeQueryCache(query: queryObject) {
    // 构建缓存指令
    const instruct = query.mac + query.pid + query.content
    // 检查缓存指令是否以存在,存在则取消操作
    if (this.querySet.has(instruct)) return
    // 指令写入set
    this.querySet.add(instruct)
    // 检查指令缓存内相同的mac是否已经有Map key
    if (this.queryList.has(query.mac)) {
      const list = this.queryList.get(query.mac) as queryObject[]
      // 后期加入指令堆积数量比较->服务器下发数据,比较每个mac指令条目数超出
      if (list.length > 0) {
        console.log(`Mac设备:${query.mac}**指令堆积超过默认值,${list.length}`);

      }
      list.push(query)
    } else {
      this.queryList.set(query.mac, [query])
    }
  }

  // socket套接字写入
  private _socketWrite(query: queryObject, client: client) {
    // 构建promise,设置超时机制，发送指令后超时rej
    return new Promise<queryOkUp>((resolve, reject) => {
      // 设置超时
      const timeOut = setTimeout(() => client.event.emit("recv", "timeOut"), config.queryTimeOut);
      // 注册一次监听事件，监听超时或查询数据
      client.event.once("recv", (buffer: Buffer | string) => {
        // console.log({buffer});
        // 清除超时    
        clearTimeout(timeOut);
        // 设备占用锁定解除
        client.stat = false;
        // 触发设备占用空
        this._uartEmpty(query)
        // 构建结果对象
        const stat = Buffer.isBuffer(buffer) ? true : false
        const queryResult: queryOkUp = Object.assign(query, { buffer, stat })
        if (stat) {
          resolve(queryResult);
        } else {
          reject(queryResult)
        }
      })
      // 构建查询字符串转换Buffer
      const queryString = query.type == 485 ? Buffer.from(query.content, "hex") : Buffer.from(query.content + "\r", "utf-8")
      // socket套接字写入Buffer
      client.socket.write(queryString);
    })
  }

  // 如果设备锁定解除
  private _uartEmpty(query: queryObject) {
    // 构建指令字符hash
    const instruct = query.mac + query.pid + query.content
    // 删除缓存
    this.querySet.delete(instruct)
    // 取出缓存指令数组引用
    const queryList = this.queryList.get(query.mac);
    // 如果有缓存指令
    if (queryList && queryList.length > 0) {
      const querys = queryList.shift() as queryObject
      this.Query(querys)
    }
  }
  // 检查查询超时
  private _assertError(Times: Map<number, timelog>, query: queryOkUp) {
    // 为超时查询自增++
    const PidObj = Times.get(query.pid) as timelog
    PidObj.num = ++PidObj.num
    if (PidObj.num < config.queryTimeOutNum) {
      // 超时次数在限制内,加入查询缓存,重复查询
      this.writeQueryCache(query)
    } else {
      // 如果超时次数过多,加入到超时Set,不再发送查询,发送告警信息
      // 加入一个定时清除超时函数,检查设备是否恢复
      const instruct = query.mac + query.pid + query.content
      this.QueryTimeOutList.add(instruct)
      // 发送查询指令超时告警
      this.Event.emit(config.EVENT_TCP.terminalMountDevTimeOut, { query, PidObj })
      setTimeout(() => {
        this.QueryTimeOutList.delete(instruct)
        PidObj.num = 0
        // 发送查询指令超时恢复告警
        this.Event.emit(config.EVENT_TCP.terminalMountDevTimeOutRestore, { query })
      }, config.queryTimeOutReload);
    }
  }
  // 恢复查询记录
  private async _assertSuccess(Q: queryOkUp) {
    const QueryTimeOut = this.QueryTimeOut
    // 如果指令有超时记录,记录大于3则减3,否则删掉记录
    if (QueryTimeOut.has(Q.mac) && QueryTimeOut.get(Q.mac)?.has(Q.pid)) {
      const O = QueryTimeOut.get(Q.mac)?.get(Q.pid) as timelog
      if (O.num > 3) O.num = O.num - 3
      else QueryTimeOut.get(Q.mac)?.delete(Q.pid)
      // 发送查询指令超时恢复告警
      this.Event.emit(config.EVENT_TCP.terminalMountDevTimeOutRestore, { query: Q })
    }
  } */
}
