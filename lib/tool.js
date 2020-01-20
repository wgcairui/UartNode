"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const os_1 = tslib_1.__importDefault(require("os"));
class tool {
    static NodeInfo() {
        let hostname = os_1.default.hostname();
        let totalmem = os_1.default.totalmem() / 1024 / 1024 / 1024;
        let freemem = (os_1.default.freemem() / os_1.default.totalmem()) * 100;
        let loadavg = os_1.default.loadavg();
        let networkInterfaces = os_1.default.networkInterfaces();
        let type = os_1.default.type();
        let uptime = os_1.default.uptime() / 60 / 60;
        let userInfo = os_1.default.userInfo();
        return {
            hostname,
            totalmem: totalmem + "GB",
            freemem: freemem + "%",
            loadavg,
            networkInterfaces,
            type,
            uptime: uptime + "h",
            userInfo,
        };
    }
}
exports.default = tool;
//# sourceMappingURL=tool.js.map