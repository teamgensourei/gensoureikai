import express from "express";
import pkg from "pg";
import bcrypt from "bcrypt";

const { Pool } = pkg;

const app = express();
app.use(express.json());

// RenderのDATABASE_URLを使う
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 起動確認
app.get("/", (req, res) => {
  res.send("還遭員システム 起動中");
});

// アカウント作成
app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "missing fields" });
    }

    // パスワードをハッシュ化
    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "INSERT INTO accounts (username, password_hash) VALUES ($1, $2) RETURNING id",
      [username, hash]
    );

    res.json({
      success: true,
      id: result.rows[0].id
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
