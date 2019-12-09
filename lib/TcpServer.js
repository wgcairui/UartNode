const net = require("net");

class TcpServer extends net.Server {
  constructor(port, timeout) {
    super();
    //限定最大连接数
    this.setMaxListeners(2000)
    this.host = "0.0.0.0"; //127.0.0.1是监听本机 0.0.0.0是监听整个网络
    this.port = port; //监听端口
    this.timeout = timeout || 1000 * 60 * 10; //超时时间(单位：毫秒)
    this.clients = new Map(); //客户端信息
    this.SocketMaps = new Map();
    this.resultArray = [];
  }

  start() {
    this.listen(this.port, this.host, () => {      
      let { port, family, address } = this.address()
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
      this.SocketMaps.set(port, { socket, ip, port, interval, endTime });
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
    this.startSocketData(client);
  }

  //start socket listen data
  startSocketData(client) {
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
      } else {
        if (!client.mac) return;
        client.socket.emit("recv", data);
      }
    });
  }
  //stop socket listen data
  stopSocketData(client) {
    client.socket.off("data");
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
    this.SocketMaps.forEach(client => client["socket"].write(data));
  }
  //send
  sendData({ mac, data }) {
    let port = this.getClient(mac);
    if (!port) return "no port";
    let client = this.getDevSocket(port);
    if (!client) return "no client";
    //console.log(`send data to ${mac}`);
    client.socket.write(data);
    return "success";
  }
  //send485
  async SendClientBind({ mac, type = 485, content, end = "\n" }) {
    let port = this.getClient(mac);
    if (!port) return;
    let client = this.getDevSocket(port);
    if (!client) return;
    this.stopSocketData(client);
    let bufferArr = [];
    return await new Promise((res, rej) => {
      /* try {
        client.socket.on("data", data => {
          switch (type) {
            case 485:
              this.resultArray.push({ mac, data, content, type });
              res(data);
              break;
            case 232:
              if (data === end) {
                this.resultArray.push({ mac, data, content, type });
                res(Buffer.from(bufferArr));
              } else bufferArr.push(data);
              break;
          }
        });
      } catch (error) {
        this.resultArray.push({ mac, error, content, type: "error" });
        rej(error);
      } finally {
        this.startSocketData(client);
      } */

      client.socket.on("recv", data => {
        console.log("recv");

        if (type === 485) {
          this.resultArray.push({ mac, data, content, type });
          client.socket.off("recv");
          res(data);
        } else {
          bufferArr.push(data);
          if (data == Buffer.from("\n")) {
            this.resultArray.push({ mac, data, content, type });
            client.socket.off("recv");
            res(Buffer.from(bufferArr));
          }
        }
      });
      client.socket.write(Buffer.from(type == 485 ? content : content + "\n"));
      setTimeout(() => {
        this.resultArray.push({ mac, content, type: "timeOut" });
        rej({ error: "timeOut", bufferArr });
      }, 500);
    });
  }
}
module.exports = TcpServer;
