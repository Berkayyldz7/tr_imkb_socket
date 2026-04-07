const mqtt = require('mqtt');
const pb = require('protobufjs');
const symbolMessage = pb.loadSync('./proto/Symbol.proto').lookupType('messages.SymbolMessage');
const derivativeMessage = pb.loadSync('./proto/Derivative.proto').lookupType('messages.DerivativeMessage');
const dotenv = require('dotenv');
dotenv.config();

let options = {
    reconnectPeriod: 10000,
    connectTimeout: 3000,
    keepalive: 300,
    username: 'JWT',
    rejectUnauthorized: false,
    qos: 0,
    protocolVersion: 3,
    protocolId: 'MQIsdp',
    password: process.env.PWDd
}

// options.password=process.env.PWD



const marketClientReal = mqtt.connect('wss://rttest.radix.matriksdata.com:443/market', options)
const marketClientDlyd = mqtt.connect('wss://dltest.radix.matriksdata.com:443/market', options)

marketClientDlyd.on('connect', function (connack) {
    console.log('connected...', connack)
});

marketClientDlyd.subscribe("mx/symbol/XU100@lvl2", function (err, granted) {
    console.log("subscription info:", err, granted);
})

marketClientDlyd.on('error',
    function (err) {
        console.log('Connection to real-time market failed: The error:', err)
    });

marketClientDlyd.on('close', function (err) {
    console.log('Connection closed', err);
})

marketClientDlyd.on('message', function (topic, payload) {

    console.log(topic);
    if (topic.indexOf('mx/symbol') > -1) {
        let msg = symbolMessage.decode(payload);
        // console.log(msg);
        const jsonData = JSON.stringify(msg);
        console.log("jsonData:", jsonData);
        return
    }
    if (topic.indexOf('mx/derivative') > -1) {
        let msg = derivativeMessage.decode(payload);
        //console.log(msg);
        const jsonData = JSON.stringify(msg);
        console.log("jsonData:", jsonData);
        return
    }
});


