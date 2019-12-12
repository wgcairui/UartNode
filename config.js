const env = true;
module.exports = {
  ServerHost:
    process.env !== "production"
      ? "http://localhost:3000/Node"
      : "http://116.62.48.175:9010/Node",
  ServerApi:
    process.env !== "production"
      ? "http://localhost:3000/Api/Node"
      : "http://116.62.48.175:9010/Api/Node",
  localhost: process.env !== "production" ? "0.0.0.0" : "116.62.48.175",
  localport: process.env !== "production" ? 9000 : 9000,
  timeOut: 1000 * 60 * 10
};
