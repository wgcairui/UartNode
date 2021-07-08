import axios from "axios"
import { queryOkUp } from "uart"
import config from "./config"

class Fetch {

    /**
     * 上传dtu信息
     * @param info 
     */
    dtuInfo(info: Partial<Uart.Terminal & { mac: string }>) {
        info.DevMac = info.mac
        return this.fetch("dtuinfo", { info })
    }

    /**
     * 上传节点运行状态
     * @param node 
     * @param tcp 
     */
    nodeInfo(name: string, node: Uart.nodeInfo, tcp: number) {
        return this.fetch('nodeInfo', { name, node, tcp })
    }

    /**
     * 上传查询数据
     * @param data 
     */
    queryData(data: queryOkUp[]) {
        return this.fetch("queryData", { data })
    }

    async fetch<T>(path: string, data: any = {}) {
        try {
            const el = await axios.post<T>(config.ServerApi + path, data)
            return el.data
        } catch (err) {
            console.log(err.messge);

            return err
        }
    }
}

export default new Fetch()