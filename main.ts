import Socket from "./src/socketHttp"

const socket = new Socket();
//socket注册成功后定时发送数据给server  
socket.start()