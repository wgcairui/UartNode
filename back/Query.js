const EventEmitter = require("events");
const axios = require("axios");
const config = require("../config");
const tool = require("./tool")

class Query extends EventEmitter {
  constructor(IO, TcpServer, Nodeconfig) {
    super();
    this.TcpServer = TcpServer;
    this.NodeInfo = Nodeconfig;
    this.IO = IO;
    this.queryList = new Map(); // 请求指令缓存
    this.queryStat = false; // 指令处理状态
    this.SerialPortEmploy = new Set(); //终端占用状态
    this.QueryColletion = [];
  }

  start() {
    setInterval(() => this._uploadData(), 10000);
    this.TcpServer.on("newTerminal", this._newTerminal)
    this.on("query", this._query)
      .on("uartEmploy", this._uartEmploy)
      .on("uartEmpty", this._uartEmpty)
      .on("QueryOk", this._QueryOk);
  }

  async _query(data) {
    await this.Send(data)
      .then(res => { return })
      .catch(e => { return });
  }
  async _newTerminal() {
    let TcpServer = await this.GetAllInfo()
    axios
      .post(
        config.ServerApi + "/RunData",
        {
          NodeInfo: tool.NodeInfo(),
          TcpServer
        }
      )
      .catch(e => console.log("RunData api error"));
  }
  async _uploadData() {
    axios
      .post(
        config.ServerApi + "/UartData",
        Object.assign(this.NodeInfo, {
          data: this.QueryColletion,
        }),
      )
      .then(() => (this.QueryColletion = []))
      .catch(e => console.log("UartData api error"));
  }
  _uartEmploy(data) {
    let { mac } = data;
    //console.log(JSON.stringify(data) + "加入缓存");
    if (this.queryList.has(mac)) this.queryList.get(mac).push(data);
    else this.queryList.set(mac, [data]);
    //console.log(mac + "缓存数量：" + this.queryList.get(mac).length);
  }
  _uartEmpty(mac) {
    if (this.queryList.has(mac) && this.queryList.get(mac).length > 0) {
      let data = this.queryList.get(mac).shift()
      //console.log(JSON.stringify(data) + "取出缓存执行");
      this.Send(data);
    }
  }
  async _QueryOk({ buffer, data }) {
    let query = {
      stat: "success",
      buffer,
      time: new Date(),
    };
    if (["timeOut"].includes(buffer)) {
      query.stat = buffer;
      query.buffer = null;
    }
    this.QueryColletion.push(Object.assign(query, data));
  }

  async Send(data) {
    let { mac, type, content } = data;
    let client = this.TcpServer.MacSocketMaps.get(mac);
    if (!client) return await new Promise(rej => rej({ error: `${mac} 未上线` }));
    if (client.stat) {
      this.emit("uartEmploy", data);
      return await new Promise(rej => rej({ error: `${mac} 被占用` }));
    }

    return await new Promise((res) => {
      //console.log(`执行查询${content}`);
      client.stat = true;
      let timeOut;
      client.event.once("recv", buffer => {
        console.log(buffer);

        clearTimeout(timeOut);
        client.stat = false;
        this.emit("uartEmpty", mac);
        this.emit("QueryOk", { buffer, data });
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
module.exports = Query;
