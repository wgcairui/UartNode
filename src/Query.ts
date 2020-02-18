import { EventEmitter } from "events";
import axios from "axios";
import config from "../config";
import tool from "./tool";
import TcpServer from "./TcpServer";
import { registerConfig, queryObject, queryOkUp, QueryEmit } from "./interface";

export default class Query extends EventEmitter {
  TcpServer: TcpServer;
  NodeInfo: registerConfig;
  IO: SocketIOClient.Socket;
  queryList: Map<string, queryObject[]>;
  private queryStat: Boolean;
  SerialPortEmploy: Set<Object>;
  private QueryColletion: queryOkUp[];

  constructor(IO: SocketIOClient.Socket, TcpServer: TcpServer, Nodeconfig: registerConfig) {
    super();
    this.TcpServer = TcpServer;
    this.NodeInfo = Nodeconfig;
    this.IO = IO;
    this.queryList = new Map(); // 请求指令缓存
    this.queryStat = false; // 指令处理状态
    this.SerialPortEmploy = new Set(); //终端占用状态
    this.QueryColletion = [];
  }

  start(): void {
    setInterval(() => this._uploadData(), 10000);
    this.TcpServer.on("newTerminal", this._newTerminal);
    this.on(QueryEmit.query.toString(), this._query)
      .on(QueryEmit.uartEmploy.toString(), this._uartEmploy)
      .on(QueryEmit.uartEmpty.toString(), this._uartEmpty)
      .on(QueryEmit.QueryOk.toString(), this._QueryOk);
  }

  private _query(data: queryObject): void {
    this.Send(data)
      .then(_res => {
        return;
      })
      .catch(_e => {
        return;
      });
  }
  private async _newTerminal() {
    let TcpServer = await this.TcpServer.GetAllInfo();
    axios
      .post(config.ServerApi + "/RunData", {
        NodeInfo: tool.NodeInfo(),
        TcpServer,
      })
      .catch(_e => console.log("RunData api error"));
  }
  private async _uploadData() {
    axios
      .post(
        config.ServerApi + "/UartData",
        Object.assign(this.NodeInfo, {
          data: this.QueryColletion,
        }),
      )
      .then(() => (this.QueryColletion = []))
      .catch(_e => console.log("UartData api error"));
  }
  private _uartEmploy(data: queryObject) {
    const { mac } = data;
    //console.log(JSON.stringify(data) + "加入缓存");
    if (this.queryList.has(mac))
      this.queryList.get(mac)?.push(data)
    else
      this.queryList.set(mac, [data]);

    //console.log(mac + "缓存数量：" + this.queryList.get(mac).length);
  }
  private _uartEmpty(mac: string) {
    let queryList = this.queryList.get(mac);
    if (queryList?.length as number > 0) this.Send(<queryObject>queryList?.shift());
  }
  private async _QueryOk(buffer: Buffer | string, data: queryObject) {
    data.buffer = buffer
    data.time = new Date()

    if (typeof buffer === "string") data.stat = buffer
    this.QueryColletion.push(data);
  }

  private async Send(data: queryObject): Promise<Buffer | string> {
    let { mac, type, content } = data;
    return new Promise((res, rej) => {
      const client = this.TcpServer.MacSocketMaps.get(mac);
      if (!client) return rej({ error: `${mac} 未上线` });
      if (client.stat) {
        this.emit("uartEmploy", data);
        return rej({ error: `${mac} 被占用` });
      }
      //console.log(`执行查询${content}`);
      client.stat = true;
      let timeOut: NodeJS.Timeout;
      client.event.once("recv", (buffer: Buffer | string) => {
        console.log(buffer);

        clearTimeout(timeOut);
        client.stat = false;
        this.emit("uartEmpty", mac);
        this.emit("QueryOk", buffer, data);
        res(buffer);
      });
      console.log(Buffer.from(content, "hex"));

      client.socket.write(
        type == 485 ? Buffer.from(content, "hex") : Buffer.from(content + "\r", "utf-8"),
      );
      timeOut = setTimeout(() => client.event.emit("recv", "timeOut"), 1000);
    });
  }
}
