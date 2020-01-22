import net, { Socket } from "net";
import EventEmitter from "events";
import config from "../config";
import { registerConfig, client, allSocketInfo } from "./interface";

export default class TcpServer extends net.Server {
  NodeName: string;
  host: string;
  port: number;
  timeout: number;
  SocketMaps: Map<number, client>;
  MacSocketMaps: Map<string, client>;
  constructor(configs: registerConfig) {
    super();
    let { Name, MaxConnections, Port } = configs;
    //限定最大连接数
    this.setMaxListeners(MaxConnections);
    this.NodeName = Name;
    this.host = "0.0.0.0"; //127.0.0.1是监听本机 0.0.0.0是监听整个网络
    this.port = Port || config.localport; //监听端口
    this.timeout = config.timeOut; //超时时间(单位：毫秒)
    this.SocketMaps = new Map();
    this.MacSocketMaps = new Map();
  }

  start(): void {
    this.listen(this.port, this.host, () => {
      console.log(`Server listening: ${this.address()}`);
    })
      .on("connection", this._handleConnection)
      .on("error", err => console.log("Server error: %s.", err));
  }

  _handleConnection(socket: Socket): void {
    let client: client | undefined;
    if (!socket.remotePort || !socket.remoteAddress) return;
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
        mac: "",
        jw: "",
        port,
        stat: false,
        event: new EventEmitter(),
      });
      client = this.SocketMaps.get(port);
    }
    //触发连接事件
    if (!client) throw Error("client error");
    let connectStr: string = `${client["ip"]}, ${client["port"]}`;
    console.log("%s:%s connect.");
    //timeOut
    client.socket
      .on("close", () => {
        console.log("%s:%s disconnect.", connectStr);
        this.closeClient(port);
      })
      .on("error", err => {
        console.log("%s:%s error: %s.", connectStr, err);
        this.closeClient(port);
      })
      .once("data", data => {
        //判断是否是注册包
        if (data.toString().includes("register")) {
          if (!client) throw Error("client error");
          let r = data.toString();
          client.mac = r.slice(9, 24);
          client.jw = r.slice(24, -1);

          this.MacSocketMaps.set(client["mac"], client);
          console.log(`设备注册:Mac=${client.mac},Jw=${client.jw}`);
          client.socket.on("data", (buffer: Buffer) => {
            if (!client) throw Error("client error");
            client.event.emit("recv", buffer);
          });
          this.emit("newTerminal");
        }
      });
  }

  //销毁socket实例，并删除
  closeClient(port: number): void {
    let client = this.SocketMaps.get(port);
    if (!client) throw Error("client error");
    console.log("%s:%s close.", client.ip, client.port);
    client.socket.destroy();
    this.SocketMaps.delete(port);
    this.MacSocketMaps.delete(client.mac);
    this.emit("newTerminal");
  }

  //
  async GetAllInfo(): Promise<allSocketInfo> {
    let getConnections: number | Error = await new Promise((res, rej) => {
      this.getConnections((err, count) => {
        if (err) rej(err);
        res(count);
      });
    });

    return {
      NodeName: this.NodeName,
      Connections: getConnections,
      SocketMaps: [...this.SocketMaps.values()].map(({ mac, port, ip, jw }) => ({
        mac,
        port,
        ip,
        jw,
      })),
    };
  }
}
