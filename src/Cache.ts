import { queryOkUp } from "uart";
import { ProxyQueryColletion } from "./Proxy";

class Cache {
    /**
     *  请求成功的结果集
     */
    public QueryColletion: queryOkUp[];
    /**
     * 挂载结果集到proxy代理,当数据量超过规定值则上传数据到uart服务器
     */
    constructor() {
        this.QueryColletion = new Proxy<queryOkUp[]>([], ProxyQueryColletion)
    }
}

export default new Cache()