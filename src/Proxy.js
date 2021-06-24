"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyQueryColletion = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = __importDefault(require("./config"));
/**
 * 节点挂载dtu查询结果集
 */
exports.ProxyQueryColletion = {
    get(target, p) {
        return Reflect.get(target, p);
    },
    set(target, p, value) {
        // 如果coll结果集中有超过10条数据，上传数据到服务器
        if (target.length > 10 || (p === 'length' && value > 10)) {
            // console.log({ p, value });
            const data = target.splice(0, target.length);
            axios_1.default.post(config_1.default.ServerApi + config_1.default.ApiPath.uart, { data })
                .catch(_e => console.log({ msg: config_1.default.ApiPath.uart + "UartData api error" }));
            axios_1.default.post("http://test.ladishb.com:9002/api/Node/UartData", { data })
                .catch(_e => { });
            return Reflect.set(target, 'length', 0);
        }
        else {
            return Reflect.set(target, p, value);
        }
    }
};
