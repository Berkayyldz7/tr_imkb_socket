const mqtt = require("mqtt");
const pb = require("protobufjs");
const dotenv = require("dotenv");
const path = require("path");

// dotenv.config();

dotenv.config({
  path: path.resolve(__dirname, ".env"),
});

const DEFAULT_BROKER_URL = "wss://dltest.radix.matriksdata.com:443/market";
const DEFAULT_REAL_BROKER_URL = "wss://rttest.radix.matriksdata.com:443/market";
const DEFAULT_SYMBOL_PROTO = "./proto/Symbol.proto";
const DEFAULT_DERIVATIVE_PROTO = "./proto/Derivative.proto";

class LiveDataClient {
  constructor({
    options = {},
    symbolProtoPath = DEFAULT_SYMBOL_PROTO,
    derivativeProtoPath = DEFAULT_DERIVATIVE_PROTO,
    sources = null,
  } = {}) {
    this.options = {
      reconnectPeriod: 10000,
      connectTimeout: 3000,
      keepalive: 300,
      username: "JWT",
      rejectUnauthorized: false,
      qos: 0,
      protocolVersion: 3,
      protocolId: "MQIsdp",
      password: process.env.PWDd,
      ...options,
    };

    this.sources = this._buildSources(sources);
    this.clients = new Map();
    this.started = false;
    this.latestBySymbol = new Map();
    this.updateHandlers = new Set();
    this.symbolMessage = pb.loadSync(symbolProtoPath).lookupType("messages.SymbolMessage");
    this.derivativeMessage = pb.loadSync(derivativeProtoPath).lookupType("messages.DerivativeMessage");
  }

  async start() {
    if (this.started) {
      return;
    }

    await Promise.all(this.sources.map((source) => this._connectSource(source)));
    this.started = true;
  }

  async stop() {
    if (!this.clients.size) {
      this.started = false;
      return;
    }

    const closers = [];
    for (const [sourceName, client] of this.clients.entries()) {
      client.removeListener("message", this._handleMessage);
      client.removeListener("close", this._handleClose);
      client.removeListener("error", this._handleRuntimeError);
      closers.push(
        new Promise((resolve) => {
          client.end(false, {}, resolve);
        })
      );
      this.clients.delete(sourceName);
    }

    await Promise.all(closers);
    this.started = false;
  }

  async subscribeSymbol(sourceName, topic) {
    const source = this.sources.find((item) => item.name === sourceName);
    if (!source) {
      throw new Error(`Bilinmeyen source: ${sourceName}`);
    }

    if (!source.subscriptions.includes(topic)) {
      source.subscriptions.push(topic);
    }

    if (this.started) {
      await this._subscribeTopic(sourceName, topic);
    }
  }

  getLatest(symbolCode) {
    return this.latestBySymbol.get(symbolCode) || null;
  }

  getLatestPrice(symbolCode) {
    return this.getLatest(symbolCode)?.last ?? null;
  }

  getLatestDayClose(symbolCode) {
    return this.getLatest(symbolCode)?.dayClose ?? null;
  }

  onUpdate(handler) {
    if (typeof handler !== "function") {
      throw new Error("onUpdate icin function vermelisiniz.");
    }

    this.updateHandlers.add(handler);

    return () => {
      this.updateHandlers.delete(handler);
    };
  }

  _subscribeTopic(sourceName, topic) {
    const client = this.clients.get(sourceName);
    if (!client) {
      return Promise.reject(new Error(`Source baglantisi yok: ${sourceName}`));
    }

    return new Promise((resolve, reject) => {
      client.subscribe(topic, (error, granted) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(granted);
      });
    });
  }

  _handleMessage = (topic, payload) => {
    const decoded = this._decodeMessage(topic, payload);
    if (!decoded) {
      return;
    }

    const normalized = this._normalizeMessage(topic, decoded);
    this.latestBySymbol.set(normalized.symbolCode, normalized);

    for (const handler of this.updateHandlers) {
      handler(normalized);
    }
  };

  _handleClose = () => {
    this.started = false;
  };

  _handleRuntimeError = (error) => {
    console.error("Live data error:", error.message || error);
  };

  _decodeMessage(topic, payload) {
    if (topic.includes("mx/symbol")) {
      return this.symbolMessage.decode(payload);
    }

    if (topic.includes("mx/derivative")) {
      return this.derivativeMessage.decode(payload);
    }

    return null;
  }

  _normalizeMessage(topic, message) {
    return {
      topic,
      marketType: topic.includes("mx/derivative") ? "derivative" : "symbol",
      symbolId: message.symbolId,
      symbolCode: message.symbolCode,
      updateDate: message.updateDate || null,
      last: message.last ?? null,
      dayClose: message.dayClose ?? null,
      bid: message.bid ?? null,
      ask: message.ask ?? null,
      low: message.low ?? null,
      high: message.high ?? null,
      open: message.open ?? null,
      quantity: message.quantity ?? null,
      volume: message.volume ?? null,
      initialMargin: message.initialMargin ?? null,
      raw: message,
    };
  }

  _buildSources(sources) {
    if (Array.isArray(sources) && sources.length) {
      return sources.map((source) => ({
        name: source.name,
        brokerUrl: source.brokerUrl,
        options: {
          ...this.options,
          ...(source.options || {}),
        },
        subscriptions: [...(source.subscriptions || [])],
      }));
    }

    return [
      {
        name: "dlyd",
        brokerUrl: DEFAULT_BROKER_URL,
        options: { ...this.options },
        subscriptions: ["mx/symbol/XU100@lvl2"],
      },
      {
        name: "real",
        brokerUrl: DEFAULT_REAL_BROKER_URL,
        options: { ...this.options },
        subscriptions: ["mx/derivative/F_XU0300426"],
      },
    ];
  }

  _connectSource(source) {
    const client = mqtt.connect(source.brokerUrl, source.options);
    this.clients.set(source.name, client);

    return new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        client.removeListener("connect", handleConnect);
        client.removeListener("error", handleError);
      };

      const handleConnect = async () => {
        try {
          client.on("message", this._handleMessage);
          client.on("close", this._handleClose);
          client.on("error", this._handleRuntimeError);
          await Promise.all(
            source.subscriptions.map((topic) => this._subscribeTopic(source.name, topic))
          );

          if (!settled) {
            settled = true;
            cleanup();
            resolve();
          }
        } catch (error) {
          if (!settled) {
            settled = true;
            cleanup();
            reject(error);
          }
        }
      };

      const handleError = (error) => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(error);
        }
      };

      client.once("connect", handleConnect);
      client.once("error", handleError);
    });
  }
}

module.exports = {
  LiveDataClient,
};
