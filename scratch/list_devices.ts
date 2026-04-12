// Simple script to check for Official devices in DB
import pkg from 'pg';
const { Client } = pkg;

async function main() {
  const client = new Client({
    connectionString: "postgresql://postgres:Aldiir0411@localhost:5432/heliumdb?sslmode=disable"
  });
  await client.connect();
  const res = await client.query("SELECT id, name, provider, official_phone_id FROM devices");
  console.log("Devices in DB:");
  console.table(res.rows);
  await client.end();
}

main().catch(console.error);

main().catch(console.error);
