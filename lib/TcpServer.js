const net = require("net");
//const EventEmitter = require("events").EventEmitter;
const config = require("../config");

class TcpServer extends net.Server {
  constructor(port, timeout) {
    super();
    //限定最大连接数
    this.setMaxListeners(2000);
    this.host = "0.0.0.0"; //127.0.0.1是监听本机 0.0.0.0是监听整个网络
    this.port = port || config.localport; //监听端口
    this.timeout = timeout || config.timeOut; //超时时间(单位：毫秒)
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
    this.on("connection", this._handleConnection).on("error", err =>
      console.log("Server error: %s.", err)
    );
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
        //event: new EventEmitter()
      });
      client = this.SocketMaps.get(port);
    }
    //触发连接事件
    this.emit("connect", client);
    //timeOut
    client.socket
      .on("timeout", () => {
        this.closeClient(port);
      })
      .on("end", () => {
        console.log("end");
      })
      .on("close", () => {
        console.log("%s:%s disconnect.", client["ip"], client["port"]);
        this.closeClient(port);
      })
      .on("error", err => {
        console.log("%s:%s error: %s.", client["ip"], client["port"], err);
        this.closeClient(port);
      })
      .on("data", data => {
        //判断是否是注册包
        if (data.toString().includes("register")) {
          let r = data.toString();
          client["mac"] = r.slice(9, 24);
          client["jw"] = r.slice(24, -1);
          this.clients.set(client["mac"], port);
          this.emit("register", client);
        } else if (data.toString().includes("online")) {
          console.log("online");
        } else {
          if (client.mac) client.socket.send("recv", data);
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
  SendClientBind({
    mac,
    type = 485,
    content,
    end = "\r",
    timeout = 1000,
    encoding = "utf8"
  }) {
    let client = this.getDevSocket(this.getClient(mac));
    if (!client) return;
    return new Promise((res, rej) => {
      client.socket.once("recv", data => {
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
      client.socket.write(
        type == 485
          ? Buffer.from(content, "hex")
          : Buffer.from(content + end, encoding)
      );
      setTimeout(() => client.event.emit("recv", "timeOut"), timeout);
    });
  }
  //
  async GetAllInfo() {
    let getConnections = new Promise((res, rej) => {
      this.getConnections((err, count) => {
        if (err) rej(err);
        res(count);
      });
    });

    let info = {
      testBuffer: Buffer.from("cairui"),
      time: new Date(),
      local: Object.assign(this.address(), {
        getConnections: await getConnections
      }),
      SocketMaps: [
        ...this.SocketMaps.values()
      ].map(({ mac, port, ip, jw }) => ({ mac, port, ip, jw })),
      clients: [...this.clients],
      resultArray: Array.from(new Set(this.resultArray))
    };
    this.resultArray = [];
    return info;
    /* { local: {
        address: "0.0.0.0",
        family: "IPv4",
        port: 9000,
        getConnections: 1
      },
      SocketMaps: [
        {
          mac: "866262045427977",
          port: 11970,
          ip: "119.103.133.90",
          jw: "113.969650,29.92906"
        }
      ],
      clients: [["866262045427977", 11970]],
      resultArray: [
        {
          mac: "866262045427977",
          //data: <Buffer 00 03 04 00 8f 02 5e 5b 80>,
          content: "000300000002C5DA",
          type: 485
          //time: 2019-12-11T00:59:14.638Z }
        }
      ]
    }; */
  }

  static hostInfo() {
    return this.address();
  }
}

module.exports = TcpServer;
