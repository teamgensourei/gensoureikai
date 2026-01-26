import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import pkg from "pg";

const { Pool } = pkg;

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors({
  origin: "https://teamgensourei.github.io",
  methods: ["GET", "POST"],
}));
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================
   DB 初期化（破壊しない）
===================== */
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        member_code TEXT UNIQUE,
        agreed_terms BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("users table ready");
  } catch (err) {
    console.error(err);
  }
}
initDB();

/* =====================
   ユーティリティ
===================== */
function generateMemberCode() {
  return "KR-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

/* =====================
   動作確認
===================== */
app.get("/", (req, res) => {
  res.send("GENSOUREIKAI SYSTEM ONLINE");
});

/* =====================
   登録API（互換あり）
===================== */
app.post("/api/register", async (req, res) => {
  const { username, password, agree } = req.body;

  if (!username || !password) {
    return res.json({ success: false, message: "入力不足" });
  }

  try {
    const hashed = await bcrypt.hash(password, 10);
    const memberCode = generateMemberCode();

    await pool.query(
      `INSERT INTO users (username, password, member_code, agreed_terms)
       VALUES ($1, $2, $3, $4)`,
      [username, hashed, memberCode, !!agree]
    );

    res.json({
      success: true,
      member_code: memberCode,
      message: "還遭員登録が完了しました",
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.json({
        success: false,
        message: "このユーザー名は既に存在します",
      });
    }
    console.error(err);
    res.json({ success: false, message: "登録失敗" });
  }
});

/* =====================
   ログインAPI（新規）
===================== */
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE username = $1",
    [username]
  );

  if (result.rows.length === 0) {
    return res.json({ success: false });
  }

  const user = result.rows[0];
  const ok = await bcrypt.compare(password, user.password);

  if (!ok) {
    return res.json({ success: false });
  }

  res.json({
    success: true,
    member_code: user.member_code,
  });
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
