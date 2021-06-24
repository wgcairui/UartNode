"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Proxy_1 = require("./Proxy");
class Cache {
    /**
     * 挂载结果集到proxy代理,当数据量超过规定值则上传数据到uart服务器
     */
    constructor() {
        this.QueryColletion = new Proxy([], Proxy_1.ProxyQueryColletion);
    }
}
exports.default = new Cache();
