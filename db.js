const { MongoClient } = require("mongodb");

const uri = "mongodb+srv://petyara11_db_user:VH05EGt8yuQYwFSC@astraguardvpn.j942emt.mongodb.net/?appName=AstraGuardVPN";

const client = new MongoClient(uri);

async function connectDB() {
  if (!client.topology || !client.topology.isConnected()) {
    await client.connect();
    console.log("MongoDB connected");
  }
  return client.db("AstraGuardVPN");
}

module.exports = connectDB;
