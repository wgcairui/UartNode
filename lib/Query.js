"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const events_1 = tslib_1.__importDefault(require("events"));
const axios_1 = tslib_1.__importDefault(require("axios"));
const config_1 = tslib_1.__importDefault(require("../config"));
const tool_1 = tslib_1.__importDefault(require("./tool"));
class Query extends events_1.default {
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
        this.TcpServer.on("newTerminal", this._newTerminal);
        this.on("query", this._query)
            .on("uartEmploy", this._uartEmploy)
            .on("uartEmpty", this._uartEmpty)
            .on("QueryOk", this._QueryOk);
    }
    async _query(data) {
        await this.Send(data)
            .then(_res => {
            return;
        })
            .catch(_e => {
            return;
        });
    }
    async _newTerminal() {
        let TcpServer = await this.TcpServer.GetAllInfo();
        axios_1.default
            .post(config_1.default.ServerApi + "/RunData", {
            NodeInfo: tool_1.default.NodeInfo(),
            TcpServer,
        })
            .catch(_e => console.log("RunData api error"));
    }
    async _uploadData() {
        axios_1.default
            .post(config_1.default.ServerApi + "/UartData", Object.assign(this.NodeInfo, {
            data: this.QueryColletion,
        }))
            .then(() => (this.QueryColletion = []))
            .catch(_e => console.log("UartData api error"));
    }
    _uartEmploy(data) {
        let { mac } = data;
        //console.log(JSON.stringify(data) + "加入缓存");
        let queryList = this.queryList.get(mac);
        if (queryList)
            queryList.push(data);
        else
            this.queryList.set(mac, [data]);
        //console.log(mac + "缓存数量：" + this.queryList.get(mac).length);
    }
    _uartEmpty(mac) {
        let queryList = this.queryList.get(mac);
        if (queryList && queryList.length > 0)
            this.Send(queryList.shift());
    }
    async _QueryOk(buffer, data) {
        let query = {
            stat: "success",
            buffer,
            time: new Date(),
        };
        if (typeof (buffer) === "string" && ["timeOut"].includes(buffer)) {
            query.stat = buffer;
        }
        this.QueryColletion.push(Object.assign(query, data));
    }
    async Send(data) {
        let { mac, type, content } = data;
        return await new Promise((res, rej) => {
            const client = this.TcpServer.MacSocketMaps.get(mac);
            if (!client)
                return rej({ error: `${mac} 未上线` });
            if (client.stat) {
                this.emit("uartEmploy", data);
                return rej({ error: `${mac} 被占用` });
            }
            //console.log(`执行查询${content}`);
            client.stat = true;
            let timeOut;
            client.event.once("recv", (buffer) => {
                console.log(buffer);
                clearTimeout(timeOut);
                client.stat = false;
                this.emit("uartEmpty", mac);
                this.emit("QueryOk", buffer, data);
                res(buffer);
            });
            console.log(Buffer.from(content, "hex"));
            client.socket.write(type == 485 ? Buffer.from(content, "hex") : Buffer.from(content + "\r", "utf-8"));
            timeOut = setTimeout(() => client.event.emit("recv", "timeOut"), 1000);
        });
    }
}
exports.default = Query;
//# sourceMappingURL=Query.js.map