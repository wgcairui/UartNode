const net = require("net");
const EventEmitter = require("events").EventEmitter;
const config = require("../config");

class TcpServer extends net.Server {
  constructor(configs) {
    super();
    let { clients, IP, Name, MaxConnections, Port } = configs;
    //限定最大连接数
    this.setMaxListeners(MaxConnections);
    this.NodeName = Name;
    this.host = "0.0.0.0"; //127.0.0.1是监听本机 0.0.0.0是监听整个网络
    this.port = Port || config.localport; //监听端口
    this.timeout = config.timeOut; //超时时间(单位：毫秒)
    this.clients = new Map(); //客户端信息
    this.SocketMaps = new Map();
    this.MacSocketMaps = new Map();
    this.resultArray = [];
  }

  start() {
    this.listen(this.port, this.host, () => {
      let { port, family, address } = this.address();
      console.log(`Server listening: family:${family},address:${address},port:${port}`);
    })
      .on("connection", this._handleConnection)
      .on("error", err => console.log("Server error: %s.", err));
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
      socket
        .setTimeout(this.timeout)
        .setKeepAlive(true, 100)
        .setNoDelay(true);
      this.SocketMaps.set(port, {
        socket,
        ip,
        port,
        stat: false,
        event: new EventEmitter(),
      });
      client = this.SocketMaps.get(port);
    }
    //触发连接事件
    console.log("%s:%s connect.", client["ip"], client["port"]);
    //timeOut
    client.socket
      .on("close", () => {
        console.log("%s:%s disconnect.", client["ip"], client["port"]);
        this.closeClient(port);
      })
      .on("error", err => {
        console.log("%s:%s error: %s.", client["ip"], client["port"], err);
        this.closeClient(port);
      })
      .once("data", data => {
        //判断是否是注册包
        if (data.toString().includes("register")) {
          let r = data.toString();
          client = Object.assign(client, { mac: r.slice(9, 24), jw: r.slice(24, -1) });
          this.MacSocketMaps.set(client["mac"], client);
          console.log(`设备注册:Mac=${client["mac"]},Jw=${client["jw"]}`);
          client.socket.on("data", buffer => client.event.emit("recv", buffer));
          this.emit("newTerminal")
        }
      });
  }

  //销毁socket实例，并删除
  closeClient(port) {
    let client = this.SocketMaps.get(port);
    console.log("%s:%s close.", client["ip"], client["port"]);
    client["socket"].destroy();
    this.SocketMaps.delete(port);
    this.MacSocketMaps.delete(client["mac"]);
    this.emit("newTerminal")
  }

  //
  async GetAllInfo() {
    let getConnections = await new Promise((res, rej) => {
      this.getConnections((err, count) => {
        if (err) rej(err);
        res(count);
      });
    });

    return {
      NodeName: this.NodeName,
      Connections:getConnections,
      SocketMaps: [...this.SocketMaps.values()].map(({ mac, port, ip, jw }) => ({
        mac,
        port,
        ip,
        jw,
      })),
    };
  }
}

module.exports = TcpServer;
