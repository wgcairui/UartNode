"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyClient = void 0;
const config_1 = __importDefault(require("./config"));
const IO_1 = __importDefault(require("./IO"));
const socket_1 = __importStar(require("./socket"));
const tool_1 = __importDefault(require("./tool"));
const Cache_1 = __importDefault(require("./Cache"));
class Client {
    //
    constructor(socket, mac, registerArguments) {
        this.mac = mac;
        this.AT = false;
        this.PID = registerArguments.get('host') || '';
        this.ver = '';
        this.Gver = '';
        this.iotStat = '';
        this.jw = '';
        this.uart = '';
        this.ICCID = '';
        this.Cache = [];
        this.timeOut = new Map();
        this.pids = new Set();
        this.reboot = false;
        this.pause = false;
        /**
         * 代理socket对象,监听对象参数修改，触发事件
         */
        //this.socketsb = new Proxy(new socketsb(socket, mac), ProxySocketsb)
        this.socketsb = new socket_1.default(socket, mac);
        /**
         * 发送设备上线
         */
        IO_1.default.emit(config_1.default.EVENT_TCP.terminalOn, mac, false);
        /**
         * 监听socket通道空闲,执行处理流程
         */
        this.socketOn(this.socketsb.getSocket());
    }
    /**
     * 加载socket监听事件
    *  每次重新赋值socket都要重新绑定socket事件
     * @param socket socket连接对象
     */
    socketOn(socket) {
        this.resume('connect');
        return socket
            /**
             * 监听socket通道释放
             */
            .on("free", (tag) => {
            // console.log('free：', tag, this.Cache.length, this.socketsb.getStat().lock);
            this.ProcessingQueue();
        })
            /**
             * 监听socket关闭事件
             */
            .on("close", async (hrr) => {
            console.log(`${new Date().toLocaleTimeString()} ##发送DTU:${this.mac} 离线告警`);
            IO_1.default.emit(config_1.default.EVENT_TCP.terminalOff, this.mac, true);
            this.setPause('close');
            socket.destroy();
            this.socketsb = null;
        })
            .on('Queue', () => {
            // console.log('有新的查询,查询请求堆积数目：', this.Cache.length, this.socketsb.getStat().lock);
            IO_1.default.emit("busy", this.mac, this.Cache.length > 3, this.Cache.length);
            if (!this.socketsb.getStat().lock)
                this.ProcessingQueue();
        });
    }
    /**
     * 获取dtu设备参数,at指令仅支持4G版本模块
     */
    async run() {
        // 等待暂停流程
        await this.setPause('getPropertys');
        const { AT, msg } = await this.QueryAT('PID');
        if (AT) {
            this.AT = AT;
            this.PID = msg;
            this.ver = (await this.QueryAT("VER")).msg;
            this.Gver = (await this.QueryAT("GVER")).msg;
            this.iotStat = (await this.QueryAT("IOTEN")).msg;
            this.ICCID = (await this.QueryAT('ICCID')).msg;
            this.jw = (await this.QueryAT("LOCATE=1")).msg;
            this.uart = (await this.QueryAT("UART=1")).msg;
        }
        // 获得结果,恢复处理流程
        this.resume('getPropertys');
        return this.getPropertys();
    }
    /**
     * 设备断开重新连接之后重新绑定代理socket
     * @param socket
     */
    async reConnectSocket(socket) {
        // 记录socket状态，如果还没有被销毁而重新连接则可能是dtu不稳定，不发生设备恢复上线事件
        // const socket_destroyed = this.socketsb.getSocket().destroyed
        this.socketsb = new Proxy(new socket_1.default(socket, this.mac), socket_1.ProxySocketsb);
        this.socketOn(this.socketsb.getSocket());
        if (this.AT)
            await this.run();
        // 判断是否是主动断开
        if (this.reboot) {
            setTimeout(() => {
                this.reboot = false;
                IO_1.default.emit(config_1.default.EVENT_TCP.terminalOn, this.mac, true);
            }, 120000);
        }
        else
            IO_1.default.emit(config_1.default.EVENT_TCP.terminalOn, this.mac, false);
        console.log({
            time: new Date().toLocaleString(),
            event: `DTU:${this.mac}恢复连接,模式:${this.reboot ? '主动断开' : '被动断开'}`,
            //remind: `设备${socket_destroyed ? '正常' : '未销毁'}重连`
        });
    }
    /**
     * 对外暴露dtu对象属性
     */
    getPropertys() {
        return {
            mac: this.mac,
            ...this.socketsb.getStat(),
            AT: this.AT,
            PID: this.PID,
            ver: this.ver,
            Gver: this.Gver,
            iotStat: this.iotStat,
            jw: this.jw,
            uart: this.uart,
            ICCID: this.ICCID
        };
    }
    /**
     *  查询dtu对象属性,查询行为是高优先级的操作，会暂停整个流程的处理,优先完成查询
     * @param content 查询指令
     */
    async QueryAT(content) {
        // 组装操作指令
        const queryString = Buffer.from('+++AT+' + content + "\r", "utf-8");
        const { buffer } = await this.socketsb.write(queryString);
        return tool_1.default.ATParse(buffer);
    }
    /**
     * 暂停整个处理流程，并等待socket处理未完成的查询操作
     * @param tags 标记标签,用于log标记
     */
    setPause(tags = "null") {
        this.pause = true;
        /*
            0，判断socket是否空闲,如果不是则说明端口正在被使用
            1，等待Process处理流程响应pause操作，响应pause事件
            2，判断socket是否空闲，如果占用状态则等待socket发送free恢复空闲事件
            3，返回最终的操作结果true
        */
        // console.log('SetPause', tags);
        return new Promise((resolve) => {
            if (!this.socketsb.getStat().lock) {
                resolve(true);
            }
            else {
                this.socketsb.getSocket().once('free', () => {
                    resolve(true);
                });
            }
        });
    }
    /**
     * 恢复整个处理流程
     * @param tags
     */
    resume(tags = "null") {
        /*
            如果socket占用状态，等待socket处理完未处理的操作
            把pause标志关闭,
            收到结果之后再次发送free事件，因为下面注册的free监听会在ProcessingQueue之后执行，ProcessingQueue判断的pause值可能是true
        */
        /* return await new Promise<boolean>(resolve => {
            if (this.socketsb.getStat().lock) {
                this.socketsb.getSocket().once('free', () => {
                    this.pause = false
                    resolve(true)
                })
            } else {
                this.pause = false
                resolve(true)
            }
        }).then(() => this.socketsb.getSocket().emit('free')) */
        this.pause = false;
        this.socketsb.getSocket()
            .once('free', () => { }) // console.log('恢复暂停', tags))
            .emit('free', 'resume');
        return this;
    }
    /**
     * 重启socket
     */
    async resatrtSocket() {
        await this.setPause('resatrtSocket');
        this.QueryAT("Z").then(el => {
            this.reboot = true;
            this.socketsb.getSocket()
                .once("connecting", (stat) => {
                // console.log({ el, msg: 'resatrtSocket', ...this.getPropertys() });
            }).destroy();
            this.resume();
        });
    }
    /**
     * 缓存所有操作指令,根据操作类型不同优先级不同
     * 判断缓存操作列表指令堆积数量，大于一条发送设备繁忙状态
     *  顺序为队列式先进先出，at操作和oprate操作会插入到队列的最前面，优先执行
      *  如果socket空闲,运行处理流程,避免因为处理流程为运行而堆积操作
       * 如果socket忙碌，则会在空闲之后发生free事件,在constructor初始化时监听free事件
     * @param Query 发送到dtu上面的查询指令
     */
    saveCache(Query) {
        switch (Query.eventType) {
            case "QueryInstruct":
                this.Cache.push(Query);
                break;
            case "ATInstruct":
            case "OprateInstruct":
                this.Cache.unshift(Query);
                break;
        }
        this.socketsb?.getSocket().emit('Queue');
    }
    /**
     * 运行处理流程
        检查查询缓存中查询堆积是否超过3条，超过发送dtu忙碌状态事件
        判断是否处于暂停模式,是的话跳过处理
        else
            取操作缓存中0位的操作,根据类型执行不同的指令操作
     */
    async ProcessingQueue() {
        IO_1.default.emit("busy", this.mac, this.Cache.length > 3, this.Cache.length);
        // console.log('start ProcessingQueue', this.Cache.length, this.socketsb.getStat().lock, this.pause);
        if (!this.pause && this.Cache.length > 0) {
            const Query = this.Cache.shift();
            if (Query) {
                // console.log('执行查询任务 ', Query.eventType, this.socketsb.getStat().lock);
                switch (Query.eventType) {
                    case "QueryInstruct":
                        this.QueryInstruct(Query);
                        break;
                    case "OprateInstruct":
                        {
                            const query = Query;
                            // 构建查询字符串转换Buffer
                            const queryString = query.type === 485 ? Buffer.from(query.content, "hex") : Buffer.from(query.content + "\r", "utf-8");
                            const result = await this.socketsb.write(queryString);
                            this.OprateParse(query, result);
                        }
                        break;
                    // at操作
                    case "ATInstruct":
                        {
                            const query = Query;
                            // 构建查询字符串转换Buffer
                            const queryString = Buffer.from(query.content + "\r", "utf-8");
                            const result = await this.socketsb.write(queryString);
                            this.ATParse(query, result);
                        }
                        break;
                }
            }
        }
    }
    /**
     *  数据查询指令
     * @param Query
     */
    async QueryInstruct(Query) {
        this.pids.add(Query.pid);
        // 存储结果集
        const IntructQueryResults = [];
        // 如果设备在超时列表中，则把请求指令精简为一条，避免设备离线查询请求阻塞
        if (this.timeOut.has(Query.pid))
            Query.content = [Query.content.pop()];
        // 
        let len = Query.content.length;
        // 便利设备的每条指令,阻塞终端,依次查询
        // console.time(Query.timeStamp + Query.mac + Query.Interval);
        for (let content of Query.content) {
            // 构建查询字符串转换Buffer
            const queryString = Query.type === 485 ? Buffer.from(content, "hex") : Buffer.from(content + "\r", "utf-8");
            // 持续占用端口,知道最后一个释放端口
            const data = await this.socketsb.write(queryString, 10000, --len !== 0);
            IntructQueryResults.push({ content, ...data });
        }
        // this.socketsb.getSocket().emit('free')
        // console.timeEnd(Query.timeStamp + Query.mac + Query.Interval);
        // console.log(IntructQueryResults);
        // 统计
        // console.log(new Date().toLocaleTimeString(), Query.mac + ' success++', this.Cache.length, len);
        Query.useBytes = IntructQueryResults.map(el => el.useByte).reduce((pre, cu) => pre + cu);
        Query.useTime = IntructQueryResults.map(el => el.useTime).reduce((pre, cu) => pre + cu);
        // 获取socket状态
        const socketStat = this.socketsb.getStat();
        // 如果socket已断开，查询结果则没有任何意义
        if (socketStat.connecting) {
            // 如果结果集每条指令都超时则加入到超时记录
            if (IntructQueryResults.every((el) => !Buffer.isBuffer(el.buffer))) {
                const num = this.timeOut.get(Query.pid) || 1;
                // 触发查询超时事件
                IO_1.default.emit(config_1.default.EVENT_TCP.terminalMountDevTimeOut, Query.mac, Query.pid, num);
                // 超时次数=10次,硬重启DTU设备
                console.log(`${new Date().toLocaleString()}###DTU ${Query.mac}/${Query.pid}/${Query.mountDev}/${Query.protocol} 查询指令超时 [${num}]次,pids:${Array.from(this.pids)},interval:${Query.Interval}`);
                // 如果挂载的pid全部超时且次数大于10,执行设备重启指令
                if (num === 10 && !this.socketsb.getSocket().destroyed && this.timeOut.size >= this.pids.size && Array.from(this.timeOut.values()).every(num => num >= 10)) {
                    console.log(`###DTU ${Query.mac}/pids:${Array.from(this.pids)} 查询指令全部超时十次,硬重启,断开DTU连接`);
                    this.resatrtSocket();
                }
                this.timeOut.set(Query.pid, num + 1);
            }
            else {
                // 如果有超时记录,删除超时记录，触发data
                this.timeOut.delete(Query.pid);
                // 刷选出有结果的buffer
                const contents = IntructQueryResults.filter((el) => Buffer.isBuffer(el.buffer));
                // 获取正确执行的指令
                const okContents = new Set(contents.map(el => el.content));
                // 刷选出其中超时的指令,发送给服务器超时查询记录
                const TimeOutContents = Query.content.filter(el => !okContents.has(el));
                if (TimeOutContents.length > 0) {
                    IO_1.default.emit(config_1.default.EVENT_TCP.instructTimeOut, Query.mac, Query.pid, TimeOutContents);
                    console.log(`###DTU ${Query.mac}/${Query.pid}/${Query.mountDev}/${Query.protocol}指令:[${TimeOutContents.join(",")}] 超时`);
                    console.log({ Query, IntructQueryResults });
                }
                // 合成result
                const SuccessResult = Object.assign(Query, { contents, time: new Date().toString() });
                // 加入结果集
                Cache_1.default.QueryColletion.push(SuccessResult);
            }
        }
        else
            console.log('socket is disconnect,QuertInstruct is nothing');
    }
    /**
     * 操作指令结果处理程序
     * @param Query
     * @param res
     */
    OprateParse(Query, res) {
        const { buffer, useTime } = res;
        const result = {
            ok: 0,
            msg: "挂载设备响应超时，请检查指令是否正确或设备是否在线/" + buffer,
            upserted: buffer
        };
        if (Buffer.isBuffer(buffer)) {
            result.ok = 1;
            // 检测接受的数据是否合法
            switch (Query.type) {
                case 232:
                    result.msg = "设备已响应,返回数据：" + buffer.toString("utf8").replace(/(\(|\n|\r)/g, "");
                    break;
                case 485:
                    const str = (buffer.readIntBE(1, 1) !== parseInt(Query.content.slice(2, 4))) ? "设备已响应，但操作失败,返回字节：" : "设备已响应,返回字节：";
                    result.msg = str + buffer.toString("hex");
            }
        }
        console.log({ Query, result, res });
        IO_1.default.emit(Query.events, result);
    }
    /**
     * AT指令结果处理程序
     * @param Query
     * @param res
     */
    ATParse(Query, res) {
        const { buffer, useTime } = res;
        const parse = tool_1.default.ATParse(buffer);
        const result = {
            ok: parse.AT ? 1 : 0,
            msg: parse.AT ? parse.msg : '挂载设备响应超时，请检查指令是否正确或设备是否在线',
            upserted: buffer
        };
        console.log({ Query, result, res });
        IO_1.default.emit(Query.events, result);
    }
}
exports.default = Client;
/**
 * 拦截class对象修改
 */
exports.ProxyClient = {
    set(target, p, value) {
        return Reflect.set(target, p, value);
    }
};
