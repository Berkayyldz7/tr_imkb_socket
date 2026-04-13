const { LiveDataClient } = require("../live_data");

async function main() {
  const client = new LiveDataClient();
  await client.start();

  client.onUpdate((data) => {
    console.log("Yeni veri geldi:");
    console.log("Sembol:", data.symbolCode);
    console.log("Son fiyat:", data.last);
    console.log("Kapanış:", data.dayClose);
  });

  
}

main();
