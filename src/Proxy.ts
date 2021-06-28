import { queryOkUp } from "uart";
import axios from "axios"
import config from "./config";

/**
 * 节点挂载dtu查询结果集
 */
export const ProxyQueryColletion: ProxyHandler<queryOkUp[]> = {
    get(target, p) {
        return Reflect.get(target, p)
    },
    set(target, p, value) {
        // 如果coll结果集中有超过10条数据，上传数据到服务器
        if (target.length > config.cacheNum || (p === 'length' && value > 10)) {
            // console.log({ p, value });
            const data = target.splice(0, target.length)
            axios.post(config.ServerApi + config.ApiPath.uart, { data })
                .catch(_e => console.log({ msg: config.ApiPath.uart + "UartData api error" }));
            axios.post("http://test.ladishb.com:9002/api/Node/UartData", { data })
                .catch(_e => { });
            return Reflect.set(target, 'length', 0)
        } else {
            return Reflect.set(target, p, value)
        }
    }
}