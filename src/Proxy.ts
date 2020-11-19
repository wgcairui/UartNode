import { queryOkUp } from "uart";
import axios from "axios"
import config from "./config";

export const ProxyQueryColletion: ProxyHandler<queryOkUp[]> = {
    get(target, p) {
        return Reflect.get(target, p)
    },
    set(target, p, value) {
        // 如果coll结果集中有超过10条数据，上传数据到服务器
        if (target.length > 1 || (p === 'length' && value > 1)) {
            // console.log({ p, value });
            axios.post(config.ServerApi + config.ApiPath.uart, { data: target.splice(0, target.length) })
                .catch(_e => console.log({ msg: config.ApiPath.uart + "UartData api error" }));
            return Reflect.set(target, 'length', 0)
        } else {
            return Reflect.set(target, p, value)
        }
    }
}