import { queryOkUp } from "uart";
import config from "./config";
import fetch from "./fetch";
/**
 * 节点挂载dtu查询结果集
 */
/*  const ProxyQueryColletion: ProxyHandler<queryOkUp[]> = {
    get(target, p) {
        return Reflect.get(target, p)
    },
    set(target, p, value) {
        // 如果coll结果集中有超过10条数据，上传数据到服务器
        if (target.length/2 > config.count || (p === 'length' && value > 10)) {
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
} */

class Cache {
    /**
     *  请求成功的结果集
     */
    private QueryColletion: queryOkUp[];
    /**
     * 挂载结果集到proxy代理,当数据量超过规定值则上传数据到uart服务器
     */
    constructor() {
        //this.QueryColletion = new Proxy<queryOkUp[]>([], ProxyQueryColletion)
        this.QueryColletion = []
    }

    pushColletion(data: queryOkUp) {
        if (this.QueryColletion.length > config.count / 2) {
            let temp = [...this.QueryColletion, data]
            fetch.queryData(temp)
                .then(() => temp = [])
                .catch(el => fetch.queryData(temp))
            this.QueryColletion = []
        } else {
            this.QueryColletion.push(data)
        }
    }
}

export default new Cache()

