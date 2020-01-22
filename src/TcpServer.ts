import net, { Socket } from "net";
import EventEmitter from "events";
import config from "../config";
import { registerConfig, client, allSocketInfo } from "./interface";

export default class TcpServer extends net.Server {
  private NodeName: string;
  private host: string;
  private port: number;
  private timeout: number;
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
      .on("connection", this._Connection)
      .on("error", err => console.log("Server error: %s.", err));
  }

  private _Connection(socket: Socket): void {
    let client: client;
    // if (!socket.remotePort || !socket.remoteAddress) return;
    const port = <number>socket.remotePort;
    const ip = <string>socket.remoteAddress;
    if (this.SocketMaps.has(port)) {
      client = <client>this.SocketMaps.get(port);
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
      client = <client>this.SocketMaps.get(port);
    }
    //触发连接事件
    let connectStr: string = `${client["ip"]}, ${client["port"]}`;
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
          const r = data.toString();
          client.mac = r.slice(9, 24);
          client.jw = r.slice(24, -1);

          this.MacSocketMaps.set(client["mac"], client);
          console.log(`设备注册:Mac=${client.mac},Jw=${client.jw}`);
          client.socket.on("data", (buffer: Buffer) => {
            client.event.emit("recv", buffer);
          });
          this.emit("newTerminal");
        }
      });
  }

  //销毁socket实例，并删除
  private closeClient(port: number): void {
    const client = <client>this.SocketMaps.get(port);
    console.log("%s:%s close.", client.ip, client.port);
    client.socket.destroy();
    this.SocketMaps.delete(port);
    this.MacSocketMaps.delete(client.mac);
    this.emit("newTerminal");
  }

  //
  public async GetAllInfo(): Promise<allSocketInfo> {
    const getConnections: number = await new Promise((res, rej) => {
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
