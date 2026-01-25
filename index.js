import express from "express";
import cors from "cors";
import pkg from "pg";

const { Pool } = pkg;

const app = express();
const PORT = process.env.PORT || 10000;

/* CORS */
app.use(cors({
  origin: "https://teamgensourei.github.io",
}));

app.use(express.json());

/* Postgres */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* 動作確認 */
app.get("/", (req, res) => {
  res.send("GENSOUREIKAI SYSTEM ONLINE");
});

/* 登録API */
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.json({ success: false, message: "入力不足" });
  }

  try {
    await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2)",
      [username, password]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "登録失敗" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
