const net = require("net");
const EventEmitter = require("events").EventEmitter;

class TcpServer extends net.Server {
  constructor(port, timeout) {
    super();
    //限定最大连接数
    this.setMaxListeners(2000);
    this.host = "0.0.0.0"; //127.0.0.1是监听本机 0.0.0.0是监听整个网络
    this.port = port; //监听端口
    this.timeout = timeout || 1000 * 60 * 10; //超时时间(单位：毫秒)
    this.clients = new Map(); //客户端信息
    this.SocketMaps = new Map();
    this.resultArray = [];
  }

  start() {
    this.listen(this.port, this.host, () => {
      let { port, family, address } = this.address();
      console.log(
        `Server listening: family:${family},address:${address},port:${port}`
      );
    });
    this.on("connection", this._handleConnection);
    /* this.on("listening", () => {
      
    }); */
    this.on("error", err => console.log("Server error: %s.", err));
  }

  _handleConnection(socket) {
    let client = null;
    let port = socket.remotePort;
    let ip = socket.remoteAddress;
    if (this.SocketMaps.has(port)) {
      client = this.SocketMaps.get(port);
    } else {
      console.log(`new connect,ip:${ip}:${port}`);
      //限定超时时间
      socket.setTimeout(this.timeout);
      //启用长连接
      socket.setKeepAlive(true);
      this.SocketMaps.set(port, {
        socket,
        ip,
        port,
        event: new EventEmitter()
      });
      client = this.SocketMaps.get(port);
    }
    //触发连接事件
    this.emit("connect", client);
    //timeOut
    client.socket.on("timeout", () => {
      this.closeClient(port);
    });
    //
    client.socket.on("end", () => {
      console.log("end");
    });
    //注册监听close
    client.socket.on("close", () => {
      console.log("%s:%s disconnect.", client["ip"], client["port"]);
      this.closeClient(port);
    });
    //注册监听error
    client.socket.on("error", err => {
      console.log("%s:%s error: %s.", client["ip"], client["port"], err);
      this.closeClient(port);
    });
    //注册监听data
    client.socket.on("data", data => {
      //判断是否是注册包
      if (data.toString().includes("register")) {
        let r = data.toString();
        //获取mac
        client["mac"] = r.slice(9, 24);
        //获取经纬度
        client["jw"] = r.slice(24, -1);
        this.clients.set(client["mac"], port);
        this.emit("register", client);
      } else if (data.toString().includes("online")) {
        console.log("online");
      } else {
        if (client.mac) client.event.emit("recv", data);
      }
    });
  }

  //获取socket实例
  getDevSocket(port) {
    if (this.SocketMaps.has(port)) return this.SocketMaps.get(port);
    return null;
  }
  //mac获取port
  getClient(mac) {
    if (this.clients.has(mac)) return this.clients.get(mac);
    return null;
  }
  //销毁socket实例，并删除
  closeClient(port) {
    let client = this.SocketMaps.has(port) ? this.SocketMaps.get(port) : null;
    if (!client) return;
    this.emit("close", client);
    client["socket"].destroy();
    this.SocketMaps.delete(client["port"]);
  }
  //广播
  broadcast(data) {
    console.log(`广播数据：${data}`);
    this.SocketMaps.forEach(client => {
      if (client && this.SocketMaps.has(client.port))
        client["socket"].write(data);
    });
  }

  //send485
  SendClientBind({ mac, type = 485, content, end = "\r", timeout = 1000 }) {
    let client = this.getDevSocket(this.getClient(mac));
    if (!client) return;
    return new Promise((res, rej) => {
      client.event.once("recv", data => {
        switch (data) {
          case "timeOut":
            this.resultArray.push({
              mac,
              content,
              type: "timeOut",
              time: new Date()
            });
            rej({ error: "timeOut" });
            break;

          default:
            this.resultArray.push({
              mac,
              data,
              content,
              type,
              time: new Date()
            });
            res(data);
            break;
        }
      });
      client.socket.write(Buffer.from(type == 485 ? content : content + end));
      setTimeout(() => client.event.emit("recv", "timeOut"), timeout);
    });
  }
  //
  async GetAllInfo() {
    /* console.log(this.SocketMaps);

    console.log(Object.values(this.SocketMaps));
    console.log(this.clients);

    console.log(Object.entries(this.clients));
 */
    let getConnections = new Promise((res, rej) => {
      this.getConnections((err, count) => {
        if (err) rej(err);
        res(count);
      });
    });

    let info = {
      local: Object.assign(this.address(), {
        getConnections: await getConnections
      }),
      SocketMaps: [...this.SocketMaps.values()].map(
        ({ mac, port, address, jw }) => ({
          mac,
          port,
          address,
          jw
        })
      ),
      clients: [...this.clients],
      resultArray: Array.from(new Set(this.resultArray))
    };
    this.resultArray = [];
    return info;
  }
}

module.exports = TcpServer;
