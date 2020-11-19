import { queryOkUp } from "uart";
import { ProxyQueryColletion } from "./Proxy";

class Cache {
    // 请求成功的结果集
    public QueryColletion: queryOkUp[];
    constructor() {
        this.QueryColletion = new Proxy<queryOkUp[]>([], ProxyQueryColletion)
    }
}

export default new Cache()