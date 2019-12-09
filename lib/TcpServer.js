const net = require("net");

class TcpServer extends net.Server {
  constructor(p, timeout) {
    super();
    this.address = "0.0.0.0"; //127.0.0.1是监听本机 0.0.0.0是监听整个网络
    this.port = p; //监听端口
    this.timeout = timeout || 1000 * 60 * 10; //超时时间(单位：毫秒)
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
    let client = null;
    let port = socket.remotePort;
    let ip = socket.remoteAddress;
    if (this.SocketMaps.has(port)) {
      client = this.SocketMaps.get(port);
    } else {
      console.log(`new connect,ip:${ip}:${port}`);
      let endTime = new Date();
      let interval = () => {
        if (timeout == 0) return null;
        return setInterval(() => {
          if (new Date() - endTime > this.timeout) {
            this.closeClient(port);
          }
        }, this.timeout);
      };
      this.SocketMaps.set(port, { socket, ip, port, interval, endTime });
      client = this.SocketMaps.get(port);
    }

    //触发连接事件
    this.emit("connect", client);
    //注册监听data
    socket.on("data", data => {
      client.endTime = new Date();
      //判断是否是注册包
      if (data.toString().includes("register")) {
        let r = data.toString();
        //获取mac
        client["mac"] = r.slice(9, 24);
        //获取经纬度
        client["jw"] = r.slice(24, -1);
        this.clients.set(client["mac"], port);
        this.emit("register", client);
      } else {
        client["data"] = data;
        this.emit("data", client, data);
      }
    });
    //注册监听close
    socket.on("close", () => {
      console.log("%s:%s disconnect.", client["ip"], client["port"]);
      this.closeClient(port);
    });
    //注册监听error
    socket.on("error", err => {
      console.log("%s:%s error: %s.", client["ip"], client["port"], err);
      this.closeClient(port);
    });
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
  closeClient(port) {
    let client = this.SocketMaps.has(port) ? this.SocketMaps.get(port) : null;
    if (!client) return;
    try {
      clearInterval(client["interval"]); //停止超时判定
    } catch (error) {
      console.log(err);
    }
    this.emit("close", client);
    client["socket"].destroy();
    this.SocketMaps.delete(client["port"]);
  }

  broadcast(data) {
    console.log(`广播数据：${data}`);
    this.SocketMaps.forEach(client => client["socket"].write(data));
  }
  sendData({ mac, data }) {
    let port = this.getClient(mac);
    if (!port) return "no port";
    let client = this.getDevSocket(port);
    if (!client) return "no client";
    client.socket.write(data);
    return "success";
  }
}

module.exports = TcpServer;
