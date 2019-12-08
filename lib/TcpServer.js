const net = require("net");

class TcpServer extends net.Server {
  constructor(p, timeout) {
    super();
    this.address = "0.0.0.0"; //127.0.0.1是监听本机 0.0.0.0是监听整个网络
    this.port = p; //监听端口
    this.timeout = timeout || 0; //超时时间(单位：毫秒)
    this.clients = new Map(); //客户端信息
    this.SocketMaps = new Map();
  }

  start() {
    this.listen(this.port, this.address);
    this.on("connection", this._handleConnection);
    this.on("listening", () => {
      console.log("Server listening: %s:%s.", this.address, this.port);
    });
    this.on("error", err => {
      console.log("Server error: %s.", err);
    });
  }

  _handleConnection(socket) {
    const client = {
      socket: socket,
      ip: socket.remoteAddress,
      port: socket.remotePort
    };
    //console.log('%s:%s connect.', client['ip'], client['port']);
    if (this.timeout != 0) {
      client["lastTime"] = Date.now();
      client["interval"] = setInterval(() => {
        if (Date.now() - client["lastTime"] > this.timeout) {
          //console.log('%s:%s overtime.', client['ip'], client['port']);
          this.closeClient(client["port"]);
        }
      }, this.timeout);
    }
    this.emit("connect", client);

    socket.on("data", data => {
      //console.log('%s:%s send: %s.', client['ip'], client['port'], data.toString());
      if (this.timeout != 0) {
        client["lastTime"] = Date.now();
      }
      //判断是否是注册包
      if (data.toString().includes("register")) {
        let r = data.toString();
        //获取mac
        client["mac"] = r.slice(9, 24);
        //获取经纬度
        client["jw"] = r.slice(24, -1);
        this.clients.set(client["mac"], client["port"]);
        this.emit("register", client);
      } else {
        client["data"] = data;
        this.emit("data", client, data);
      }
    });
    socket.on("close", () => {
      console.log('%s:%s disconnect.', client['ip'], client['port']);
      this.closeClient(this.SocketMaps.get(socket.remotePort));
    });
    socket.on("error", err => {
      console.log("%s:%s error: %s.", client["ip"], client["port"], err);
      this.closeClient(this.SocketMaps.get(socket.remotePort));
    });

    this.SocketMaps.set(socket.remotePort, client);
  }

  setTimeout(time) {
    this.timeout = time;
  }
  getDevSocket(port) {
    if (this.SocketMaps.has(port)) return this.SocketMaps.get(port);
    return null;
  }
  getClient(mac) {
    if (this.clients.has(mac)) return this.clients.get(mac);
    return null;
  }
  closeClient(client) {
    clearInterval(client["interval"]); //停止超时判定
    this.emit("close", client);
    client["socket"].destroy();
    this.SocketMaps.delete(client["port"]);
  }

  broadcast(data) {
    this.SocketMaps.forEach(client => client["socket"].write(data));
  }
}

module.exports = TcpServer;
