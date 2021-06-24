"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const os_1 = __importDefault(require("os"));
class tool {
    /**
     * 节点信息
     */
    static NodeInfo() {
        const hostname = os_1.default.hostname();
        const totalmem = os_1.default.totalmem() / 1024 / 1024 / 1024;
        const freemem = (os_1.default.freemem() / os_1.default.totalmem()) * 100;
        const loadavg = os_1.default.loadavg();
        const type = os_1.default.type();
        const uptime = os_1.default.uptime() / 60 / 60;
        const userInfo = os_1.default.userInfo();
        return {
            hostname,
            totalmem: totalmem.toFixed(1) + "GB",
            freemem: freemem.toFixed(1) + "%",
            loadavg: loadavg.map(el => parseFloat(el.toFixed(1))),
            type,
            uptime: uptime.toFixed(0) + "h",
            userInfo,
        };
    }
    /**
     * 处理AT指令结果
     * @param buffer
     */
    static ATParse(buffer) {
        if (Buffer.isBuffer(buffer)) {
            const str = buffer.toString('utf8');
            return {
                AT: /(^\+ok)/.test(str),
                msg: str.replace(/(^\+ok)/, '').replace(/^\=/, '').replace(/^[0-9]\,/, '')
            };
        }
        else {
            return {
                AT: false,
                msg: ''
            };
        }
    }
}
exports.default = tool;
