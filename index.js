import express from "express";
import cors from "cors";
import pkg from "pg";

const { Pool } = pkg;

/* =====================
   基本設定
===================== */
const app = express();
const PORT = process.env.PORT || 10000;

/* =====================
   CORS 設定
   （GitHub Pages からのみ許可）
===================== */
app.use(cors({
  origin: "https://teamgensourei.github.io",
  methods: ["GET", "POST"],
}));

app.use(express.json());

/* =====================
   Postgres 接続
===================== */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================
   DB 初期化（テーブル自動作成）
===================== */
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("users table ready");
  } catch (err) {
    console.error("DB init error:", err);
  }
}

initDB();

/* =====================
   ルート（動作確認）
===================== */
app.get("/", (req, res) => {
  res.send("GENSOUREIKAI SYSTEM ONLINE");
});

/* =====================
   アカウント登録 API
===================== */
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.json({
      success: false,
      message: "username または password が未入力です",
    });
  }

  try {
    await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2)",
      [username, password]
    );

    res.json({
      success: true,
      message: "還遭員登録が完了しました",
    });
  } catch (err) {
    console.error(err);

    if (err.code === "23505") {
      // UNIQUE 制約違反
      return res.json({
        success: false,
        message: "このユーザー名は既に使用されています",
      });
    }

    res.json({
      success: false,
      message: "登録中にエラーが発生しました",
    });
  }
});

/* =====================
   サーバー起動
===================== */
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
